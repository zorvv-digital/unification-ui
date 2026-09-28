"""
Demo workspace: idempotent seeding, simulated replies, and reset.
"""

import time

from sqlalchemy import func, select

from app.db.models import Workspace
from app.services.demo_service import DemoService
from tests.conftest import API, run_db


def _wait_for_count(client, url, headers, expected, timeout=3.0):
    deadline = time.time() + timeout
    messages = client.get(url, headers=headers).json()
    while len(messages) < expected and time.time() < deadline:
        time.sleep(0.05)
        messages = client.get(url, headers=headers).json()
    return messages


def test_seed_is_idempotent(client, demo_headers):
    assert client.get(f"{API}/auth/me", headers=demo_headers).json()["workspace"]["is_demo"] is True

    async def seed_again_and_count(db):
        await DemoService.ensure_demo_workspace(db)
        result = await db.execute(select(func.count()).where(Workspace.is_demo.is_(True)))
        return result.scalar_one()
    assert run_db(client, seed_again_and_count) == 1


def test_simulated_reply_in_demo(client, demo_headers):
    conversation = client.get(f"{API}/conversations", headers=demo_headers).json()[0]
    url = f"{API}/conversations/{conversation['id']}/messages"
    before = len(client.get(url, headers=demo_headers).json())

    client.post(url, json={"content": "Does 7:30 work?"}, headers=demo_headers)
    messages = _wait_for_count(client, url, demo_headers, before + 2)
    assert len(messages) == before + 2
    assert messages[-1]["direction"] == "inbound"


def test_no_simulated_reply_outside_demo(client, register, add_channel):
    headers = register()
    client.post(f"{API}/webhooks/{add_channel(headers)}", json={"customer_id": "real-1", "content": "Hi"})
    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]
    url = f"{API}/conversations/{conversation['id']}/messages"

    client.post(url, json={"content": "Hello!"}, headers=headers)
    messages = _wait_for_count(client, url, headers, 3, timeout=0.5)
    assert len(messages) == 2


def test_reset_restores_seed(client, demo_headers, register):
    conversations = client.get(f"{API}/conversations", headers=demo_headers).json()
    client.post(f"{API}/webhooks/{conversations[0]['channel_id']}", json={"customer_id": "extra-customer", "content": "hi"})
    assert any(c["external_id"] == "extra-customer" for c in client.get(f"{API}/conversations", headers=demo_headers).json())

    assert client.post(f"{API}/demo/reset", headers=demo_headers).status_code == 204
    after = client.get(f"{API}/conversations", headers=demo_headers).json()
    assert not any(c["external_id"] == "extra-customer" for c in after)
    assert len(after) == 6

    assert client.post(f"{API}/demo/reset", headers=register()).status_code == 403
