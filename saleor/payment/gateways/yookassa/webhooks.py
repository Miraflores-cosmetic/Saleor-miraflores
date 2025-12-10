"""YooKassa webhook handlers."""
import json
import logging
from decimal import Decimal
from typing import cast

from django.core.exceptions import ValidationError
from django.db.models import Prefetch
from django.http import HttpResponse
from yookassa.domain.notification import WebhookNotificationFactory

from ....checkout.calculations import calculate_checkout_total_with_gift_cards
from ....checkout.complete_checkout import complete_checkout
from ....checkout.fetch import fetch_checkout_info, fetch_checkout_lines
from ....checkout.models import Checkout
from ....core.transactions import transaction_with_commit_on_errors
from ....graphql.core import SaleorContext
from ....order.actions import order_charged, order_refunded
from ....order.fetch import fetch_order_info
from ....order.models import Order
from ....plugins.manager import get_plugins_manager
from ... import TransactionKind
from ...gateway import payment_refund_or_void
from ...interface import GatewayConfig, GatewayResponse
from ...models import Payment, Transaction
from ...utils import (
    create_transaction,
    gateway_postprocess,
    price_from_minor_unit,
    try_void_or_refund_inactive_payment,
    update_payment_charge_status,
)
from .consts import (
    WEBHOOK_PAYMENT_CANCELED,
    WEBHOOK_PAYMENT_SUCCEEDED,
    WEBHOOK_PAYMENT_WAITING_FOR_CAPTURE,
)

logger = logging.getLogger(__name__)


@transaction_with_commit_on_errors()
def handle_webhook(
    request: SaleorContext, gateway_config: "GatewayConfig", channel_slug: str
):
    """Handle webhook requests from YooKassa."""
    try:
        payload = request.body.decode("utf-8")
        event_dict = json.loads(payload)

        # Validate webhook using YooKassa SDK
        notification = WebhookNotificationFactory().create(event_dict)
        payment_object = notification.object

        event_type = notification.event
        payment_id = payment_object.id

        # Convert payment object to dict for easier handling
        payment_data = {
            "id": payment_object.id,
            "status": payment_object.status,
            "amount": {
                "value": str(payment_object.amount.value),
                "currency": payment_object.amount.currency,
            },
            "paid": getattr(payment_object, "paid", False),
            "cancelled_at": payment_object.cancelled_at.isoformat()
            if hasattr(payment_object, "cancelled_at") and payment_object.cancelled_at
            else None,
            "created_at": payment_object.created_at.isoformat()
            if hasattr(payment_object, "created_at") and payment_object.created_at
            else None,
        }

        logger.info(
            "Received YooKassa webhook",
            extra={
                "event_type": event_type,
                "payment_id": payment_id,
                "channel_slug": channel_slug,
            },
        )

        webhook_handlers = {
            WEBHOOK_PAYMENT_SUCCEEDED: handle_successful_payment,
            WEBHOOK_PAYMENT_CANCELED: handle_canceled_payment,
            WEBHOOK_PAYMENT_WAITING_FOR_CAPTURE: handle_waiting_for_capture_payment,
        }

        if event_type in webhook_handlers:
            webhook_handlers[event_type](payment_data, gateway_config, channel_slug)
        else:
            logger.warning(
                "Received unhandled YooKassa webhook event",
                extra={"event_type": event_type},
            )

        return HttpResponse(status=200)

    except json.JSONDecodeError as e:
        logger.warning(
            "Invalid JSON in YooKassa webhook",
            extra={"error": str(e)},
        )
        return HttpResponse(status=400)
    except Exception as e:
        logger.error(
            "Error processing YooKassa webhook",
            extra={"error": str(e)},
            exc_info=True,
        )
        return HttpResponse(status=500)


