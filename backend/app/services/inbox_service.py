import uuid
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional, Sequence

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Channel, Contact, Conversation, Message, utcnow
from app.models.schemas import ConversationResponse, ConversationUpdate, MessageCreate, MessageResponse, TemplateSend
from app.providers.whatsapp import PLACEHOLDER
from app.services.base import BaseService
from app.services.channel_service import ADAPTERS, ChannelError, InboundMessage, StatusUpdate
from app.services.event_service import EventService

PREVIEW_LENGTH = 120
# Delivery statuses only move forward; `failed` always applies.
STATUS_RANK = {"sent": 1, "delivered": 2, "read": 3}


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
        needs_human: Optional[bool] = None,
    ) -> Sequence[Conversation]:
        """
        Lists workspace conversations, most recent activity first.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            platform (Optional[str]): Only this platform when given.
            status_filter (Optional[str]): Only `open` or `closed` when given.
            needs_human (Optional[bool]): Only conversations with this escalation flag when given.

        Returns:
            Sequence[Conversation]: Conversations with contact loaded.
        """
        query = select(Conversation).where(Conversation.workspace_id == workspace_id)
        if platform:
            query = query.where(Conversation.platform == platform)
        if status_filter:
            query = query.where(Conversation.status == status_filter)
        if needs_human is not None:
            query = query.where(Conversation.needs_human.is_(needs_human))
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
        cls,
        db: AsyncSession,
        workspace_id: uuid.UUID,
        conversation_id: uuid.UUID,
        data: MessageCreate,
        author: str = "staff",
    ) -> Message:
        """
        Stores an outbound message and delivers it through the conversation's channel adapter.
        A closed conversation is reopened. A delivery failure keeps the message with status `failed`.
        A staff message takes the conversation over: mode becomes `human` and the needs-human flag clears.
        Channels with a customer service window (WhatsApp) refuse free-form messages once it has closed.

        Args:
            db (AsyncSession): Active asynchronous database session.
            workspace_id (uuid.UUID): Caller's workspace.
            conversation_id (uuid.UUID): Target conversation.
            data (MessageCreate): Content and message type.
            author (str): `staff` or `agent`.

        Returns:
            Message: The stored message.

        Raises:
            HTTPException: 409 when the channel is disconnected or its customer service window is closed.
        """
        conversation = await cls.get_conversation(db, workspace_id, conversation_id)
        channel = conversation.channel
        adapter = ADAPTERS[channel.adapter_type]
        await cls._check_can_send(db, conversation, adapter, free_form=True)
        return await cls._store_outbound(
            db, conversation, data.type, data.content, author, lambda message: adapter.send(channel, conversation, message)
        )

    @classmethod
    async def send_template(
        cls, db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID, data: TemplateSend
    ) -> Message:
        """
        Sends an approved message template, which is allowed outside the customer service window.
        The stored message has type `template` and the rendered body as content.

        Raises:
            HTTPException: 400 when the channel has no templates, 404 for an unknown template,
                422 for missing parameters, 409 when disconnected, 502 when the templates cannot be loaded.
        """
        conversation = await cls.get_conversation(db, workspace_id, conversation_id)
        channel = conversation.channel
        adapter = ADAPTERS[channel.adapter_type]
        if not hasattr(adapter, "send_template"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This channel has no message templates")
        await cls._check_can_send(db, conversation, adapter, free_form=False)
        try:
            templates = await adapter.list_templates(channel)
        except ChannelError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not load templates: {exc}")
        template = next((t for t in templates if t.name == data.name and t.language == data.language), None)
        if not template:
            raise _not_found("Template")
        if len(data.parameters) < template.parameter_count:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Template {template.name} needs {template.parameter_count} parameters",
            )
        parameters = data.parameters[: template.parameter_count]
        content = PLACEHOLDER.sub(lambda m: parameters[int(m.group(1)) - 1] if int(m.group(1)) <= len(parameters) else m.group(0), template.body)
        return await cls._store_outbound(
            db, conversation, "template", content, "staff",
            lambda message: adapter.send_template(channel, conversation, template, parameters),
        )

    @classmethod
    async def apply_status(cls, db: AsyncSession, channel: Channel, update_: StatusUpdate) -> Optional[Message]:
        """
        Applies a channel-reported delivery status to our outbound message and emits `message.updated`.
        Late, out-of-order statuses (e.g. `delivered` after `read`) and unknown message ids are ignored.

        Returns:
            Optional[Message]: The updated message, or None when nothing changed.
        """
        result = await db.execute(
            select(Message)
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Conversation.channel_id == channel.id, Message.external_id == update_.external_id)
        )
        message = result.scalars().first()
        if not message or message.status == update_.status:
            return None
        if update_.status != "failed" and STATUS_RANK.get(update_.status, 0) <= STATUS_RANK.get(message.status, 0):
            return None
        message.status = update_.status
        await db.commit()
        EventService.publish(channel.workspace_id, "message.updated", MessageResponse.model_validate(message))
        return message

    @classmethod
    async def _check_can_send(cls, db: AsyncSession, conversation: Conversation, adapter, free_form: bool) -> None:
        if conversation.channel.status == "disconnected":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This channel is disconnected")
        window = getattr(adapter, "session_window", None)
        if not (free_form and window):
            return
        result = await db.execute(
            select(func.max(Message.created_at)).where(Message.conversation_id == conversation.id, Message.direction == "inbound")
        )
        last_inbound = result.scalar_one()
        if last_inbound and last_inbound.tzinfo is None:
            last_inbound = last_inbound.replace(tzinfo=timezone.utc)  # SQLite returns naive UTC
        if not last_inbound or datetime.now(timezone.utc) - last_inbound > window:
            hours = int(window.total_seconds() // 3600)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"The {hours}-hour customer service window is closed. Send an approved template instead.",
            )

    @classmethod
    async def _store_outbound(
        cls,
        db: AsyncSession,
        conversation: Conversation,
        type_: str,
        content: str,
        author: str,
        deliver: Callable[[Message], Awaitable[str]],
    ) -> Message:
        conversation.status = "open"
        if author == "staff":
            conversation.mode = "human"
            conversation.needs_human = False
        message = Message(
            workspace_id=conversation.workspace_id,
            conversation_id=conversation.id,
            platform=conversation.platform,
            direction="outbound",
            type=type_,
            content=content,
            status="sent",
            author=author,
            created_at=utcnow(),
        )
        try:
            message.external_id = await deliver(message)
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
        A new conversation starts in `ai` mode when its channel has auto-reply on. A message whose
        channel-side id was already stored is ignored.

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
                mode="ai" if channel.ai_enabled and channel.ai_agent_id else "human",
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
            author="customer",
            external_id=inbound.message_id,
            created_at=utcnow(),
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
    async def update_conversation(
        cls, db: AsyncSession, workspace_id: uuid.UUID, conversation_id: uuid.UUID, data: ConversationUpdate
    ) -> Conversation:
        """
        Closes or reopens a conversation, and switches it between `ai` and `human` mode.
        Setting a mode clears the needs-human flag.

        Raises:
            HTTPException: 400 when switching to `ai` on a channel without auto-reply.
        """
        conversation = await cls.get_conversation(db, workspace_id, conversation_id)
        if data.mode == "ai" and not (conversation.channel.ai_enabled and conversation.channel.ai_agent_id):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Enable AI auto-reply on this channel first")
        if data.status:
            conversation.status = data.status
        if data.mode:
            conversation.mode = data.mode
            conversation.needs_human = False
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
