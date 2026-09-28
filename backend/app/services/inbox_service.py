import uuid
from datetime import datetime, timezone
from typing import Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Channel, Contact, Conversation, Message
from app.models.schemas import ConversationResponse, MessageCreate, MessageResponse
from app.services.base import BaseService
from app.services.channel_service import ADAPTERS, ChannelError, InboundMessage
from app.services.event_service import EventService

PREVIEW_LENGTH = 120


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


class InboxService(BaseService):
    """
    Service layer for the unified inbox: conversations, messages, read state, and contacts.
    Every query is scoped by workspace, so other workspaces' records behave as missing.
    """

    @classmethod
    async def list_conversations(
        cls,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        platform: Optional[str] = None,
        status_filter: Optional[str] = None,
    ) -> Sequence[Conversation]:
        """
        Lists workspace conversations, most recent activity first.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            platform (Optional[str]): Only this platform when given.
            status_filter (Optional[str]): Only `open` or `closed` when given.

        Returns:
            Sequence[Conversation]: Conversations with contact loaded.
        """
        query = select(Conversation).where(Conversation.workspace_id == workspace_id)
        if platform:
            query = query.where(Conversation.platform == platform)
        if status_filter:
            query = query.where(Conversation.status == status_filter)
        result = await db.execute(query.order_by(Conversation.last_message_at.desc().nulls_last()))
        return result.scalars().all()

    @classmethod
    async def get_conversation(cls, db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID) -> Conversation:
        """
        Fetches one workspace conversation.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(
            select(Conversation).where(Conversation.id == conversation_id, Conversation.workspace_id == workspace_id)
        )
        conversation = result.scalars().first()
        if not conversation:
            raise _not_found("Conversation")
        return conversation

    @classmethod
    async def list_messages(cls, db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID) -> Sequence[Message]:
        """
        Returns a conversation's messages oldest first.

        Raises:
            HTTPException: 404 when the conversation is not in the workspace.
        """
        await cls.get_conversation(db, workspace_id, conversation_id)
        result = await db.execute(
            select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at)
        )
        return result.scalars().all()

    @classmethod
    async def send_message(
        cls, db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID, data: MessageCreate
    ) -> Message:
        """
        Stores an outbound message and delivers it through the conversation's channel adapter.
        A closed conversation is reopened. A delivery failure keeps the message with status `failed`.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            conversation_id (uuid.UUID): Target conversation.
            data (MessageCreate): Content and message type.

        Returns:
            Message: The stored message.
        """
        conversation = await cls.get_conversation(db, workspace_id, conversation_id)
        conversation.status = "open"
        message = Message(
            workspace_id=workspace_id,
            conversation_id=conversation.id,
            platform=conversation.platform,
            direction="outbound",
            type=data.type,
            content=data.content,
            status="sent",
            created_at=datetime.now(timezone.utc),
        )
        try:
            adapter = ADAPTERS[conversation.channel.adapter_type]
            message.external_id = await adapter.send(conversation.channel, conversation, message)
        except ChannelError:
            message.status = "failed"

        cls._touch(conversation, message)
        db.add(message)
        await db.commit()
        cls._publish(conversation, message)
        return message

    @classmethod
    async def receive_message(cls, db: AsyncSession, channel: Channel, inbound: InboundMessage) -> Optional[Message]:
        """
        Stores an inbound customer message, creating the contact and conversation on first contact.
        A message whose channel-side id was already stored is ignored.

        Args:
            db (AsyncSession): Active asynchronous database session.
            channel (Channel): Channel the message arrived on.
            inbound (InboundMessage): Parsed message from the channel adapter.

        Returns:
            Optional[Message]: The stored message, or None for a duplicate.
        """
        result = await db.execute(
            select(Conversation).where(
                Conversation.channel_id == channel.id, Conversation.external_id == inbound.customer_id
            )
        )
        conversation = result.scalars().first()

        if conversation and inbound.message_id:
            duplicate = await db.execute(
                select(Message.id).where(
                    Message.conversation_id == conversation.id, Message.external_id == inbound.message_id
                )
            )
            if duplicate.first():
                return None

        if not conversation:
            contact = Contact(workspace_id=channel.workspace_id, name=inbound.name or inbound.customer_id)
            conversation = Conversation(
                workspace_id=channel.workspace_id,
                channel=channel,
                contact=contact,
                platform=channel.platform,
                external_id=inbound.customer_id,
            )
            db.add_all([contact, conversation])
            await db.flush()

        message = Message(
            workspace_id=channel.workspace_id,
            conversation_id=conversation.id,
            platform=channel.platform,
            direction="inbound",
            type=inbound.type,
            content=inbound.content,
            status="delivered",
            external_id=inbound.message_id,
            created_at=datetime.now(timezone.utc),
        )
        conversation.status = "open"
        conversation.unread_count = (conversation.unread_count or 0) + 1
        cls._touch(conversation, message)
        db.add(message)
        await db.commit()
        cls._publish(conversation, message)
        return message

    @classmethod
    async def mark_read(cls, db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID) -> Conversation:
        """
        Sets unread count to zero and marks the conversation's inbound messages as read.
        """
        conversation = await cls.get_conversation(db, workspace_id, conversation_id)
        conversation.unread_count = 0
        await db.execute(
            update(Message)
            .where(Message.conversation_id == conversation.id, Message.direction == "inbound", Message.status != "read")
            .values(status="read")
        )
        await db.commit()
        EventService.publish(workspace_id, "conversation.updated", ConversationResponse.model_validate(conversation))
        return conversation

    @classmethod
    async def update_status(
        cls, db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID, new_status: str
    ) -> Conversation:
        """
        Closes or reopens a conversation.
        """
        conversation = await cls.get_conversation(db, workspace_id, conversation_id)
        conversation.status = new_status
        await db.commit()
        EventService.publish(workspace_id, "conversation.updated", ConversationResponse.model_validate(conversation))
        return conversation

    @classmethod
    async def get_contact(cls, db: AsyncSession, workspace_id: uuid.UUID, contact_id: uuid.UUID) -> tuple[Contact, list[uuid.UUID]]:
        """
        Fetches a contact and the ids of its conversations.

        Raises:
            HTTPException: 404 when missing or owned by another workspace.
        """
        result = await db.execute(select(Contact).where(Contact.id == contact_id, Contact.workspace_id == workspace_id))
        contact = result.scalars().first()
        if not contact:
            raise _not_found("Contact")
        ids = await db.execute(select(Conversation.id).where(Conversation.contact_id == contact_id))
        return contact, list(ids.scalars().all())

    @staticmethod
    def _touch(conversation: Conversation, message: Message) -> None:
        conversation.last_message_at = message.created_at
        conversation.last_message_preview = message.content[:PREVIEW_LENGTH]

    @staticmethod
    def _publish(conversation: Conversation, message: Message) -> None:
        EventService.publish(conversation.workspace_id, "message.created", MessageResponse.model_validate(message))
        EventService.publish(conversation.workspace_id, "conversation.updated", ConversationResponse.model_validate(conversation))
