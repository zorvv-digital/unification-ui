import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import settings
from app.api.router import api_router
from app.db.session import engine, Base, AsyncSessionLocal
from app.services.demo_service import DemoService
from app.services.sync_service import SyncService
import app.db.models  # Register models for metadata creation

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Automatic table creation and demo workspace seeding on startup; background channel sync while running."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSessionLocal() as db:
        await DemoService.ensure_demo_workspace(db)
    sync = asyncio.create_task(SyncService.run_forever()) if settings.GMAIL_SYNC_SECONDS > 0 else None
    yield
    if sync:
        sync.cancel()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

class PathCORS:
    """
    CORS per path: the public website widget API is called from customers' sites, so it accepts any origin
    (it checks the widget's allowed domains itself); everything else only allows `CORS_ORIGINS`.
    Auth uses Bearer headers, not cookies, so credentials are not needed for CORS.
    """

    def __init__(self, app):
        self.widget = CORSMiddleware(app, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
        self.default = CORSMiddleware(app, allow_origins=settings.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

    async def __call__(self, scope, receive, send):
        is_widget = scope["type"] == "http" and scope["path"].startswith(f"{settings.API_V1_STR}/widget")
        await (self.widget if is_widget else self.default)(scope, receive, send)


app.add_middleware(PathCORS)

app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
async def root():
    return {
        "message": f"Welcome to {settings.PROJECT_NAME}",
        "docs": "/docs",
        "version": settings.VERSION,
    }
