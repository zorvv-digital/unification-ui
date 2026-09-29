import uuid

from app.db.models import Channel, Conversation, Message
from app.providers.base import InboundMessage, WebhookAuthError


class WebsiteAdapter:
    """
    The embeddable website chat widget. Replies reach the visitor through the visitor event stream
    (see `InboxService._publish`), so sending never leaves the server; visitors post through the widget API,
    never through `/webhooks`. Channel `config` holds `widget_key`, `allowed_domains`, `greeting`, `lead_fields`.
    """

    async def send(self, channel: Channel, conversation: Conversation, message: Message) -> str:
        return f"web-{uuid.uuid4().hex}"

    def parse_webhook(self, channel: Channel, headers: dict[str, str], raw_body: bytes) -> list[InboundMessage]:
        raise WebhookAuthError("Website chat receives messages through the widget API")
