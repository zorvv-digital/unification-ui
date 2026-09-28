from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.db.session import AsyncSessionLocal
from app.services.auth_service import AuthService
from app.services.event_service import EventService

router = APIRouter(prefix="/events", tags=["Events"])


@router.get("")
async def stream_events(token: str):
    """
    Server-sent event stream of `message.created` and `conversation.updated` for the caller's workspace.
    The token is a query parameter because browser `EventSource` cannot send headers.
    """
    # Own session: a request-scoped one would stay open for the life of the stream.
    async with AsyncSessionLocal() as db:
        user = await AuthService.get_user_from_token(db, token)
    return StreamingResponse(
        EventService.stream(user.workspace_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
