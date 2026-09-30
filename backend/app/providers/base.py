"""
Channel adapter contract shared by the inbox and every channel provider.

Required: `send(channel, conversation, message) -> external_id` and
`parse_webhook(channel, headers, raw_body) -> list[InboundMessage | StatusUpdate]`.
Optional, used when present: `verify_subscription(channel, mode, token, challenge) -> str`,
`session_window: timedelta`, `list_templates(channel)`, `send_template(channel, conversation, template, parameters)`,
`async lookup_name(channel, customer_id) -> Optional[str]` for channels whose webhooks carry no names, and
`async fetch_new(channel) -> list[InboundMessage]` for polled channels (Gmail).
"""

from dataclasses import dataclass
from typing import Optional


class ChannelError(Exception):
    """Raised by an adapter when the channel refuses or fails to deliver a message."""


class TokenError(ChannelError):
    """Raised when the channel's access token is expired or revoked; the channel must be reconnected."""


class WebhookAuthError(Exception):
    """Raised by an adapter when an inbound event fails its authenticity check."""


@dataclass
class InboundMessage:
    customer_id: str
    content: str
    type: str = "text"
    name: Optional[str] = None
    message_id: Optional[str] = None
    thread_id: Optional[str] = None  # conversation key when a channel threads (email); defaults to customer_id
    subject: Optional[str] = None
    email: Optional[str] = None  # identifies the contact across conversations
    phone: Optional[str] = None  # stored on a new contact
    username: Optional[str] = None  # stored on a new contact


@dataclass
class StatusUpdate:
    """A delivery status reported by the channel for one of our outbound messages."""
    external_id: str
    status: str
