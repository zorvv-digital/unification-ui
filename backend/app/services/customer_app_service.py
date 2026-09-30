import re
import secrets
import time
from collections import defaultdict, deque
from typing import Optional, Sequence

import jwt
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Channel, Conversation, Message, Workspace
from app.models.schemas import CustomerAppConfig, CustomerMessageCreate, CustomerSession
from app.services.base import BaseService
from app.services.channel_service import InboundMessage
from app.services.inbox_service import CUSTOMER_APP_PREFIX, InboxService

PLATFORMS = ["whatsapp", "instagram", "messenger", "gmail"]
RATE_LIMIT = 20  # messages per session
RATE_WINDOW_SECONDS = 60


class CustomerAppService(BaseService):
    """
    Service layer for the demo customer app: the customer side of the demo workspace's simulated channels.
    """

    # ponytail: in-process sliding windows, single server process only; move to Redis with several workers.
    _recent: dict[str, deque] = defaultdict(deque)

    @classmethod
    async def demo_workspace(cls, db: AsyncSession) -> Workspace:
        """
        The demo workspace the customer app talks to.

        Args:
            db (AsyncSession): Active asynchronous database session.

        Returns:
            Workspace: The demo workspace.

        Raises:
            HTTPException: 404 when demo mode is off or no demo workspace exists.
        """
        workspace = None
        if settings.DEMO_MODE:
            result = await db.execute(select(Workspace).where(Workspace.is_demo.is_(True)))
            workspace = result.scalars().first()
        if not workspace:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="The customer app is only available in demo mode")
        return workspace

    @classmethod
    async def config(cls, db: AsyncSession) -> CustomerAppConfig:
        """
        The business the customer chats with.

        Args:
            db (AsyncSession): Active asynchronous database session.

        Returns:
            CustomerAppConfig: Business name and available platforms.
        """
        workspace = await cls.demo_workspace(db)
        return CustomerAppConfig(business_name=workspace.name, platforms=PLATFORMS)

    @classmethod
    async def new_session(cls, db: AsyncSession, name: str) -> CustomerSession:
        """
        Starts a customer session; nothing is stored until the first message.

        Args:
            db (AsyncSession): Active asynchronous database session.
            name (str): The customer's display name.

        Returns:
            CustomerSession: The session token and name.
        """
        workspace = await cls.demo_workspace(db)
        token = jwt.encode(
            {"purpose": "customer", "sid": secrets.token_hex(8), "ws": str(workspace.id), "name": name},
            settings.SECRET_KEY, algorithm="HS256",
        )
        return CustomerSession(customer_token=token, name=name)

    @classmethod
    async def session_of(cls, db: AsyncSession, token: Optional[str]) -> tuple[Workspace, str, str]:
        """
        The demo workspace, session id, and name behind a customer token.

        Args:
            db (AsyncSession): Active asynchronous database session.
            token (Optional[str]): Customer session token.

        Returns:
            tuple[Workspace, str, str]: Demo workspace, session id, customer name.

        Raises:
            HTTPException: 404 outside demo mode; 401 for a missing, invalid, or stale token.
        """
        workspace = await cls.demo_workspace(db)
        try:
            claims = jwt.decode(token or "", settings.SECRET_KEY, algorithms=["HS256"])
            if claims.get("purpose") != "customer" or claims.get("ws") != str(workspace.id):
                raise ValueError("token is not a session of this demo workspace")
            return workspace, claims["sid"], claims["name"]
        except (jwt.PyJWTError, KeyError, ValueError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid customer session")

    @classmethod
    async def history(cls, db: AsyncSession, workspace: Workspace, sid: str) -> Sequence[Message]:
        """
        The session's messages on every platform, oldest first.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace (Workspace): The demo workspace.
            sid (str): Customer session id.

        Returns:
            Sequence[Message]: Messages of the session's conversations.
        """
        result = await db.execute(
            select(Message).join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.workspace_id == workspace.id, Conversation.external_id == CUSTOMER_APP_PREFIX + sid)
            .order_by(Message.created_at)
        )
        return result.scalars().all()

    @classmethod
    async def receive(cls, db: AsyncSession, workspace: Workspace, sid: str, name: str, data: CustomerMessageCreate) -> Message:
        """
        Stores a customer message on the demo workspace's simulated channel for its platform, exactly like a
        real inbound message. The contact gets a platform-like phone, username, or email.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace (Workspace): The demo workspace.
            sid (str): Customer session id.
            name (str): Customer name.
            data (CustomerMessageCreate): Platform, content, and the subject for a first Gmail message.

        Returns:
            Message: The stored inbound message.

        Raises:
            HTTPException: 422 for a first Gmail message without subject; 429 after 20 messages within a minute.
        """
        result = await db.execute(select(Channel).where(
            Channel.workspace_id == workspace.id, Channel.platform == data.platform, Channel.adapter_type == "simulated",
        ))
        channel = result.scalars().first()
        if not channel:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This demo channel is not available")
        external_id = CUSTOMER_APP_PREFIX + sid
        started = await db.execute(select(Conversation.id).where(Conversation.channel_id == channel.id, Conversation.external_id == external_id))
        if data.platform == "gmail" and not started.first() and not (data.subject or "").strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="The first email needs a subject")

        now = time.monotonic()
        recent = cls._recent[sid]
        while recent and now - recent[0] > RATE_WINDOW_SECONDS:
            recent.popleft()
        if len(recent) >= RATE_LIMIT:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many messages; please wait a moment")
        recent.append(now)

        handle = f"{re.sub(r'[^a-z0-9]+', '.', name.lower()).strip('.') or 'customer'}.{sid[:4]}"
        digits = f"{int(sid, 16) % 10**9:09d}"
        return await InboxService.receive_message(db, channel, InboundMessage(
            customer_id=external_id, thread_id=external_id, name=name, content=data.content,
            phone=f"+91 9{digits[:4]} {digits[4:]}" if data.platform == "whatsapp" else None,
            username=handle if data.platform == "instagram" else None,
            email=f"{handle}@example.com" if data.platform == "gmail" else None,
            subject=data.subject.strip() if data.platform == "gmail" and data.subject else None,
        ))
