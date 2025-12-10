"""Constants for YooKassa payment gateway plugin."""

PLUGIN_ID = "saleor.payments.yookassa"
PLUGIN_NAME = "YooKassa"
PLUGIN_DESCRIPTION = """
YooKassa payment gateway plugin for accepting payments via cards, SBP, and e-wallets.
Supports test and production modes.
"""

WEBHOOK_PATH = "webhooks/"

# YooKassa payment statuses
PAYMENT_STATUS_PENDING = "pending"
PAYMENT_STATUS_WAITING_FOR_CAPTURE = "waiting_for_capture"
PAYMENT_STATUS_SUCCEEDED = "succeeded"
PAYMENT_STATUS_CANCELED = "canceled"

# Transaction kinds mapping
ACTION_REQUIRED_STATUSES = [PAYMENT_STATUS_PENDING, PAYMENT_STATUS_WAITING_FOR_CAPTURE]
SUCCESS_STATUSES = [PAYMENT_STATUS_SUCCEEDED]
FAILED_STATUSES = [PAYMENT_STATUS_CANCELED]

# Webhook event types
WEBHOOK_PAYMENT_SUCCEEDED = "payment.succeeded"
WEBHOOK_PAYMENT_CANCELED = "payment.canceled"
WEBHOOK_PAYMENT_WAITING_FOR_CAPTURE = "payment.waiting_for_capture"

WEBHOOK_EVENTS = [
    WEBHOOK_PAYMENT_SUCCEEDED,
    WEBHOOK_PAYMENT_CANCELED,
    WEBHOOK_PAYMENT_WAITING_FOR_CAPTURE,
]
