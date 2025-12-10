"""Test fixtures for YooKassa payment gateway."""
import pytest
from unittest.mock import Mock

from .....plugins.manager import get_plugins_manager
from .....plugins.models import PluginConfiguration
from ....models import Transaction
from .... import TransactionKind
from ..plugin import YooKassaGatewayPlugin


@pytest.fixture
def yookassa_plugin(settings, monkeypatch, channel_USD):
    """Create YooKassa plugin fixture."""
    def fun(
        shop_id=None,
        secret_key=None,
        test_mode=True,
        active=True,
        auto_capture=True,
        supported_currencies="RUB",
    ):
        shop_id = shop_id or "test_shop_id"
        secret_key = secret_key or "test_secret_key"

        settings.PLUGINS = [
            "saleor.payment.gateways.yookassa.plugin.YooKassaGatewayPlugin"
        ]

        configuration = [
            {"name": "shop_id", "value": shop_id},
            {"name": "secret_key", "value": secret_key},
            {"name": "test_mode", "value": test_mode},
            {"name": "automatic_payment_capture", "value": auto_capture},
            {"name": "supported_currencies", "value": supported_currencies},
        ]

        PluginConfiguration.objects.create(
            identifier=YooKassaGatewayPlugin.PLUGIN_ID,
            name=YooKassaGatewayPlugin.PLUGIN_NAME,
            description="",
            active=active,
            channel=channel_USD,
            configuration=configuration,
        )

        manager = get_plugins_manager(allow_replica=False)
        manager.get_all_plugins()
        return manager.plugins_per_channel[channel_USD.slug][0]

    return fun


@pytest.fixture
def mock_yookassa_payment():
    """Mock YooKassa payment response."""
    def fun(status="succeeded", payment_id="test_payment_id"):
        return {
            "id": payment_id,
            "status": status,
            "confirmation_url": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=test_payment_id",
            "amount": {
                "value": "100.00",
                "currency": "RUB",
            },
        }
    return fun


@pytest.fixture
def payment_yookassa_for_checkout(checkout_with_items, address, shipping_method):
    """Create payment for checkout."""
    from .....checkout import calculations
    from .....checkout.fetch import fetch_checkout_info, fetch_checkout_lines
    from ....utils import create_payment

    checkout_with_items.billing_address = address
    checkout_with_items.shipping_address = address
    checkout_with_items.shipping_method = shipping_method
    checkout_with_items.email = "test@example.com"
    checkout_with_items.save()
    manager = get_plugins_manager(allow_replica=False)
    lines, _ = fetch_checkout_lines(checkout_with_items)
    checkout_info = fetch_checkout_info(checkout_with_items, lines, manager)
    total = calculations.calculate_checkout_total_with_gift_cards(
        manager, checkout_info, lines, address
    )
    payment = create_payment(
        gateway=YooKassaGatewayPlugin.PLUGIN_ID,
        payment_token="test_payment_token",
        total=total.gross.amount,
        currency=checkout_with_items.currency,
        email=checkout_with_items.email,
        customer_ip_address="",
        checkout=checkout_with_items,
    )
    return payment


@pytest.fixture
def payment_yookassa_for_order(payment_yookassa_for_checkout, order_with_lines):
    """Create payment for order."""
    payment_yookassa_for_checkout.checkout = None
    payment_yookassa_for_checkout.order = order_with_lines
    payment_yookassa_for_checkout.total = order_with_lines.total_gross_amount
    payment_yookassa_for_checkout.save()

    Transaction.objects.create(
        payment=payment_yookassa_for_checkout,
        action_required=False,
        kind=TransactionKind.AUTH,
        token="test_token",
        is_success=True,
        amount=order_with_lines.total_gross_amount,
        currency=order_with_lines.currency,
        error="",
        gateway_response={},
        action_required_data={},
    )
    return payment_yookassa_for_checkout
