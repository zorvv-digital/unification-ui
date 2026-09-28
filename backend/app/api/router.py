from fastapi import APIRouter
from app.api.auth import router as auth_router
from app.api.conversations import router as conversations_router
from app.api.contacts import router as contacts_router
from app.api.channels import router as channels_router, webhook_router
from app.api.events import router as events_router
from app.api.demo import router as demo_router
from app.api.knowledge import router as knowledge_router
from app.api.agents import router as agents_router
from app.models.schemas import HealthResponse

api_router = APIRouter()

api_router.include_router(auth_router)
api_router.include_router(conversations_router)
api_router.include_router(contacts_router)
api_router.include_router(channels_router)
api_router.include_router(webhook_router)
api_router.include_router(events_router)
api_router.include_router(demo_router)
api_router.include_router(knowledge_router)
api_router.include_router(agents_router)


@api_router.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    return {"status": "ok"}
