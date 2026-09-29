import hashlib
import hmac
import json
from datetime import timedelta
from typing import Optional

from app.db.models import Channel, Conversation, Message
from app.providers.base import ChannelError, InboundMessage, WebhookAuthError
from app.providers.whatsapp import graph
from app.services.crypto import decrypt_secret

ATTACHMENT_TYPES = {"image", "video", "audio", "file"}


class MessengerAdapter:
    """
    Messenger Platform adapter for both `messenger` (Facebook Page) and `instagram` (Instagram professional
    account linked to the Page) channels. Channel `config` holds `page_id`, `verify_token`, the encrypted
    `access_token` (Page token) and `app_secret`, plus `ig_id` for Instagram.
    """

    session_window = timedelta(hours=24)

    @staticmethod
    async def fetch_page(page_id: str, access_token: str) -> dict:
        """
        Checks the Page token with Meta and returns the Page's name and linked Instagram account, if any.

        Raises:
            ChannelError: When Meta rejects the token or Page id.
        """
        return await graph("GET", f"/{page_id}", access_token, params={"fields": "name,instagram_business_account{id,username}"})

    def verify_subscription(self, channel: Channel, mode: Optional[str], token: Optional[str], challenge: str) -> str:
        expected = channel.config.get("verify_token")
        if mode != "subscribe" or not expected or not hmac.compare_digest(token or "", expected):
            raise WebhookAuthError("Verify token mismatch")
        return challenge

    def parse_webhook(self, channel: Channel, headers: dict[str, str], raw_body: bytes) -> list[InboundMessage]:
        secret = channel.config.get("app_secret")
        if not secret:
            raise WebhookAuthError("Channel has no app secret")
        expected = "sha256=" + hmac.new(decrypt_secret(secret).encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(headers.get("x-hub-signature-256", ""), expected):
            raise WebhookAuthError("Signature mismatch")

        own_id = self._own_id(channel)
        items = []
        for entry in json.loads(raw_body).get("entry", []):
            for event in entry.get("messaging", []):
                message = event.get("message")
                sender = event.get("sender", {}).get("id")
                if not message or message.get("is_echo") or sender == own_id:
                    continue  # reads, deliveries, postbacks, and our own sends echoed back
                inbound = self._inbound(sender, message)
                if inbound:
                    items.append(inbound)
        return items

    async def send(self, channel: Channel, conversation: Conversation, message: Message) -> str:
        if message.type in ATTACHMENT_TYPES:
            body = {"attachment": {"type": message.type, "payload": {"url": message.content}}}
        else:
            body = {"text": message.content}
        data = await graph(
            "POST", f"/{channel.config.get('page_id')}/messages", self._token(channel),
            json={"recipient": {"id": conversation.external_id}, "messaging_type": "RESPONSE", "message": body},
        )
        return data["message_id"]

    async def lookup_name(self, channel: Channel, customer_id: str) -> Optional[str]:
        """The customer's profile name, or None when Meta won't share it."""
        try:
            data = await graph("GET", f"/{customer_id}", self._token(channel), params={"fields": "name"})
        except ChannelError:
            return None
        return data.get("name")

    @staticmethod
    def _own_id(channel: Channel) -> Optional[str]:
        return channel.config.get("ig_id") if channel.platform == "instagram" else channel.config.get("page_id")

    @staticmethod
    def _token(channel: Channel) -> str:
        if "access_token" not in channel.config:
            raise ChannelError("Channel is not connected")
        return decrypt_secret(channel.config["access_token"])

    @staticmethod
    def _inbound(sender: str, message: dict) -> Optional[InboundMessage]:
        if message.get("text"):
            type_, content = "text", message["text"]
        else:
            # ponytail: first attachment only, stored as a placeholder; keep all once media is downloaded.
            kind = next(iter(message.get("attachments", [])), {}).get("type")
            if kind not in ATTACHMENT_TYPES:
                return None  # stickers/fallbacks/shares: not shown in the inbox yet
            type_, content = kind, f"[{kind}]"
        return InboundMessage(customer_id=sender, content=content, type=type_, message_id=message.get("mid"))
