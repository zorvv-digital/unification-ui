import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Sequence
from urllib.parse import urlencode

import jwt

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Agent, Channel, Conversation, Message
from app.models.schemas import ChannelResponse, ChannelUpdate, MetaConnect, SimulatedInbound, WebhookInfo, WhatsAppConnect
from app.providers.base import ChannelError, InboundMessage, StatusUpdate, TokenError, WebhookAuthError  # noqa: F401 (re-exported)
from app.providers.gmail import SCOPES, GmailAdapter
from app.providers.messenger import MessengerAdapter
from app.providers.website import WebsiteAdapter
from app.providers.whatsapp import WhatsAppAdapter
from app.services.base import BaseService
from app.services.crypto import encrypt_secret
from app.services.event_service import EventService


class SimulatedAdapter:
    """
    Adapter that never leaves the server: sends always succeed, inbound events use the inbox's own format.
    """

    async def send(self, channel: Channel, conversation: Conversation, message: Message) -> str:
        return f"sim-{uuid.uuid4().hex}"

    def parse_webhook(self, channel: Channel, headers: dict[str, str], raw_body: bytes) -> list[InboundMessage]:
        payload = SimulatedInbound.model_validate_json(raw_body)
        return [InboundMessage(**payload.model_dump())]


# Adapter contract: see app/providers/base.py. Real channels register here.
_messenger = MessengerAdapter()
ADAPTERS = {
    "simulated": SimulatedAdapter(), "whatsapp": WhatsAppAdapter(), "messenger": _messenger, "instagram": _messenger,
    "gmail": GmailAdapter(), "website": WebsiteAdapter(),
}


