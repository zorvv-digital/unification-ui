import hashlib
import hmac
import json
import re
from datetime import timedelta
from typing import Any, Optional, Union

import httpx

from app.config.settings import settings
from app.db.models import Channel, Conversation, Message
from app.models.schemas import TemplateResponse
from app.providers.base import ChannelError, InboundMessage, StatusUpdate, TokenError, WebhookAuthError
from app.services.crypto import decrypt_secret

# Tests swap in httpx.MockTransport here.
_transport: Optional[httpx.AsyncBaseTransport] = None

INBOUND_MEDIA = {"image": "image", "video": "video", "audio": "audio", "document": "file"}
OUTBOUND_MEDIA = {"image": "image", "video": "video", "audio": "audio", "file": "document"}
PLACEHOLDER = re.compile(r"\{\{(\d+)\}\}")


async def graph(method: str, path: str, token: str, **kwargs: Any) -> dict:
    """
    Calls Meta's Graph API.

    Raises:
        TokenError: When Meta reports the access token as invalid, expired, or revoked (error code 190).
        ChannelError: On network failure or any other Meta error response, carrying Meta's message.
    """
    try:
        async with httpx.AsyncClient(base_url=settings.META_GRAPH_URL, transport=_transport, timeout=20) as client:
            response = await client.request(method, path, headers={"Authorization": f"Bearer {token}"}, **kwargs)
    except httpx.HTTPError as exc:
        raise ChannelError(f"Meta API unreachable: {exc}") from exc
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.is_error:
        error = data.get("error", {})
        message = error.get("message") or f"Meta API error {response.status_code}"
        raise TokenError(message) if error.get("code") == 190 else ChannelError(message)
    return data


class WhatsAppAdapter:
    """
    WhatsApp Cloud API adapter. Channel `config` holds `phone_number_id`, `waba_id`, `verify_token`,
    and the encrypted `access_token` and `app_secret`.
    """

    session_window = timedelta(hours=24)

    @staticmethod
    async def verify_credentials(phone_number_id: str, access_token: str) -> str:
        """
        Checks the credentials with Meta and returns the number's display form.

        Raises:
            ChannelError: When Meta rejects the credentials.
        """
        data = await graph("GET", f"/{phone_number_id}", access_token, params={"fields": "display_phone_number,verified_name"})
        return data.get("display_phone_number") or phone_number_id

    def verify_subscription(self, channel: Channel, mode: Optional[str], token: Optional[str], challenge: str) -> str:
        expected = channel.config.get("verify_token")
        if mode != "subscribe" or not expected or not hmac.compare_digest(token or "", expected):
            raise WebhookAuthError("Verify token mismatch")
        return challenge

    def parse_webhook(self, channel: Channel, headers: dict[str, str], raw_body: bytes) -> list[Union[InboundMessage, StatusUpdate]]:
        secret = channel.config.get("app_secret")
        if not secret:
            raise WebhookAuthError("Channel has no app secret")
        expected = "sha256=" + hmac.new(decrypt_secret(secret).encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(headers.get("x-hub-signature-256", ""), expected):
            raise WebhookAuthError("Signature mismatch")

        items: list[Union[InboundMessage, StatusUpdate]] = []
        for entry in json.loads(raw_body).get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                names = {c.get("wa_id"): c.get("profile", {}).get("name") for c in value.get("contacts", [])}
                for message in value.get("messages", []):
                    inbound = self._inbound(message, names.get(message.get("from")))
                    if inbound:
                        items.append(inbound)
                items.extend(StatusUpdate(external_id=s["id"], status=s["status"]) for s in value.get("statuses", []))
        return items

    async def send(self, channel: Channel, conversation: Conversation, message: Message) -> str:
        kind = OUTBOUND_MEDIA.get(message.type)
        body = {"type": kind, kind: {"link": message.content}} if kind else {"type": "text", "text": {"body": message.content}}
        return await self._post_message(channel, conversation, body)

    async def send_template(self, channel: Channel, conversation: Conversation, template: TemplateResponse, parameters: list[str]) -> str:
        components = [{"type": "body", "parameters": [{"type": "text", "text": p} for p in parameters]}] if parameters else []
        return await self._post_message(channel, conversation, {"type": "template", "template": {
            "name": template.name, "language": {"code": template.language}, "components": components,
        }})

    async def list_templates(self, channel: Channel) -> list[TemplateResponse]:
        data = await graph(
            "GET", f"/{channel.config['waba_id']}/message_templates", self._token(channel), params={"status": "APPROVED", "limit": 100}
        )
        templates = []
        for item in data.get("data", []):
            if item.get("status") != "APPROVED":
                continue
            body = next((c.get("text", "") for c in item.get("components", []) if c.get("type") == "BODY"), "")
            templates.append(TemplateResponse(
                name=item["name"], language=item["language"], category=item.get("category", ""),
                body=body, parameter_count=len(set(PLACEHOLDER.findall(body))),
            ))
        return templates

    async def _post_message(self, channel: Channel, conversation: Conversation, body: dict) -> str:
        data = await graph(
            "POST", f"/{channel.config['phone_number_id']}/messages", self._token(channel),
            json={"messaging_product": "whatsapp", "to": conversation.external_id, **body},
        )
        return data["messages"][0]["id"]

    @staticmethod
    def _token(channel: Channel) -> str:
        if "access_token" not in channel.config:
            raise ChannelError("WhatsApp channel is not connected")
        return decrypt_secret(channel.config["access_token"])

    @staticmethod
    def _inbound(message: dict, name: Optional[str]) -> Optional[InboundMessage]:
        kind = message.get("type")
        if kind == "text":
            type_, content = "text", message["text"]["body"]
        elif kind in INBOUND_MEDIA:
            type_, content = INBOUND_MEDIA[kind], message.get(kind, {}).get("caption") or f"[{kind}]"
        else:
            return None  # stickers, reactions, locations, ...: not shown in the inbox yet
        return InboundMessage(customer_id=message["from"], content=content, type=type_, name=name, message_id=message["id"])
