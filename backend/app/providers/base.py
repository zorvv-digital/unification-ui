"""
Channel adapter contract shared by the inbox and every channel provider.

Required: `send(channel, conversation, message) -> external_id` and
`parse_webhook(channel, headers, raw_body) -> list[InboundMessage | StatusUpdate]`.
Optional, used when present: `verify_subscription(channel, mode, token, challenge) -> str`,
`session_window: timedelta`, `list_templates(channel)`, and `send_template(channel, conversation, template, parameters)`.
"""

from dataclasses import dataclass
from typing import Optional


class ChannelError(Exception):
    """Raised by an adapter when the channel refuses or fails to deliver a message."""


class WebhookAuthError(Exception):
    """Raised by an adapter when an inbound event fails its authenticity check."""


@dataclass
class InboundMessage:
    customer_id: str
    content: str
    type: str = "text"
    name: Optional[str] = None
    message_id: Optional[str] = None


@dataclass
class StatusUpdate:
    """A delivery status reported by the channel for one of our outbound messages."""
    external_id: str
    status: str
