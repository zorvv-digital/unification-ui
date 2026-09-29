import base64
import html
import re
import time
from email.message import EmailMessage
from email.utils import parseaddr
from typing import Any, Optional

import httpx

from app.config.settings import settings
from app.db.models import Channel, Conversation, Message
from app.providers.base import ChannelError, InboundMessage, TokenError
from app.services.crypto import decrypt_secret, encrypt_secret

# Tests swap in httpx.MockTransport here.
_transport: Optional[httpx.AsyncBaseTransport] = None

SCOPES = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send"
OVERLAP_SECONDS = 300  # re-read the last 5 minutes each sync; duplicates are dropped by Gmail message id
QUOTE_HEADER = re.compile(r"^On .+wrote:\s*$", re.MULTILINE)


async def google(method: str, url: str, token: Optional[str] = None, **kwargs: Any) -> dict:
    """
    Calls a Google OAuth or Gmail endpoint.

    Raises:
        TokenError: When Google rejects the grant or access token (401, `invalid_grant`).
        ChannelError: On network failure or any other error response.
    """
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        async with httpx.AsyncClient(transport=_transport, timeout=20) as client:
            response = await client.request(method, url, headers=headers, **kwargs)
    except httpx.HTTPError as exc:
        raise ChannelError(f"Google API unreachable: {exc}") from exc
    try:
        data = response.json()
    except ValueError:
        data = {}
    if response.is_error:
        error = data.get("error")
        message = error.get("message") if isinstance(error, dict) else data.get("error_description") or error
        message = message or f"Google API error {response.status_code}"
        raise TokenError(message) if response.status_code == 401 or error == "invalid_grant" else ChannelError(message)
    return data


class GmailAdapter:
    """
    Gmail API adapter, polled instead of webhook-driven. Channel `config` holds `email`, `last_sync` (epoch
    seconds), `expires_at`, and the encrypted `refresh_token` and `access_token`.
    """

    @staticmethod
    def redirect_uri() -> str:
        return f"{settings.PUBLIC_BASE_URL}{settings.API_V1_STR}/channels/gmail/callback"

    @classmethod
    async def exchange_code(cls, code: str) -> tuple[dict, str]:
        """
        Exchanges an authorization code for tokens and reads the account's address.

        Returns:
            tuple[dict, str]: The channel config to store, and the Gmail address.

        Raises:
            ChannelError: When Google rejects the code or the profile cannot be read.
        """
        tokens = await google("POST", settings.GOOGLE_TOKEN_URL, data={
            "code": code, "client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": cls.redirect_uri(), "grant_type": "authorization_code",
        })
        if not tokens.get("refresh_token"):
            raise ChannelError("Google did not return a refresh token")
        profile = await google("GET", f"{settings.GMAIL_API_URL}/users/me/profile", tokens["access_token"])
        address = profile["emailAddress"]
        return {
            "email": address,
            "refresh_token": encrypt_secret(tokens["refresh_token"]),
            "access_token": encrypt_secret(tokens["access_token"]),
            "expires_at": time.time() + tokens.get("expires_in", 3600),
            "last_sync": time.time(),
        }, address

    async def fetch_new(self, channel: Channel) -> list[InboundMessage]:
        token = await self._access_token(channel)
        since = int(channel.config.get("last_sync", time.time())) - OVERLAP_SECONDS
        # ponytail: first page only (100 messages per sync); page through `nextPageToken` if a sync can see more.
        listing = await google("GET", f"{settings.GMAIL_API_URL}/users/me/messages", token,
                               params={"q": f"in:inbox -from:me after:{since}", "maxResults": 100})
        items = []
        for ref in reversed(listing.get("messages", [])):  # Gmail lists newest first
            message = await google("GET", f"{settings.GMAIL_API_URL}/users/me/messages/{ref['id']}", token, params={"format": "full"})
            inbound = self._inbound(message)
            if inbound and inbound.email != channel.config.get("email"):
                items.append(inbound)
        return items

    async def send(self, channel: Channel, conversation: Conversation, message: Message) -> str:
        token = await self._access_token(channel)
        thread = await google("GET", f"{settings.GMAIL_API_URL}/users/me/threads/{conversation.external_id}", token,
                              params={"format": "metadata", "metadataHeaders": ["Message-ID", "Subject"]})
        last_id = next((h for m in reversed(thread.get("messages", [])) for h in [_header(m, "Message-ID")] if h), None)
        subject = conversation.subject or ""
        mime = EmailMessage()
        mime["From"] = channel.config["email"]
        mime["To"] = conversation.contact.email
        mime["Subject"] = subject if subject.lower().startswith("re:") else f"Re: {subject}"
        if last_id:
            mime["In-Reply-To"] = last_id
            mime["References"] = last_id
        mime.set_content(message.content)
        raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
        sent = await google("POST", f"{settings.GMAIL_API_URL}/users/me/messages/send", token,
                            json={"raw": raw, "threadId": conversation.external_id})
        return sent["id"]

    @staticmethod
    async def _access_token(channel: Channel) -> str:
        """The cached access token, refreshed when it expires within a minute (the new one is stored in `config`)."""
        config = channel.config
        if "refresh_token" not in config:
            raise ChannelError("Gmail channel is not connected")
        if config.get("access_token") and config.get("expires_at", 0) > time.time() + 60:
            return decrypt_secret(config["access_token"])
        tokens = await google("POST", settings.GOOGLE_TOKEN_URL, data={
            "client_id": settings.GOOGLE_CLIENT_ID, "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "refresh_token": decrypt_secret(config["refresh_token"]), "grant_type": "refresh_token",
        })
        channel.config = {**config, "access_token": encrypt_secret(tokens["access_token"]),
                          "expires_at": time.time() + tokens.get("expires_in", 3600)}
        return tokens["access_token"]

    @staticmethod
    def _inbound(message: dict) -> Optional[InboundMessage]:
        name, address = parseaddr(_header(message, "From") or "")
        if not address:
            return None
        body = _body(message.get("payload", {}))
        return InboundMessage(
            customer_id=address.lower(), email=address.lower(), name=name or None,
            content=_strip_quoted(body) or body or "(no text)", message_id=message["id"],
            thread_id=message["threadId"], subject=_header(message, "Subject") or "(no subject)",
        )


def _header(message: dict, name: str) -> Optional[str]:
    return next((h["value"] for h in message.get("payload", {}).get("headers", []) if h["name"].lower() == name.lower()), None)


def _decode(part: dict) -> str:
    data = part.get("body", {}).get("data", "")
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", "replace")


def _body(payload: dict) -> str:
    """The plain-text body; HTML is reduced to text when there is no plain part."""
    parts, stack = [], [payload]
    while stack:
        part = stack.pop(0)
        stack.extend(part.get("parts", []))
        parts.append(part)
    plain = next((p for p in parts if p.get("mimeType") == "text/plain" and p.get("body", {}).get("data")), None)
    if plain:
        return _decode(plain).strip()
    rich = next((p for p in parts if p.get("mimeType") == "text/html" and p.get("body", {}).get("data")), None)
    if not rich:
        return ""
    text = re.sub(r"<(br|/p|/div)[^>]*>", "\n", _decode(rich), flags=re.IGNORECASE)
    return html.unescape(re.sub(r"<[^>]+>", "", text)).strip()


def _strip_quoted(body: str) -> str:
    """Drops the quoted previous email ("On ... wrote:" and `>` lines) from a reply."""
    match = QUOTE_HEADER.search(body)
    if match:
        body = body[: match.start()]
    return "\n".join(line for line in body.splitlines() if not line.startswith(">")).strip()
