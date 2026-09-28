import json
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Request, status
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import ChannelResponse, ChannelUpdate, WebhookResult
from app.services.ai_reply_service import AiReplyService
from app.services.channel_service import ADAPTERS, ChannelService, WebhookAuthError
from app.services.inbox_service import InboxService

router = APIRouter(prefix="/channels", tags=["Channels"])
webhook_router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

SIMULATED_EXAMPLE = {"customer_id": "+919876543210", "name": "Rahul Kumar", "type": "text", "content": "Is 7:30 still free?"}


@router.get("", response_model=list[ChannelResponse])
async def list_channels(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Lists the workspace's channels. Secrets and adapter configuration are never returned.
    """
    return await ChannelService.list_channels(db=db, workspace_id=user.workspace_id)


@router.patch("/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    channel_id: uuid.UUID,
    data: ChannelUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Turns AI auto-reply on or off for the channel and picks the answering agent (`ai_agent_id`).
    Enabling needs an agent. New conversations on an auto-reply channel start in `ai` mode.
    """
    return await ChannelService.update_settings(db=db, workspace_id=user.workspace_id, channel_id=channel_id, data=data)


@webhook_router.post("/{channel_id}", response_model=WebhookResult)
async def receive_webhook(
    channel_id: uuid.UUID,
    request: Request,
    background_tasks: BackgroundTasks,
    body: dict[str, Any] = Body(..., examples=[SIMULATED_EXAMPLE]),
    db: AsyncSession = Depends(get_db),
):
    """
    Public inbound endpoint for a channel (no user token). The channel's adapter checks authenticity
    and parses the event. For `simulated` channels the body is the inbox's own format (see example).
    Conversations in `ai` mode are answered by the channel's agent right after the response.
    """
    channel = await ChannelService.get_channel(db=db, channel_id=channel_id)
    if not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")

    try:
        inbound = ADAPTERS[channel.adapter_type].parse_webhook(channel, dict(request.headers), body)
    except WebhookAuthError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Webhook authenticity check failed")
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=json.loads(exc.json()))

    conversation_ids = []
    for item in inbound:
        message = await InboxService.receive_message(db=db, channel=channel, inbound=item)
        if message:
            conversation_ids.append(message.conversation_id)
    for conversation_id in dict.fromkeys(conversation_ids):
        background_tasks.add_task(AiReplyService.answer, conversation_id)
    return WebhookResult(received=len(conversation_ids))
