import json
import uuid
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import (
    ChannelConnectedResponse,
    ChannelResponse,
    ChannelUpdate,
    TemplateResponse,
    WebhookInfo,
    WebhookResult,
    WhatsAppConnect,
)
from app.services.ai_reply_service import AiReplyService
from app.services.channel_service import ADAPTERS, ChannelError, ChannelService, StatusUpdate, WebhookAuthError
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


@router.post("/whatsapp", response_model=ChannelConnectedResponse, status_code=status.HTTP_201_CREATED)
async def connect_whatsapp(data: WhatsAppConnect, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Connects a WhatsApp Business number (Cloud API). The credentials are checked with Meta first; on
    rejection nothing is saved (400). The response includes the `webhook_url` and `verify_token` to register
    in the Meta App Dashboard (WhatsApp > Configuration), subscribed to the `messages` field.
    """
    channel, webhook = await ChannelService.connect_whatsapp(db=db, workspace_id=user.workspace_id, data=data)
    return ChannelConnectedResponse(**ChannelResponse.model_validate(channel).model_dump(), **webhook.model_dump())


@router.get("/{channel_id}/webhook", response_model=WebhookInfo)
async def get_webhook_info(channel_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Shows the webhook URL and verify token to register in Meta for this channel.
    """
    channel = await ChannelService.get_workspace_channel(db=db, workspace_id=user.workspace_id, channel_id=channel_id)
    return ChannelService.webhook_info(channel)


@router.delete("/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_channel(channel_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Disconnects the channel: stored credentials are deleted and AI auto-reply is turned off.
    Past conversations stay in the inbox; new inbound events (410) and sends (409) are rejected.
    """
    await ChannelService.disconnect(db=db, workspace_id=user.workspace_id, channel_id=channel_id)


@router.get("/{channel_id}/templates", response_model=list[TemplateResponse])
async def list_templates(channel_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Lists the channel's Meta-approved message templates. `parameter_count` is the number of `{{n}}` placeholders.
    Returns 400 for channels without templates and 502 when Meta cannot be reached.
    """
    channel = await ChannelService.get_workspace_channel(db=db, workspace_id=user.workspace_id, channel_id=channel_id)
    adapter = ADAPTERS[channel.adapter_type]
    if not hasattr(adapter, "list_templates"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This channel has no message templates")
    try:
        return await adapter.list_templates(channel)
    except ChannelError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not load templates: {exc}")


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


@webhook_router.get("/{channel_id}", response_class=PlainTextResponse)
async def verify_webhook(
    channel_id: uuid.UUID,
    mode: Optional[str] = Query(None, alias="hub.mode"),
    verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
    challenge: str = Query("", alias="hub.challenge"),
    db: AsyncSession = Depends(get_db),
):
    """
    Meta's webhook verification handshake: echoes `hub.challenge` when `hub.verify_token` matches the channel's
    verify token, otherwise 403.
    """
    channel = await ChannelService.get_channel(db=db, channel_id=channel_id)
    if not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")
    adapter = ADAPTERS[channel.adapter_type]
    if not hasattr(adapter, "verify_subscription"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This channel does not use webhook verification")
    try:
        return adapter.verify_subscription(channel, mode, verify_token, challenge)
    except WebhookAuthError:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verify token mismatch")


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
    and parses the event. For `simulated` channels the body is the inbox's own format (see example); WhatsApp
    channels need Meta's `X-Hub-Signature-256` header. Delivery statuses update our messages.
    Conversations in `ai` mode are answered by the channel's agent right after the response.
    A disconnected channel returns 410.
    """
    channel = await ChannelService.get_channel(db=db, channel_id=channel_id)
    if not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not found")
    if channel.status == "disconnected":
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Channel is disconnected")

    try:
        inbound = ADAPTERS[channel.adapter_type].parse_webhook(channel, dict(request.headers), await request.body())
    except WebhookAuthError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Webhook authenticity check failed")
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=json.loads(exc.json()))

    conversation_ids = []
    for item in inbound:
        if isinstance(item, StatusUpdate):
            await InboxService.apply_status(db=db, channel=channel, update_=item)
            continue
        message = await InboxService.receive_message(db=db, channel=channel, inbound=item)
        if message:
            conversation_ids.append(message.conversation_id)
    for conversation_id in dict.fromkeys(conversation_ids):
        background_tasks.add_task(AiReplyService.answer, conversation_id)
    return WebhookResult(received=len(conversation_ids))
