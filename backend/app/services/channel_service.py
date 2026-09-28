import uuid
from dataclasses import dataclass
from typing import Any, Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Agent, Channel, Conversation, Message
from app.models.schemas import ChannelUpdate, SimulatedInbound
from app.services.base import BaseService


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


class SimulatedAdapter:
    """
    Adapter that never leaves the server: sends always succeed, inbound events use the inbox's own format.
    """

    async def send(self, channel: Channel, conversation: Conversation, message: Message) -> str:
        return f"sim-{uuid.uuid4().hex}"

    def parse_webhook(self, channel: Channel, headers: dict[str, str], body: dict[str, Any]) -> list[InboundMessage]:
        payload = SimulatedInbound.model_validate(body)
        return [InboundMessage(**payload.model_dump())]


# Adapter contract: `send(channel, conversation, message) -> external_id` and
# `parse_webhook(channel, headers, body) -> list[InboundMessage]`. Real channels register here.
ADAPTERS = {"simulated": SimulatedAdapter()}


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
        result = await db.execute(select(Channel).where(Channel.id == channel_id, Channel.workspace_id == workspace_id))
        channel = result.scalars().first()
        if not channel:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")
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
