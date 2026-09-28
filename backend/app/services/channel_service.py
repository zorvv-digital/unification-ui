import secrets
import uuid
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Agent, Channel, Conversation, Message
from app.models.schemas import ChannelUpdate, SimulatedInbound, WebhookInfo, WhatsAppConnect
from app.providers.base import ChannelError, InboundMessage, StatusUpdate, WebhookAuthError  # noqa: F401 (re-exported)
from app.providers.whatsapp import WhatsAppAdapter
from app.services.base import BaseService
from app.services.crypto import encrypt_secret


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
ADAPTERS = {"simulated": SimulatedAdapter(), "whatsapp": WhatsAppAdapter()}


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