def _get_payment(payment_id: str, with_lock: bool = True) -> Payment | None:
    """Get payment by YooKassa payment ID."""
    qs = Payment.objects.prefetch_related(
        Prefetch("checkout", queryset=Checkout.objects.select_related("channel")),
        Prefetch("order", queryset=Order.objects.select_related("channel")),
    )
    if with_lock:
        qs = qs.select_for_update(of=("self",))
    return qs.filter(transactions__token=payment_id).first()


def _get_checkout(payment_id: int) -> Checkout | None:
    """Get checkout by payment ID."""
    return (
        Checkout.objects.prefetch_related("payments")
        .select_for_update(of=("self",))
        .filter(payments__id=payment_id, payments__is_active=True)
        .first()
    )


def _channel_slug_is_different_from_payment_channel_slug(
    channel_slug: str, payment: Payment
) -> bool:
    """Check if channel slug differs from payment channel."""
    checkout = payment.checkout
    order = payment.order
    if checkout is not None:
        return channel_slug != checkout.channel.slug
    if order is not None:
        return channel_slug != order.channel.slug
    logger.warning(
        "Both payment.checkout and payment.order cannot be None",
        extra={"payment_id": payment.id},
    )
    return True


def _update_payment_with_new_transaction(
    payment: Payment,
    payment_object: dict,
    kind: str,
    amount_value: str,
    currency: str,
):
    """Update payment with new transaction."""
    gateway_response = GatewayResponse(
        kind=kind,
        action_required=False,
        transaction_id=payment_object["id"],
        is_success=True,
        amount=price_from_minor_unit(Decimal(amount_value), currency),
        currency=currency,
        error=None,
        raw_response=payment_object,
        psp_reference=payment_object["id"],
    )
    transaction = create_transaction(
        payment,
        kind=kind,
        payment_information=None,
        action_required=False,
        gateway_response=gateway_response,
    )
    gateway_postprocess(transaction, payment)
    return transaction


def _get_or_create_transaction(
    payment: Payment, payment_object: dict, kind: str, amount_value: str, currency: str
):
    """Get or create transaction for payment."""
    transaction = payment.transactions.filter(
        token=payment_object["id"],
        action_required=False,
        is_success=True,
        kind=kind,
    ).last()
    if not transaction:
        transaction = _update_payment_with_new_transaction(
            payment, payment_object, kind, amount_value, currency
        )
    return transaction


def _finalize_checkout(
    checkout: Checkout,
    payment: Payment,
    payment_object: dict,
    kind: str,
    amount_value: str,
    currency: str,
):
    """Finalize checkout after successful payment."""
    gateway_response = GatewayResponse(
        kind=kind,
        action_required=False,
        transaction_id=payment_object["id"],
        is_success=True,
        amount=price_from_minor_unit(Decimal(amount_value), currency),
        currency=currency,
        error=None,
        raw_response=payment_object,
        psp_reference=payment_object["id"],
    )

    transaction = Transaction.objects.filter(
        payment_id=payment.id,
        is_success=True,
        action_required=False,
        kind=kind,
    ).first()

    if not transaction:
        transaction = create_transaction(
            payment,
            kind=kind,
            payment_information=None,
            action_required=False,
            gateway_response=gateway_response,
        )
        update_payment_charge_status(payment, transaction)
        payment.refresh_from_db()
        checkout.refresh_from_db()

    manager = get_plugins_manager(allow_replica=False)
    lines, unavailable_variant_pks = fetch_checkout_lines(checkout)
    if unavailable_variant_pks:
        payment_refund_or_void(payment, manager, checkout.channel.slug)
        raise ValidationError("Some of the checkout lines variants are unavailable.")
    checkout_info = fetch_checkout_info(checkout, lines, manager)
    checkout_total = calculate_checkout_total_with_gift_cards(
        manager=manager,
        checkout_info=checkout_info,
        lines=lines,
        address=checkout.shipping_address or checkout.billing_address,
    )

    try:
        if checkout_total.gross.amount > payment.total:
            payment_refund_or_void(payment, manager, checkout_info.channel.slug)
            raise ValidationError(
                "Cannot complete checkout - payment doesn't cover the checkout total."
            )

        order, _, _ = complete_checkout(
            checkout_info=checkout_info,
            lines=lines,
            manager=manager,
            payment_data={},
            store_source=False,
            user=checkout.user or None,
            app=None,
        )
        logger.info(
            "Checkout finalized successfully",
            extra={"checkout_id": checkout.id, "order_id": order.id},
        )
    except ValidationError as e:
        logger.info(
            "Failed to complete checkout %s.", checkout.pk, extra={"error": str(e)}
        )


