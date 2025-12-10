"""YooKassa payment gateway plugin."""
import logging
from decimal import Decimal
from typing import TYPE_CHECKING

from django.core.exceptions import ValidationError
from django.http import HttpResponse, HttpResponseNotFound
from django.urls import reverse

from ....core.utils import build_absolute_uri, get_domain
from ....graphql.core import SaleorContext
from ....graphql.core.enums import PluginErrorCode
from ....plugins.base_plugin import BasePlugin, ConfigurationTypeField
from ... import PaymentError, TransactionKind
from ...interface import (
    GatewayConfig,
    GatewayResponse,
    PaymentData,
    PaymentMethodInfo,
)
from ...models import Transaction
from ...utils import price_from_minor_unit
from .api import YooKassaAPI, YooKassaAPIError
from .consts import (
    ACTION_REQUIRED_STATUSES,
    FAILED_STATUSES,
    PLUGIN_DESCRIPTION,
    PLUGIN_ID,
    PLUGIN_NAME,
    SUCCESS_STATUSES,
    WEBHOOK_PATH,
)
from .webhooks import handle_webhook

if TYPE_CHECKING:
    from ....plugins.models import PluginConfiguration

logger = logging.getLogger(__name__)


class YooKassaGatewayPlugin(BasePlugin):
    """YooKassa payment gateway plugin."""

    PLUGIN_NAME = PLUGIN_NAME
    PLUGIN_DESCRIPTION = PLUGIN_DESCRIPTION
    PLUGIN_ID = PLUGIN_ID
    DEFAULT_CONFIGURATION = [
        {"name": "shop_id", "value": None},
        {"name": "secret_key", "value": None},
        {"name": "test_mode", "value": True},
        {"name": "automatic_payment_capture", "value": True},
        {"name": "supported_currencies", "value": "RUB"},
    ]

    CONFIG_STRUCTURE = {
        "shop_id": {
            "type": ConfigurationTypeField.STRING,
            "help_text": "Provide YooKassa shop ID.",
            "label": "Shop ID",
        },
        "secret_key": {
            "type": ConfigurationTypeField.SECRET,
            "help_text": "Provide YooKassa secret key.",
            "label": "Secret key",
        },
        "test_mode": {
            "type": ConfigurationTypeField.BOOLEAN,
            "help_text": "Enable test mode for YooKassa.",
            "label": "Test mode",
        },
        "automatic_payment_capture": {
            "type": ConfigurationTypeField.BOOLEAN,
            "help_text": "Determines if Saleor should automatically capture payments.",
            "label": "Automatic payment capture",
        },
        "supported_currencies": {
            "type": ConfigurationTypeField.STRING,
            "help_text": "Determines currencies supported by gateway. "
            "Please enter currency codes separated by a comma.",
            "label": "Supported currencies",
        },
    }

    def __init__(self, *, configuration, **kwargs):
        super().__init__(configuration=configuration, **kwargs)
        configuration = {item["name"]: item["value"] for item in self.configuration}
        self.config = GatewayConfig(
            gateway_name=PLUGIN_NAME,
            auto_capture=configuration["automatic_payment_capture"],
            supported_currencies=configuration["supported_currencies"],
            connection_params={
                "shop_id": configuration["shop_id"],
                "secret_key": configuration["secret_key"],
                "test_mode": configuration["test_mode"],
            },
            store_customer=False,
        )

    def webhook(
        self, request: SaleorContext, path: str, previous_value
    ) -> HttpResponse:
        """Handle webhook requests from YooKassa."""
        if not self.channel:
            return HttpResponseNotFound()
        if path.startswith(WEBHOOK_PATH, 1):  # 1 as we don't check the '/'
            return handle_webhook(request, self.config, self.channel.slug)
        logger.warning(
            "Received request to incorrect yookassa path", extra={"path": path}
        )
        return HttpResponseNotFound()

    def token_is_required_as_payment_input(self, previous_value):
        """YooKassa doesn't require token as payment input."""
        if not self.active:
            return previous_value
        return False

    def get_supported_currencies(self, previous_value):
        """Get list of supported currencies."""
        if not self.active:
            return previous_value
        currencies = self.config.supported_currencies
        if currencies:
            return [c.strip().upper() for c in currencies.split(",")]
        return ["RUB"]  # Default to RUB

    @property
    def order_auto_confirmation(self):
        """Check if order should be auto-confirmed."""
        if not self.channel:
            return False
        return self.channel.automatically_confirm_all_new_orders

    def _get_api_client(self) -> YooKassaAPI:
        """Create and return YooKassa API client."""
        return YooKassaAPI(
            shop_id=self.config.connection_params["shop_id"],
            secret_key=self.config.connection_params["secret_key"],
            test_mode=self.config.connection_params["test_mode"],
        )

    def _get_transaction_kind_for_status(self, status: str) -> tuple[str, bool]:
        """Map YooKassa payment status to Saleor transaction kind.

        Returns:
            Tuple of (transaction_kind, action_required)
        """
        if status in ACTION_REQUIRED_STATUSES:
            return TransactionKind.ACTION_TO_CONFIRM, True
        elif status in SUCCESS_STATUSES:
            return TransactionKind.CAPTURE, False
        elif status in FAILED_STATUSES:
            return TransactionKind.CANCEL, False
        else:
            return TransactionKind.PENDING, False

    def _build_return_url(self, payment_id: str) -> str:
        """Build return URL for payment confirmation."""
        if not self.channel:
            raise PaymentError("Channel is not set")
        api_path = reverse(
            "plugins-per-channel",
            kwargs={"plugin_id": PLUGIN_ID, "channel_slug": self.channel.slug},
        )
        base_url = build_absolute_uri(api_path)
        return f"{base_url}return/?payment_id={payment_id}"

    def process_payment(
        self, payment_information: "PaymentData", previous_value
    ) -> "GatewayResponse":
        """Process payment through YooKassa."""
        if not self.active:
            return previous_value

        api = self._get_api_client()
        auto_capture = self.config.auto_capture
        if self.order_auto_confirmation is False:
            auto_capture = False

        try:
            return_url = self._build_return_url(payment_information.graphql_payment_id)
            if payment_information.return_url:
                return_url = payment_information.return_url

            payment_data = api.create_payment(
                amount=payment_information.amount,
                currency=payment_information.currency,
                order_id=payment_information.graphql_payment_id or str(
                    payment_information.payment_id
                ),
                return_url=return_url,
                description=f"Order {payment_information.graphql_payment_id}",
                metadata={
                    **payment_information.payment_metadata,
                    "channel": self.channel.slug if self.channel else "",
                    "payment_id": payment_information.graphql_payment_id,
                },
            )

            transaction_kind, action_required = self._get_transaction_kind_for_status(
                payment_data["status"]
            )

            return GatewayResponse(
                is_success=True,
                action_required=action_required,
                kind=transaction_kind,
                amount=payment_information.amount,
                currency=payment_information.currency,
                transaction_id=payment_data["id"],
                error=None,
                raw_response=payment_data,
                action_required_data={
                    "confirmation_url": payment_data.get("confirmation_url"),
                    "payment_id": payment_data["id"],
                },
                psp_reference=payment_data["id"],
            )
        except YooKassaAPIError as e:
            logger.error(
                "YooKassa payment processing failed",
                extra={
                    "error": str(e),
                    "payment_id": payment_information.graphql_payment_id,
                },
            )
            return GatewayResponse(
                is_success=False,
                action_required=False,
                kind=TransactionKind.ACTION_TO_CONFIRM,
                amount=payment_information.amount,
                currency=payment_information.currency,
                transaction_id="",
                error=str(e),
                raw_response=None,
            )

    def confirm_payment(
        self, payment_information: "PaymentData", previous_value
    ) -> "GatewayResponse":
        """Confirm payment after redirect from YooKassa."""
        if not self.active:
            return previous_value

        payment_id = payment_information.token
        if not payment_id:
            raise PaymentError("Cannot find a payment reference to confirm.")

        # Check if transaction was already processed by webhook
        payment_transaction = Transaction.objects.filter(
            payment_id=payment_information.payment_id,
            is_success=True,
            action_required=False,
            kind__in=[
                TransactionKind.AUTH,
                TransactionKind.CAPTURE,
                TransactionKind.PENDING,
            ],
        ).first()

        if payment_transaction:
            return GatewayResponse(
                is_success=True,
                action_required=False,
                kind=payment_transaction.kind,
                amount=payment_transaction.amount,
                currency=payment_transaction.currency,
                transaction_id=payment_transaction.token,
                error=None,
                raw_response=payment_transaction.gateway_response,
                transaction_already_processed=True,
            )

        api = self._get_api_client()
        payment_data = api.get_payment(payment_id)

        if not payment_data:
            return GatewayResponse(
                is_success=False,
                action_required=False,
                kind=TransactionKind.ACTION_TO_CONFIRM,
                amount=payment_information.amount,
                currency=payment_information.currency,
                transaction_id=payment_id,
                error="Payment not found in YooKassa",
                raw_response=None,
            )

        transaction_kind, action_required = self._get_transaction_kind_for_status(
            payment_data["status"]
        )

        amount = price_from_minor_unit(
            Decimal(payment_data["amount"]["value"]),
            payment_data["amount"]["currency"],
        )

        return GatewayResponse(
            is_success=True,
            action_required=action_required,
            kind=transaction_kind,
            amount=amount,
            currency=payment_data["amount"]["currency"],
            transaction_id=payment_data["id"],
            error=None,
            raw_response=payment_data,
            psp_reference=payment_data["id"],
        )

    def refund_payment(
        self, payment_information: "PaymentData", previous_value
    ) -> "GatewayResponse":
        """Refund a payment through YooKassa."""
        if not self.active:
            return previous_value

        payment_id = payment_information.token
        if not payment_id:
            raise PaymentError("Cannot find a payment reference to refund.")

        api = self._get_api_client()
        refund_data = api.refund_payment(
            payment_id=payment_id,
            amount=payment_information.amount,
            currency=payment_information.currency,
        )

        if not refund_data:
            return GatewayResponse(
                is_success=False,
                action_required=False,
                kind=TransactionKind.REFUND,
                amount=payment_information.amount,
                currency=payment_information.currency,
                transaction_id="",
                error="Failed to refund payment",
                raw_response=None,
            )

        return GatewayResponse(
            is_success=True,
            action_required=False,
            kind=TransactionKind.REFUND,
            amount=payment_information.amount,
            currency=payment_information.currency,
            transaction_id=refund_data["id"],
            error=None,
            raw_response=refund_data,
            psp_reference=refund_data["id"],
        )

    def void_payment(
        self, payment_information: "PaymentData", previous_value
    ) -> "GatewayResponse":
        """Cancel/void a payment through YooKassa."""
        if not self.active:
            return previous_value

        payment_id = payment_information.token
        if not payment_id:
            raise PaymentError("Cannot find a payment reference to void.")

        api = self._get_api_client()
        cancel_data = api.cancel_payment(payment_id)

        if not cancel_data:
            return GatewayResponse(
                is_success=False,
                action_required=False,
                kind=TransactionKind.CANCEL,
                amount=payment_information.amount,
                currency=payment_information.currency,
                transaction_id="",
                error="Failed to cancel payment",
                raw_response=None,
            )

        return GatewayResponse(
            is_success=True,
            action_required=False,
            kind=TransactionKind.CANCEL,
            amount=payment_information.amount,
            currency=payment_information.currency,
            transaction_id=cancel_data["id"],
            error=None,
            raw_response=cancel_data,
            psp_reference=cancel_data["id"],
        )

    def validate_plugin_configuration(
        self, plugin_configuration: "PluginConfiguration", previous_value
    ):
        """Validate plugin configuration."""
        if not plugin_configuration.active:
            return previous_value

        configuration = {
            item["name"]: item["value"] for item in plugin_configuration.configuration
        }

        shop_id = configuration.get("shop_id")
        secret_key = configuration.get("secret_key")

        if not shop_id or not secret_key:
            raise ValidationError(
                {
                    "shop_id": ValidationError(
                        "Shop ID and Secret Key are required.",
                        code=PluginErrorCode.INVALID.value,
                    )
                }
            )

        return previous_value
