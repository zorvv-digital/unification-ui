import secrets
import time
import uuid
from collections import defaultdict, deque
from typing import Optional, Sequence
from urllib.parse import urlparse

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Channel, Conversation, Message, Workspace
from app.models.schemas import (
    ConversationResponse,
    LeadSubmit,
    WebsiteCreate,
    WidgetConfig,
    WidgetSettings,
    WidgetUpdate,
)
from app.services.base import BaseService
from app.services.channel_service import ChannelService, InboundMessage
from app.services.event_service import EventService
from app.services.inbox_service import InboxService

DEFAULT_GREETING = "Hi there! How can we help you today?"
RATE_LIMIT = 20  # messages per visitor
RATE_WINDOW_SECONDS = 60


class WebsiteService(BaseService):
    """
    Service layer for the website chat widget: staff-side settings and the public visitor API.
    """

    # ponytail: in-process sliding windows, single server process only; move to Redis with several workers.
    _recent: dict[str, deque] = defaultdict(deque)

    # ---------- staff side ----------

    @classmethod
    async def create(cls, db: AsyncSession, workspace_id: uuid.UUID, data: WebsiteCreate) -> Channel:
        """
        Creates the workspace's website chat widget.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            data (WebsiteCreate): Allowed domains, greeting, and lead fields.

        Returns:
            Channel: The new `website` channel.

        Raises:
            HTTPException: 409 when the workspace already has a widget.
        """
        existing = await db.execute(select(Channel.id).where(Channel.workspace_id == workspace_id, Channel.adapter_type == "website"))
        if existing.first():
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This workspace already has a chat widget")
        channel = Channel(
            workspace_id=workspace_id, platform="website", adapter_type="website", name="Website chat",
            config=cls.new_config(data.allowed_domains, data.greeting, data.lead_fields),
        )
        db.add(channel)
        await db.commit()
        return channel

    @staticmethod
    def new_config(allowed_domains: Sequence[str], greeting: Optional[str], lead_fields: Sequence[str]) -> dict:
        return {
            "widget_key": secrets.token_urlsafe(18),
            "allowed_domains": list(dict.fromkeys(allowed_domains)),
            "greeting": greeting or DEFAULT_GREETING,
            "lead_fields": list(dict.fromkeys(lead_fields)),
        }

    @classmethod
    async def get_settings(cls, db: AsyncSession, workspace_id: uuid.UUID, channel_id: uuid.UUID) -> WidgetSettings:
        """
        The widget's settings and embed snippet.

        Raises:
            HTTPException: 404 when the channel is not a website channel of the workspace.
        """
        return cls.settings_of(await cls._workspace_widget(db, workspace_id, channel_id))

    @classmethod
    async def update(cls, db: AsyncSession, workspace_id: uuid.UUID, channel_id: uuid.UUID, data: WidgetUpdate) -> WidgetSettings:
        """
        Updates the widget's allowed domains, greeting, or lead fields.

        Raises:
            HTTPException: 404 when the channel is not a website channel of the workspace.
        """
        channel = await cls._workspace_widget(db, workspace_id, channel_id)
        changes = data.model_dump(exclude_none=True)
        for key in ("allowed_domains", "lead_fields"):
            if key in changes:
                changes[key] = list(dict.fromkeys(changes[key]))
        channel.config = {**channel.config, **changes}
        await db.commit()
        return cls.settings_of(channel)

    @staticmethod
    def settings_of(channel: Channel) -> WidgetSettings:
        config = channel.config
        script = f"{settings.PUBLIC_BASE_URL}{settings.API_V1_STR}/widget.js"
        return WidgetSettings(
            widget_key=config["widget_key"], allowed_domains=config["allowed_domains"], greeting=config["greeting"],
            lead_fields=config["lead_fields"],
            embed_snippet=f'<script src="{script}" data-widget-key="{config["widget_key"]}" async></script>',
        )

    @classmethod
    async def _workspace_widget(cls, db: AsyncSession, workspace_id: uuid.UUID, channel_id: uuid.UUID) -> Channel:
        channel = await ChannelService.get_workspace_channel(db, workspace_id, channel_id)
        if channel.adapter_type != "website":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat widget not found")
        return channel

    # ---------- public visitor side ----------

    @classmethod
    async def widget_for(cls, db: AsyncSession, key: str, origin: Optional[str]) -> Channel:
        """
        Finds the widget by its public key and checks that the request comes from an allowed domain.

        Args:
            db (AsyncSession): Active asynchronous database session.
            key (str): Public widget key.
            origin (Optional[str]): The request's `Origin` (or `Referer`) URL.

        Raises:
            HTTPException: 404 for an unknown key, 403 for a missing or unlisted origin.
        """
        # ponytail: scans website channels in Python; add an indexed widget_key column when there are many.
        result = await db.execute(select(Channel).where(Channel.adapter_type == "website"))
        channel = next((c for c in result.scalars().all() if c.config.get("widget_key") == key), None)
        if not channel:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat widget not found")
        host = (urlparse(origin).hostname or "").lower() if origin else ""
        if not host or not any(host == d or host.endswith("." + d) for d in channel.config.get("allowed_domains", [])):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This website is not allowed to use the chat widget")
        return channel

    @classmethod
    async def config_of(cls, db: AsyncSession, channel: Channel) -> WidgetConfig:
        workspace = await db.get(Workspace, channel.workspace_id)
        return WidgetConfig(business_name=workspace.name, greeting=channel.config["greeting"], lead_fields=channel.config["lead_fields"])

    @staticmethod
    def new_visitor_token(channel: Channel) -> str:
        """An anonymous visitor session; nothing is stored until the first message."""
        return jwt.encode(
            {"purpose": "visitor", "channel_id": str(channel.id), "visitor_id": uuid.uuid4().hex},
            settings.SECRET_KEY, algorithm="HS256",
        )

    @staticmethod
    def visitor_id(channel: Channel, token: Optional[str]) -> str:
        """
        The visitor id inside a token issued for this widget.

        Raises:
            HTTPException: 401 for a missing, invalid, or other-widget token.
        """
        try:
            claims = jwt.decode(token or "", settings.SECRET_KEY, algorithms=["HS256"])
            if claims.get("purpose") != "visitor" or claims.get("channel_id") != str(channel.id):
                raise ValueError("token is for another widget")
            return claims["visitor_id"]
        except (jwt.PyJWTError, KeyError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid visitor session")

    @classmethod
    async def history(cls, db: AsyncSession, channel: Channel, visitor_id: str) -> Sequence[Message]:
        """The visitor's messages, oldest first (empty before their first message)."""
        conversation = await cls._conversation(db, channel, visitor_id)
        if not conversation:
            return []
        result = await db.execute(select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at))
        return result.scalars().all()

    @classmethod
    async def receive(cls, db: AsyncSession, channel: Channel, visitor_id: str, content: str) -> Message:
        """
        Stores a visitor's message in their `website` conversation (created on the first message).

        Raises:
            HTTPException: 429 after 20 messages within a minute from this visitor (nothing stored).
        """
        now = time.monotonic()
        recent = cls._recent[visitor_id]
        while recent and now - recent[0] > RATE_WINDOW_SECONDS:
            recent.popleft()
        if len(recent) >= RATE_LIMIT:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many messages; please wait a moment")
        recent.append(now)
        return await InboxService.receive_message(db, channel, InboundMessage(
            customer_id=visitor_id, content=content, name=f"Website visitor {visitor_id[:4]}",
        ))

    @classmethod
    async def save_lead(cls, db: AsyncSession, channel: Channel, visitor_id: str, data: LeadSubmit) -> None:
        """
        Saves the visitor's details on their contact and emits `conversation.updated` for the inbox.

        Raises:
            HTTPException: 404 before the visitor's first message.
        """
        conversation = await cls._conversation(db, channel, visitor_id)
        if not conversation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Send a message first")
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(conversation.contact, field, value.strip())
        await db.commit()
        EventService.publish(conversation.workspace_id, "conversation.updated", ConversationResponse.model_validate(conversation))

    @staticmethod
    async def _conversation(db: AsyncSession, channel: Channel, visitor_id: str) -> Optional[Conversation]:
        result = await db.execute(select(Conversation).where(Conversation.channel_id == channel.id, Conversation.external_id == visitor_id))
        return result.scalars().first()