class ChannelService(BaseService):
    """
    Service layer for workspace channels.
    """

    @classmethod
    async def list_channels(cls, db: AsyncSession, workspace_id: uuid.UUID) -> Sequence[Channel]:
        """
        Lists the workspace's channels.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.

        Returns:
            Sequence[Channel]: Channels ordered by platform.
        """
        result = await db.execute(
            select(Channel).where(Channel.workspace_id == workspace_id).order_by(Channel.platform)
        )
        return result.scalars().all()

    @classmethod
    async def get_workspace_channel(cls, db: AsyncSession, workspace_id: uuid.UUID, channel_id: uuid.UUID) -> Channel:
        """
        Fetches one workspace channel.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(select(Channel).where(Channel.id == channel_id, Channel.workspace_id == workspace_id))
        channel = result.scalars().first()
        if not channel:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")
        return channel

    @classmethod
    async def connect_whatsapp(cls, db: AsyncSession, workspace_id: uuid.UUID, data: WhatsAppConnect) -> tuple[Channel, WebhookInfo]:
        """
        Verifies WhatsApp Cloud API credentials with Meta and saves the channel with encrypted secrets.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            data (WhatsAppConnect): Phone number id, WABA id, access token, and app secret.

        Returns:
            tuple[Channel, WebhookInfo]: The channel and the webhook values to register in Meta.

        Raises:
            HTTPException: 400 when Meta rejects the credentials (nothing is saved).
        """
        try:
            display_number = await WhatsAppAdapter.verify_credentials(data.phone_number_id, data.access_token)
        except ChannelError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Meta rejected these credentials: {exc}")
        channel = Channel(
            workspace_id=workspace_id,
            platform="whatsapp",
            name=data.name or f"WhatsApp {display_number}",
            adapter_type="whatsapp",
            status="connected",
            config={
                "phone_number_id": data.phone_number_id,
                "waba_id": data.waba_id,
                "display_phone_number": display_number,
                "verify_token": secrets.token_urlsafe(24),
                "access_token": encrypt_secret(data.access_token),
                "app_secret": encrypt_secret(data.app_secret),
            },
        )
        db.add(channel)
        await db.commit()
        return channel, cls.webhook_info(channel)

    @classmethod
    async def connect_meta(cls, db: AsyncSession, workspace_id: uuid.UUID, data: MetaConnect) -> list[Channel]:
        """
        Verifies a Facebook Page token with Meta and connects the Page as a `messenger` channel, plus an
        `instagram` channel when the Page has a linked Instagram professional account. Reconnecting the same
        Page or Instagram account updates its existing channel, keeping its webhook URL and verify token.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            data (MetaConnect): Page id, Page access token, and app secret.

        Returns:
            list[Channel]: The Messenger channel, then the Instagram channel if any.

        Raises:
            HTTPException: 400 when Meta rejects the token or Page id (nothing is saved).
        """
        try:
            page = await MessengerAdapter.fetch_page(data.page_id, data.page_access_token)
        except ChannelError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Meta rejected this Page token: {exc}")
        secrets_ = {"page_id": data.page_id, "access_token": encrypt_secret(data.page_access_token), "app_secret": encrypt_secret(data.app_secret)}
        wanted = [("messenger", "page_id", data.page_id, page.get("name") or f"Page {data.page_id}", {})]
        instagram = page.get("instagram_business_account")
        if instagram:
            wanted.append(("instagram", "ig_id", instagram["id"], f"@{instagram.get('username') or instagram['id']}", {"ig_id": instagram["id"]}))

        # ponytail: matches in Python over the workspace's few channels instead of querying the JSON column.
        existing = await cls.list_channels(db, workspace_id)
        channels = []
        for platform, key, account_id, name, extra in wanted:
            channel = next((c for c in existing if c.adapter_type == platform and c.config.get(key) == account_id), None)
            if not channel:
                channel = Channel(workspace_id=workspace_id, platform=platform, adapter_type=platform, config={})
                db.add(channel)
            channel.name = name
            channel.status = "connected"
            channel.config = {**secrets_, **extra, "verify_token": channel.config.get("verify_token") or secrets.token_urlsafe(24)}
            channels.append(channel)
        await db.commit()
        return channels

    @staticmethod
    def gmail_authorize_url(workspace_id: uuid.UUID) -> str:
        """
        Builds the Google sign-in URL for connecting Gmail. `state` is a short-lived signed token naming the
        workspace, because Google's redirect back to the callback carries no user token.

        Raises:
            HTTPException: 400 when no Google OAuth client is configured.
        """
        if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Gmail is not configured on this server (GOOGLE_CLIENT_ID)")
        state = jwt.encode(
            {"workspace_id": str(workspace_id), "purpose": "gmail", "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
            settings.SECRET_KEY, algorithm="HS256",
        )
        return settings.GOOGLE_AUTH_URL + "?" + urlencode({
            "client_id": settings.GOOGLE_CLIENT_ID, "redirect_uri": GmailAdapter.redirect_uri(), "response_type": "code",
            "scope": SCOPES, "access_type": "offline", "prompt": "consent", "state": state,
        })

    @classmethod
    async def complete_gmail_oauth(cls, db: AsyncSession, code: str, state: str) -> Channel:
        """
        Finishes Google sign-in: checks `state`, exchanges the code, and connects the Gmail address as a `gmail`
        channel. Connecting the same address again updates its existing channel.

        Raises:
            ChannelError: For an invalid or expired state, or when Google rejects the code.
        """
        try:
            claims = jwt.decode(state, settings.SECRET_KEY, algorithms=["HS256"])
            if claims.get("purpose") != "gmail":
                raise ValueError("wrong purpose")
            workspace_id = uuid.UUID(claims["workspace_id"])
        except (jwt.PyJWTError, KeyError, ValueError) as exc:
            raise ChannelError("Invalid sign-in state") from exc
        config, address = await GmailAdapter.exchange_code(code)
        existing = await cls.list_channels(db, workspace_id)
        channel = next((c for c in existing if c.adapter_type == "gmail" and c.config.get("email") == address), None)
        if not channel:
            channel = Channel(workspace_id=workspace_id, platform="gmail", adapter_type="gmail", name=address)
            db.add(channel)
        channel.config = config
        channel.status = "connected"
        await db.commit()
        return channel

    @staticmethod
    def mark_disconnected(channel: Channel) -> None:
        """
        Marks a channel whose access was revoked or expired as `disconnected` (config kept so reconnecting reuses it)
        and emits `channel.updated`. The caller commits.
        """
        channel.status = "disconnected"
        EventService.publish(channel.workspace_id, "channel.updated", ChannelResponse.model_validate(channel))

    @staticmethod
    def webhook_info(channel: Channel) -> WebhookInfo:
        """The webhook URL and verify token a user registers in Meta for this channel."""
        return WebhookInfo(
            webhook_url=f"{settings.PUBLIC_BASE_URL}{settings.API_V1_STR}/webhooks/{channel.id}",
            verify_token=channel.config.get("verify_token", ""),
        )

    @classmethod
    async def disconnect(cls, db: AsyncSession, workspace_id: uuid.UUID, channel_id: uuid.UUID) -> None:
        """
        Disconnects a channel: deletes its stored configuration and secrets and turns AI auto-reply off.
        Conversations stay readable; new inbound events and sends are rejected.

        Raises:
            HTTPException: 404 when the channel is not in the workspace.
        """
        channel = await cls.get_workspace_channel(db, workspace_id, channel_id)
        channel.config = {}
        channel.status = "disconnected"
        channel.ai_enabled = False
        await db.commit()

    @classmethod
    async def get_channel(cls, db: AsyncSession, channel_id: uuid.UUID) -> Optional[Channel]:
        """
        Fetches a channel by id regardless of workspace (used by public webhooks).

        Args:
            db (AsyncSession): Active asynchronous database session.
            channel_id (uuid.UUID): Channel primary key.

        Returns:
            Optional[Channel]: The channel, or None if not found.
        """
        result = await db.execute(select(Channel).where(Channel.id == channel_id))
        return result.scalars().first()

    @classmethod
    async def update_settings(cls, db: AsyncSession, workspace_id: uuid.UUID, channel_id: uuid.UUID, data: ChannelUpdate) -> Channel:
        """
        Updates a channel's AI auto-reply settings.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            channel_id (uuid.UUID): Channel to update.
            data (ChannelUpdate): Fields to change.

        Returns:
            Channel: The updated channel.

        Raises:
            HTTPException: 404 for a channel or agent outside the workspace, 400 when enabling without an agent.
        """
        channel = await cls.get_workspace_channel(db, workspace_id, channel_id)
        if data.ai_agent_id:
            agent = await db.execute(select(Agent.id).where(Agent.id == data.ai_agent_id, Agent.workspace_id == workspace_id))
            if not agent.first():
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")
            channel.ai_agent_id = data.ai_agent_id
        if data.ai_enabled is not None:
            if data.ai_enabled and not channel.ai_agent_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose an agent to enable AI auto-reply")
            channel.ai_enabled = data.ai_enabled
        await db.commit()
        return channel
