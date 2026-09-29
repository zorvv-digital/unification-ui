import json
import uuid
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query, Request, status
from fastapi.responses import PlainTextResponse, RedirectResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user
from app.db.models import User
from app.db.session import get_db
from app.models.schemas import (
    ChannelConnectedResponse,
    ChannelResponse,
    ChannelUpdate,
    GmailAuthorize,
    MetaConnect,
    SyncResult,
    WebsiteCreate,
    WidgetSettings,
    WidgetUpdate,
    TemplateResponse,
    WebhookInfo,
    WebhookResult,
    WhatsAppConnect,
)
from app.services.ai_reply_service import AiReplyService
from app.services.channel_service import ADAPTERS, ChannelError, ChannelService, StatusUpdate, WebhookAuthError
from app.config.settings import settings
from app.services.inbox_service import InboxService
from app.services.sync_service import SyncService
from app.services.website_service import WebsiteService

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


@router.post("/meta", response_model=list[ChannelConnectedResponse], status_code=status.HTTP_201_CREATED)
async def connect_meta(data: MetaConnect, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Connects a Facebook Page for Messenger, and its linked Instagram professional account for Instagram DMs,
    with a Page access token. The token is checked with Meta first; on rejection nothing is saved (400).
    Reconnecting the same Page (e.g. after its token expired) reuses the existing channels and webhook URLs.
    Register each channel's `webhook_url` and `verify_token` in the Meta App Dashboard: the Messenger one under
    Messenger webhooks (object `page`), the Instagram one under Instagram webhooks, both subscribed to `messages`.
    """
    channels = await ChannelService.connect_meta(db=db, workspace_id=user.workspace_id, data=data)
    return [
        ChannelConnectedResponse(**ChannelResponse.model_validate(c).model_dump(), **ChannelService.webhook_info(c).model_dump())
        for c in channels
    ]


@router.post("/gmail/authorize", response_model=GmailAuthorize)
async def authorize_gmail(user: User = Depends(current_user)):
    """
    Starts connecting Gmail: returns the Google sign-in URL to open in the browser. After consent Google redirects to
    `/channels/gmail/callback`, which connects the account and sends the browser back to the app. 400 when the server
    has no Google OAuth client configured.
    """
    return GmailAuthorize(authorize_url=ChannelService.gmail_authorize_url(user.workspace_id))


@router.get("/gmail/callback", include_in_schema=False)
async def gmail_callback(
    state: str = "",
    code: Optional[str] = None,
    error: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Google's redirect after sign-in. Redirects to `{FRONTEND_URL}/inbox?gmail=connected|denied|error`."""
    result = "denied"
    if not error and code:
        try:
            await ChannelService.complete_gmail_oauth(db=db, code=code, state=state)
            result = "connected"
        except ChannelError:
            result = "error"
    return RedirectResponse(f"{settings.FRONTEND_URL}/inbox?gmail={result}", status_code=status.HTTP_302_FOUND)


@router.post("/website", response_model=ChannelResponse, status_code=status.HTTP_201_CREATED)
async def create_website_chat(data: WebsiteCreate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """
    Creates the workspace's website chat widget (one per workspace; 409 if it exists). `allowed_domains` are the
    hostnames the widget may run on (`example.com` also allows subdomains); `lead_fields` are asked from visitors.
    Get the embed snippet from `GET /channels/{id}/widget`.
    """
    return await WebsiteService.create(db=db, workspace_id=user.workspace_id, data=data)


@router.get("/{channel_id}/widget", response_model=WidgetSettings)
async def get_widget(channel_id: uuid.UUID, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """The website chat widget's settings and the `embed_snippet` to paste into the site's HTML."""
    return await WebsiteService.get_settings(db=db, workspace_id=user.workspace_id, channel_id=channel_id)


@router.patch("/{channel_id}/widget", response_model=WidgetSettings)
async def update_widget(channel_id: uuid.UUID, data: WidgetUpdate, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Updates the widget's allowed domains, greeting, or lead fields."""
    return await WebsiteService.update(db=db, workspace_id=user.workspace_id, channel_id=channel_id, data=data)


@router.post("/{channel_id}/sync", response_model=SyncResult)
async def sync_channel(
    channel_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Imports new messages for a polled channel (Gmail) now, instead of waiting for the background sync
    (every `GMAIL_SYNC_SECONDS`). A revoked Google grant marks the channel `disconnected`. 400 for other channels.
    """
    channel = await ChannelService.get_workspace_channel(db=db, workspace_id=user.workspace_id, channel_id=channel_id)
    if not hasattr(ADAPTERS[channel.adapter_type], "fetch_new"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This channel receives messages by webhook")
    conversation_ids = await SyncService.sync_channel(db=db, channel=channel)
    for conversation_id in conversation_ids:
        background_tasks.add_task(AiReplyService.answer, conversation_id)
    return SyncResult(received=len(conversation_ids))


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
    and parses the event. For `simulated` channels the body is the inbox's own format (see example); WhatsApp,
    Messenger, and Instagram channels need Meta's `X-Hub-Signature-256` header. Delivery statuses update our messages.
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
