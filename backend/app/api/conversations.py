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
    SuggestReplyResponse,
    TemplateSend,
)
from app.services.ai_reply_service import AiReplyService
from app.services.demo_service import DemoService
from app.services.inbox_service import InboxService

router = APIRouter(prefix="/conversations", tags=["Inbox"])


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(
    platform: Optional[Platform] = None,
    status_filter: Optional[ConversationStatus] = Query(None, alias="status"),
    needs_human: Optional[bool] = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lists the workspace's conversations across all platforms, newest activity first.
    Filter with `platform`, `status` (`open` or `closed`), and `needs_human` (escalated by the AI).
    """
    return await InboxService.list_conversations(
        db=db, workspace_id=user.workspace_id, platform=platform, status_filter=status_filter, needs_human=needs_human
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
    A staff message switches the conversation to `human` mode (the AI stops answering).
    In the demo workspace a simulated customer reply follows after a short delay.
    """
    message = await InboxService.send_message(
        db=db, workspace_id=user.workspace_id, conversation_id=conversation_id, data=data
    )
    if user.workspace.is_demo:
        DemoService.schedule_reply(conversation_id)
    return message


@router.post("/{conversation_id}/template", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_template(
    conversation_id: uuid.UUID,
    data: TemplateSend,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sends an approved WhatsApp template (allowed outside the 24-hour window). `parameters` fill `{{1}}`, `{{2}}`, ...
    Returns 404 for an unknown template, 422 for missing parameters, 400 for channels without templates.
    """
    return await InboxService.send_template(db=db, workspace_id=user.workspace_id, conversation_id=conversation_id, data=data)


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
    Closes or reopens a conversation (`status`) and hands it to the AI or a human (`mode`).
    `mode: ai` needs AI auto-reply on the conversation's channel. Setting a mode clears `needs_human`.
    """
    return await InboxService.update_conversation(
        db=db, workspace_id=user.workspace_id, conversation_id=conversation_id, data=data
    )


@router.post("/{conversation_id}/suggest-reply", response_model=SuggestReplyResponse)
async def suggest_reply(
    conversation_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Drafts a reply with the channel's agent (or the workspace's first agent). Nothing is sent or stored.
    Returns 400 when the workspace has no agent and 502 when the AI provider fails.
    """
    suggestion = await AiReplyService.suggest(db=db, workspace_id=user.workspace_id, conversation_id=conversation_id)
    return SuggestReplyResponse(suggestion=suggestion)