def handle_successful_payment(
    payment_object: dict, gateway_config: "GatewayConfig", channel_slug: str
):
    """Handle successful payment webhook."""
    payment_id = payment_object["id"]
    payment = _get_payment(payment_id, with_lock=False)

    if not payment:
        logger.warning(
            "Payment for YooKassa payment was not found",
            extra={"payment_id": payment_id},
        )
        return

    checkout = _get_checkout(payment.id)
    payment = _get_payment(payment_id, with_lock=True)
    payment = cast(Payment, payment)

    if _channel_slug_is_different_from_payment_channel_slug(channel_slug, payment):
        return

    amount_value = payment_object["amount"]["value"]
    currency = payment_object["amount"]["currency"]

    if not payment.is_active:
        transaction = _get_or_create_transaction(
            payment,
            payment_object,
            TransactionKind.CAPTURE,
            amount_value,
            currency,
        )
        try_void_or_refund_inactive_payment(
            payment, transaction, get_plugins_manager(allow_replica=False)
        )
        return

    if payment.order:
        transaction = _get_or_create_transaction(
            payment,
            payment_object,
            TransactionKind.CAPTURE,
            amount_value,
            currency,
        )
        order = cast(Order, payment.order)
        order_info = fetch_order_info(order)
        order_charged(
            order_info=order_info,
            user=None,
            app=None,
            amount=price_from_minor_unit(Decimal(amount_value), currency),
            payment=payment,
        )
        logger.info(
            "Order payment charged",
            extra={"order_id": order.id, "payment_id": payment_id},
        )
    elif checkout:
        _finalize_checkout(
            checkout,
            payment,
            payment_object,
            TransactionKind.CAPTURE,
            amount_value,
            currency,
        )


def handle_canceled_payment(
    payment_object: dict, gateway_config: "GatewayConfig", channel_slug: str
):
    """Handle canceled payment webhook."""
    payment_id = payment_object["id"]
    payment = _get_payment(payment_id, with_lock=True)

    if not payment:
        logger.warning(
            "Payment for YooKassa payment was not found",
            extra={"payment_id": payment_id},
        )
        return

    if _channel_slug_is_different_from_payment_channel_slug(channel_slug, payment):
        return

    amount_value = payment_object["amount"]["value"]
    currency = payment_object["amount"]["currency"]

    transaction = _get_or_create_transaction(
        payment,
        payment_object,
        TransactionKind.CANCEL,
        amount_value,
        currency,
    )

    logger.info(
        "Payment canceled",
        extra={"payment_id": payment_id, "transaction_id": transaction.id},
    )


def handle_waiting_for_capture_payment(
    payment_object: dict, gateway_config: "GatewayConfig", channel_slug: str
):
    """Handle payment waiting for capture webhook."""
    payment_id = payment_object["id"]
    payment = _get_payment(payment_id, with_lock=True)

    if not payment:
        logger.warning(
            "Payment for YooKassa payment was not found",
            extra={"payment_id": payment_id},
        )
        return

    if _channel_slug_is_different_from_payment_channel_slug(channel_slug, payment):
        return

    amount_value = payment_object["amount"]["value"]
    currency = payment_object["amount"]["currency"]

    transaction = _get_or_create_transaction(
        payment,
        payment_object,
        TransactionKind.AUTH,
        amount_value,
        currency,
    )

    logger.info(
        "Payment waiting for capture",
        extra={"payment_id": payment_id, "transaction_id": transaction.id},
    )
