import uuid
from dataclasses import dataclass
from typing import Any, Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Channel, Conversation, Message
from app.models.schemas import SimulatedInbound
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
