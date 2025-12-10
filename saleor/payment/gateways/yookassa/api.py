"""YooKassa API client."""
import logging
from decimal import Decimal
from typing import Any, Optional
from uuid import uuid4

from yookassa import Configuration, Payment
from yookassa.domain.exceptions import ApiError, AuthorizeError

from ....core.tracing import otel_trace
from ....core.utils import build_absolute_uri
from ...utils import price_to_minor_unit

logger = logging.getLogger(__name__)


class YooKassaAPIError(Exception):
    """Base exception for YooKassa API errors."""

    pass


class YooKassaAPI:
    """Client for interacting with YooKassa API."""

    def __init__(self, shop_id: str, secret_key: str, test_mode: bool = True):
        """Initialize YooKassa API client.

        Args:
            shop_id: YooKassa shop ID
            secret_key: YooKassa secret key
            test_mode: Whether to use test mode
        """
        Configuration.account_id = shop_id
        Configuration.secret_key = secret_key
        self.test_mode = test_mode

    @otel_trace(span_name="yookassa.create_payment", component_name="payment")
    def create_payment(
        self,
        amount: Decimal,
        currency: str,
        order_id: str,
        return_url: str,
        description: Optional[str] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Create a payment in YooKassa.

        Args:
            amount: Payment amount
            currency: Payment currency (e.g., 'RUB')
            order_id: Order identifier
            return_url: URL to redirect after payment
            description: Payment description
            metadata: Additional metadata

        Returns:
            Payment object from YooKassa

        Raises:
            YooKassaAPIError: If payment creation fails
        """
        try:
            idempotence_key = str(uuid4())
            amount_value = str(amount.quantize(Decimal("0.01")))

            payment_data = {
                "amount": {
                    "value": amount_value,
                    "currency": currency.upper(),
                },
                "confirmation": {
                    "type": "redirect",
                    "return_url": return_url,
                },
                "capture": True,
                "description": description or f"Order {order_id}",
                "metadata": {
                    "order_id": str(order_id),
                    **(metadata or {}),
                },
            }

            payment = Payment.create(payment_data, idempotence_key)

            logger.info(
                "YooKassa payment created",
                extra={
                    "payment_id": payment.id,
                    "order_id": order_id,
                    "amount": amount_value,
                    "currency": currency,
                },
            )

            confirmation_url = None
            if hasattr(payment, "confirmation") and payment.confirmation:
                if hasattr(payment.confirmation, "confirmation_url"):
                    confirmation_url = payment.confirmation.confirmation_url

            return {
                "id": payment.id,
                "status": payment.status,
                "confirmation_url": confirmation_url,
                "amount": {
                    "value": str(payment.amount.value),
                    "currency": payment.amount.currency,
                },
            }
        except (ApiError, AuthorizeError) as e:
            logger.error(
                "Failed to create YooKassa payment",
                extra={
                    "error": str(e),
                    "order_id": order_id,
                },
            )
            raise YooKassaAPIError(f"Failed to create payment: {str(e)}") from e

    @otel_trace(span_name="yookassa.get_payment", component_name="payment")
    def get_payment(self, payment_id: str) -> Optional[dict[str, Any]]:
        """Get payment information from YooKassa.

        Args:
            payment_id: YooKassa payment ID

        Returns:
            Payment object or None if not found
        """
        try:
            payment = Payment.find_one(payment_id)
            return {
                "id": payment.id,
                "status": payment.status,
                "amount": {
                    "value": str(payment.amount.value),
                    "currency": payment.amount.currency,
                },
                "paid": getattr(payment, "paid", False),
                "cancelled_at": payment.cancelled_at.isoformat()
                if hasattr(payment, "cancelled_at") and payment.cancelled_at
                else None,
                "created_at": payment.created_at.isoformat()
                if hasattr(payment, "created_at") and payment.created_at
                else None,
            }
        except (ApiError, AuthorizeError) as e:
            logger.error(
                "Failed to get YooKassa payment",
                extra={
                    "error": str(e),
                    "payment_id": payment_id,
                },
            )
            return None

    @otel_trace(span_name="yookassa.cancel_payment", component_name="payment")
    def cancel_payment(self, payment_id: str) -> Optional[dict[str, Any]]:
        """Cancel a payment in YooKassa.

        Args:
            payment_id: YooKassa payment ID

        Returns:
            Updated payment object or None if cancellation fails
        """
        try:
            idempotence_key = str(uuid4())
            payment = Payment.cancel(payment_id, idempotence_key)
            return {
                "id": payment.id,
                "status": payment.status,
                "amount": {
                    "value": str(payment.amount.value),
                    "currency": payment.amount.currency,
                },
            }
        except (ApiError, AuthorizeError) as e:
            logger.error(
                "Failed to cancel YooKassa payment",
                extra={
                    "error": str(e),
                    "payment_id": payment_id,
                },
            )
            return None

    @otel_trace(span_name="yookassa.refund_payment", component_name="payment")
    def refund_payment(
        self, payment_id: str, amount: Decimal, currency: str
    ) -> Optional[dict[str, Any]]:
        """Refund a payment in YooKassa.

        Args:
            payment_id: YooKassa payment ID
            amount: Refund amount
            currency: Currency code

        Returns:
            Refund object or None if refund fails
        """
        try:
            from yookassa import Refund

            idempotence_key = str(uuid4())
            amount_value = str(amount.quantize(Decimal("0.01")))

            refund = Refund.create(
                {
                    "amount": {
                        "value": amount_value,
                        "currency": currency.upper(),
                    },
                    "payment_id": payment_id,
                },
                idempotence_key,
            )

            return {
                "id": refund.id,
                "status": refund.status,
                "amount": {
                    "value": str(refund.amount.value),
                    "currency": refund.amount.currency,
                },
            }
        except (ApiError, AuthorizeError) as e:
            logger.error(
                "Failed to refund YooKassa payment",
                extra={
                    "error": str(e),
                    "payment_id": payment_id,
                },
            )
            return None
