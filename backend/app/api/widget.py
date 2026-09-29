from pathlib import Path
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import settings
from app.db.models import Channel, Workspace
from app.db.session import AsyncSessionLocal, get_db
from app.models.schemas import LeadSubmit, VisitorMessage, VisitorMessageCreate, VisitorSession, WidgetConfig
from app.services.ai_reply_service import AiReplyService
from app.services.event_service import EventService
from app.services.website_service import WebsiteService

router = APIRouter(tags=["Website chat widget"])

WIDGET_DIR = Path(__file__).parent.parent / "widget"


def _origin(request: Request) -> Optional[str]:
    # Browsers omit Origin on same-origin GETs; Referer carries the page's host there.
    return request.headers.get("origin") or request.headers.get("referer")


async def _widget(key: str, request: Request, db: AsyncSession = Depends(get_db)) -> Channel:
    return await WebsiteService.widget_for(db, key, _origin(request))


@router.get("/widget.js", include_in_schema=False)
async def widget_script():
    """The embeddable chat widget script."""
    return FileResponse(WIDGET_DIR / "widget.js", media_type="application/javascript")


@router.get("/widget/demo", response_class=HTMLResponse, include_in_schema=False)
async def demo_page(db: AsyncSession = Depends(get_db)):
    """A sample business page with the demo workspace's chat widget embedded."""
    result = await db.execute(
        select(Channel).join(Workspace, Workspace.id == Channel.workspace_id)
        .where(Workspace.is_demo.is_(True), Channel.adapter_type == "website")
    )
    channel = result.scalars().first()
    if not settings.DEMO_MODE or not channel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demo page not available")
    page = (WIDGET_DIR / "demo.html").read_text(encoding="utf-8")
    return page.replace("{{WIDGET_SNIPPET}}", WebsiteService.settings_of(channel).embed_snippet)


@router.get("/widget/{key}/config", response_model=WidgetConfig)
async def widget_config(channel: Channel = Depends(_widget), db: AsyncSession = Depends(get_db)):
    """
    Public. What the widget shows: business name, greeting, and the lead fields to ask for.
    Requests must come from one of the widget's allowed domains (403 otherwise).
    """
    return await WebsiteService.config_of(db, channel)


@router.post("/widget/{key}/sessions", response_model=VisitorSession)
async def start_session(channel: Channel = Depends(_widget)):
    """Public. Starts an anonymous visitor session; send the token as `X-Visitor-Token`."""
    return VisitorSession(visitor_token=WebsiteService.new_visitor_token(channel))


@router.get("/widget/{key}/messages", response_model=list[VisitorMessage])
async def visitor_history(
    channel: Channel = Depends(_widget),
    x_visitor_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Public. The visitor's chat history, so returning visitors see earlier messages."""
    visitor_id = WebsiteService.visitor_id(channel, x_visitor_token)
    return await WebsiteService.history(db, channel, visitor_id)


@router.post("/widget/{key}/messages", response_model=VisitorMessage, status_code=status.HTTP_201_CREATED)
async def visitor_message(
    data: VisitorMessageCreate,
    background_tasks: BackgroundTasks,
    channel: Channel = Depends(_widget),
    x_visitor_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Public. A visitor's message; the first one creates a `website` conversation in the inbox.
    At most 2,000 characters (422) and 20 messages per minute per visitor (429).
    """
    visitor_id = WebsiteService.visitor_id(channel, x_visitor_token)
    message = await WebsiteService.receive(db, channel, visitor_id, data.content)
    background_tasks.add_task(AiReplyService.answer, message.conversation_id)
    return message


@router.post("/widget/{key}/lead", status_code=status.HTTP_200_OK)
async def visitor_lead(
    data: LeadSubmit,
    channel: Channel = Depends(_widget),
    x_visitor_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Public. Saves the visitor's name, email, and phone on their contact (404 before their first message)."""
    visitor_id = WebsiteService.visitor_id(channel, x_visitor_token)
    await WebsiteService.save_lead(db, channel, visitor_id, data)
    return {"saved": True}


@router.get("/widget/{key}/events")
async def visitor_events(key: str, request: Request, token: str = ""):
    """
    Public. Server-sent `message.created` events for the visitor (replies from staff or the AI).
    The token is a query parameter because `EventSource` cannot send headers.
    """
    # Own session: a request-scoped one would stay open for the life of the stream.
    async with AsyncSessionLocal() as db:
        channel = await WebsiteService.widget_for(db, key, _origin(request))
    visitor_id = WebsiteService.visitor_id(channel, token)
    return StreamingResponse(
        EventService.stream(("visitor", visitor_id)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
