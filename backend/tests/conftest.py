"""
Shared fixtures: the app runs against a throwaway SQLite database with instant demo replies.
Environment is set before `app` is imported so the engine binds to the temp database.
"""

import os
import tempfile
import uuid
from pathlib import Path

_db_dir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{Path(_db_dir) / 'test.db'}"
os.environ["DEMO_MODE"] = "true"
os.environ["DEMO_REPLY_DELAY_SECONDS"] = "0"
os.environ["LLM_PROVIDER"] = "fake"

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.config.settings import settings
from app.db.models import Channel
from app.db.session import AsyncSessionLocal

API = settings.API_V1_STR


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def run_db(client, fn):
    """Runs `await fn(db)` on the app's own event loop, so DB connections are never shared across loops."""
    async def call():
        async with AsyncSessionLocal() as db:
            return await fn(db)
    return client.portal.call(call)


@pytest.fixture
def register(client):
    """Registers a fresh workspace and returns its auth headers."""
    def _register(workspace_name: str = "Test Cafe") -> dict:
        response = client.post(f"{API}/auth/register", json={
            "workspace_name": workspace_name,
            "name": "Owner",
            "email": f"owner-{uuid.uuid4().hex[:8]}@example.com",
            "password": "password123",
        })
        assert response.status_code == 201, response.text
        return auth_headers(response.json()["access_token"])
    return _register


@pytest.fixture
def add_channel(client):
    """Adds a simulated channel to the workspace behind `headers` (no channel-creation API exists yet)."""
    def _add(headers: dict, platform: str = "whatsapp") -> str:
        workspace_id = uuid.UUID(client.get(f"{API}/auth/me", headers=headers).json()["workspace"]["id"])

        async def create(db):
            channel = Channel(workspace_id=workspace_id, platform=platform, name=platform, adapter_type="simulated")
            db.add(channel)
            await db.commit()
            return str(channel.id)
        return run_db(client, create)
    return _add


@pytest.fixture
def demo_headers(client):
    response = client.post(f"{API}/auth/login", json={"email": settings.DEMO_EMAIL, "password": settings.DEMO_PASSWORD})
    assert response.status_code == 200, response.text
    return auth_headers(response.json()["access_token"])


@pytest.fixture
def llm_calls(monkeypatch):
    """Records every LLM call (messages, schema) while still using the fake provider."""
    from app.providers import llm
    calls = []
    original = llm.complete

    async def spy(messages, schema=None):
        calls.append({"messages": messages, "schema": schema})
        return await original(messages, schema)
    monkeypatch.setattr(llm, "complete", spy)
    return calls


@pytest.fixture
def llm_down(monkeypatch):
    """Makes every LLM call fail like an unavailable provider."""
    from app.providers import llm

    async def fail(messages, schema=None):
        raise llm.LLMError("provider down")
    monkeypatch.setattr(llm, "complete", fail)
