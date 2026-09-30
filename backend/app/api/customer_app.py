from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal, get_db
from app.models.schemas import CustomerAppConfig, CustomerMessage, CustomerMessageCreate, CustomerSession, CustomerSessionCreate
from app.services.ai_reply_service import AiReplyService
from app.services.customer_app_service import CustomerAppService
from app.services.event_service import EventService

router = APIRouter(prefix="/customer-app", tags=["Customer app (demo)"])


@router.get("/config", response_model=CustomerAppConfig)
async def customer_app_config(db: AsyncSession = Depends(get_db)):
    """Public, demo mode only (404 otherwise). The demo business's name and the platforms the customer can use."""
    return await CustomerAppService.config(db)


@router.post("/sessions", response_model=CustomerSession)
async def start_session(data: CustomerSessionCreate, db: AsyncSession = Depends(get_db)):
    """Public. Starts a customer session (name up to 60 characters); send the token as `X-Customer-Token`."""
    return await CustomerAppService.new_session(db, data.name)


@router.get("/messages", response_model=list[CustomerMessage])
async def customer_history(x_customer_token: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)):
    """Public. The customer's messages on every platform, oldest first."""
    workspace, sid, _ = await CustomerAppService.session_of(db, x_customer_token)
    return await CustomerAppService.history(db, workspace, sid)


@router.post("/messages", response_model=CustomerMessage, status_code=status.HTTP_201_CREATED)
async def customer_message(
    data: CustomerMessageCreate,
    background_tasks: BackgroundTasks,
    x_customer_token: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Public. A customer message on `whatsapp`, `instagram`, `messenger`, or `gmail`; it reaches the demo inbox like a
    real one. The first Gmail message needs a `subject`. At most 2,000 characters (422) and 20 messages per minute (429).
    """
    workspace, sid, name = await CustomerAppService.session_of(db, x_customer_token)
    message = await CustomerAppService.receive(db, workspace, sid, name, data)
    background_tasks.add_task(AiReplyService.answer, message.conversation_id)
    return message


@router.get("/events")
async def customer_events(token: str = ""):
    """
    Public. Server-sent `message.created` (every message of the session, including staff and AI replies) and
    `conversation.read` (staff opened the conversation) events. The token is a query parameter because `EventSource`
    cannot send headers.
    """
    # Own session: a request-scoped one would stay open for the life of the stream.
    async with AsyncSessionLocal() as db:
        _, sid, _ = await CustomerAppService.session_of(db, token)
    return StreamingResponse(
        EventService.stream(("customer", sid)),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
