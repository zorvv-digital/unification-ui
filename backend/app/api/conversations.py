import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import (
    ConversationResponse,
    ConversationStatus,
    ConversationUpdate,
    MessageCreate,
    MessageResponse,
    Platform,
)
from app.services.demo_service import DemoService
from app.services.inbox_service import InboxService

router = APIRouter(prefix="/conversations", tags=["Inbox"])


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    platform: Optional[Platform] = None,
    status_filter: Optional[ConversationStatus] = Query(None, alias="status"),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists the workspace's conversations across all platforms, newest activity first.
    Filter with `platform` and `status` (`open` or `closed`).
    """
    return await InboxService.list_conversations(
        db=db, workspace_id=user.workspace_id, platform=platform, status_filter=status_filter
    )


@router.get("/{conversation_id}/messages", response_model=list[MessageResponse])
async def list_messages(
    conversation_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Returns the conversation's messages, oldest first.
    """
    return await InboxService.list_messages(db=db, workspace_id=user.workspace_id, conversation_id=conversation_id)


@router.post("/{conversation_id}/messages", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    conversation_id: uuid.UUID,
    data: MessageCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sends a message to the customer through the conversation's channel.
    Check `status` in the response: `failed` means the channel did not accept it.
    In the demo workspace a simulated customer reply follows after a short delay.
    """
    message = await InboxService.send_message(
        db=db, workspace_id=user.workspace_id, conversation_id=conversation_id, data=data
    )
    if user.workspace.is_demo:
        DemoService.schedule_reply(conversation_id)
    return message


@router.post("/{conversation_id}/read", response_model=ConversationResponse)
async def mark_read(
    conversation_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Marks the conversation as read: unread count becomes 0 and inbound messages become `read`.
    """
    return await InboxService.mark_read(db=db, workspace_id=user.workspace_id, conversation_id=conversation_id)


@router.patch("/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: uuid.UUID,
    data: ConversationUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Closes or reopens a conversation.
    """
    return await InboxService.update_status(
        db=db, workspace_id=user.workspace_id, conversation_id=conversation_id, new_status=data.status
    )
