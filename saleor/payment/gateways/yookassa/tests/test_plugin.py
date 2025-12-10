"""Tests for YooKassa payment gateway plugin."""
from decimal import Decimal
from unittest.mock import Mock, patch

import pytest
from django.core.exceptions import ValidationError

from .....plugins.models import PluginConfiguration
from .... import TransactionKind
from ....interface import GatewayResponse
from ..api import YooKassaAPIError
from ..plugin import YooKassaGatewayPlugin


@pytest.mark.parametrize(
    "active",
    [True, False],
)
def test_token_is_required_as_payment_input(active, yookassa_plugin):
    """Test that token is not required as payment input."""
    plugin = yookassa_plugin(active=active)
    result = plugin.token_is_required_as_payment_input(None)
    assert result is False


def test_get_supported_currencies(yookassa_plugin):
    """Test getting supported currencies."""
    plugin = yookassa_plugin(supported_currencies="RUB,USD,EUR")
    result = plugin.get_supported_currencies([])
    assert "RUB" in result
    assert "USD" in result
    assert "EUR" in result


def test_get_supported_currencies_default(yookassa_plugin):
    """Test default supported currencies."""
    plugin = yookassa_plugin(supported_currencies="")
    result = plugin.get_supported_currencies([])
    assert "RUB" in result


def test_get_supported_currencies_inactive(yookassa_plugin):
    """Test that inactive plugin returns previous value."""
    plugin = yookassa_plugin(active=False)
    previous_value = ["USD"]
    result = plugin.get_supported_currencies(previous_value)
    assert result == previous_value


@patch("saleor.payment.gateways.yookassa.plugin.YooKassaAPI")
def test_process_payment_success(mock_api_class, yookassa_plugin, payment_yookassa_for_checkout):
    """Test successful payment processing."""
    mock_api = Mock()
    mock_api_class.return_value = mock_api
    mock_api.create_payment.return_value = {
        "id": "test_payment_id",
        "status": "pending",
        "confirmation_url": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=test_payment_id",
        "amount": {
            "value": "100.00",
            "currency": "RUB",
        },
    }

    plugin = yookassa_plugin(active=True)
    plugin.channel = payment_yookassa_for_checkout.checkout.channel

    from ....utils import create_payment_information

    payment_info = create_payment_information(
        payment=payment_yookassa_for_checkout,
        payment_token="test_token",
    )

    result = plugin.process_payment(payment_info, None)

    assert isinstance(result, GatewayResponse)
    assert result.is_success is True
    assert result.action_required is True
    assert result.kind == TransactionKind.ACTION_TO_CONFIRM
    assert result.transaction_id == "test_payment_id"
    assert "confirmation_url" in result.action_required_data


@patch("saleor.payment.gateways.yookassa.plugin.YooKassaAPI")
def test_process_payment_api_error(mock_api_class, yookassa_plugin, payment_yookassa_for_checkout):
    """Test payment processing with API error."""
    mock_api = Mock()
    mock_api_class.return_value = mock_api
    mock_api.create_payment.side_effect = YooKassaAPIError("API Error")

    plugin = yookassa_plugin(active=True)
    plugin.channel = payment_yookassa_for_checkout.checkout.channel

    from ....utils import create_payment_information

    payment_info = create_payment_information(
        payment=payment_yookassa_for_checkout,
        payment_token="test_token",
    )

    result = plugin.process_payment(payment_info, None)

    assert isinstance(result, GatewayResponse)
    assert result.is_success is False
    assert "API Error" in result.error


@patch("saleor.payment.gateways.yookassa.plugin.YooKassaAPI")
def test_confirm_payment_success(mock_api_class, yookassa_plugin, payment_yookassa_for_checkout):
    """Test successful payment confirmation."""
    mock_api = Mock()
    mock_api_class.return_value = mock_api
    mock_api.get_payment.return_value = {
        "id": "test_payment_id",
        "status": "succeeded",
        "amount": {
            "value": "100.00",
            "currency": "RUB",
        },
    }

    plugin = yookassa_plugin(active=True)

    from ....utils import create_payment_information

    payment_info = create_payment_information(
        payment=payment_yookassa_for_checkout,
        payment_token="test_payment_id",
    )

    result = plugin.confirm_payment(payment_info, None)

    assert isinstance(result, GatewayResponse)
    assert result.is_success is True
    assert result.kind == TransactionKind.CAPTURE
    assert result.transaction_id == "test_payment_id"


@patch("saleor.payment.gateways.yookassa.plugin.YooKassaAPI")
def test_refund_payment_success(mock_api_class, yookassa_plugin, payment_yookassa_for_order):
    """Test successful payment refund."""
    mock_api = Mock()
    mock_api_class.return_value = mock_api
    mock_api.refund_payment.return_value = {
        "id": "test_refund_id",
        "status": "succeeded",
        "amount": {
            "value": "100.00",
            "currency": "RUB",
        },
    }

    plugin = yookassa_plugin(active=True)

    from ....utils import create_payment_information

    payment_info = create_payment_information(
        payment=payment_yookassa_for_order,
        payment_token="test_payment_id",
    )

    result = plugin.refund_payment(payment_info, None)

    assert isinstance(result, GatewayResponse)
    assert result.is_success is True
    assert result.kind == TransactionKind.REFUND
    assert result.transaction_id == "test_refund_id"


@patch("saleor.payment.gateways.yookassa.plugin.YooKassaAPI")
def test_void_payment_success(mock_api_class, yookassa_plugin, payment_yookassa_for_order):
    """Test successful payment void."""
    mock_api = Mock()
    mock_api_class.return_value = mock_api
    mock_api.cancel_payment.return_value = {
        "id": "test_payment_id",
        "status": "canceled",
    }

    plugin = yookassa_plugin(active=True)

    from ....utils import create_payment_information

    payment_info = create_payment_information(
        payment=payment_yookassa_for_order,
        payment_token="test_payment_id",
    )

    result = plugin.void_payment(payment_info, None)

    assert isinstance(result, GatewayResponse)
    assert result.is_success is True
    assert result.kind == TransactionKind.CANCEL
    assert result.transaction_id == "test_payment_id"


def test_validate_plugin_configuration_missing_fields(yookassa_plugin):
    """Test validation with missing required fields."""
    plugin = yookassa_plugin(shop_id=None, secret_key=None, active=True)
    configuration = PluginConfiguration.objects.get()

    for config_field in configuration.configuration:
        if config_field["name"] == "shop_id":
            config_field["value"] = None
        if config_field["name"] == "secret_key":
            config_field["value"] = None

    with pytest.raises(ValidationError):
        plugin.validate_plugin_configuration(configuration)


def test_validate_plugin_configuration_inactive(yookassa_plugin):
    """Test that validation is skipped for inactive plugin."""
    plugin = yookassa_plugin(active=False)
    configuration = PluginConfiguration.objects.get()

    # Should not raise even with missing fields
    plugin.validate_plugin_configuration(configuration)


def test_validate_plugin_configuration_valid(yookassa_plugin):
    """Test validation with valid configuration."""
    plugin = yookassa_plugin(active=True)
    configuration = PluginConfiguration.objects.get()

    # Should not raise with valid config
    plugin.validate_plugin_configuration(configuration)
