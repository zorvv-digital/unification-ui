"""
Unified inbox and channel adapters: listing, sending, receiving via webhook, read state, isolation, and events.
"""

import asyncio
import json
import uuid

from app.models.schemas import HealthResponse
from app.services.channel_service import ChannelError, SimulatedAdapter, WebhookAuthError
from app.services.event_service import EventService
from tests.conftest import API


def _webhook(client, channel_id, **body):
    body.setdefault("customer_id", f"cust-{uuid.uuid4().hex[:6]}")
    body.setdefault("content", "Hello")
    return client.post(f"{API}/webhooks/{channel_id}", json=body)


def _conversation_for(client, headers, customer_id):
    return next(c for c in client.get(f"{API}/conversations", headers=headers).json() if c["external_id"] == customer_id)


def test_channels_hide_config(client, demo_headers):
    channels = client.get(f"{API}/channels", headers=demo_headers).json()
    assert {c["platform"] for c in channels} == {"whatsapp", "instagram", "messenger", "gmail"}
    assert all("config" not in c for c in channels)


def test_list_conversations_newest_first_and_filters(client, demo_headers):
    conversations = client.get(f"{API}/conversations", headers=demo_headers).json()
    times = [c["last_message_at"] for c in conversations]
    assert times == sorted(times, reverse=True)
    assert conversations[0]["contact"]["name"]
    assert conversations[0]["last_message_at"].endswith("+00:00")

    filtered = client.get(f"{API}/conversations", params={"platform": "instagram", "status": "open"}, headers=demo_headers).json()
    assert filtered and all(c["platform"] == "instagram" and c["status"] == "open" for c in filtered)

    assert client.get(f"{API}/conversations", params={"platform": "myspace"}, headers=demo_headers).status_code == 422


def test_webhook_creates_contact_conversation_and_ignores_duplicates(client, register, add_channel):
    headers = register()
    channel_id = add_channel(headers, "messenger")

    first = _webhook(client, channel_id, customer_id="nina-1", name="Nina", message_id="ext-1", content="Hi there")
    assert first.json() == {"received": 1}
    duplicate = _webhook(client, channel_id, customer_id="nina-1", message_id="ext-1", content="Hi there")
    assert duplicate.json() == {"received": 0}

    conversation = _conversation_for(client, headers, "nina-1")
    assert conversation["contact"]["name"] == "Nina"
    assert conversation["unread_count"] == 1
    assert conversation["platform"] == "messenger"


def test_webhook_unknown_channel_and_bad_payload(client, register, add_channel):
    assert _webhook(client, uuid.uuid4()).status_code == 404
    channel_id = add_channel(register())
    assert client.post(f"{API}/webhooks/{channel_id}", json={"customer_id": "x", "content": " "}).status_code == 422


def test_webhook_auth_failure(client, register, add_channel, monkeypatch):
    channel_id = add_channel(register())

    def reject(self, channel, headers, body):
        raise WebhookAuthError()
    monkeypatch.setattr(SimulatedAdapter, "parse_webhook", reject)
    assert _webhook(client, channel_id).status_code == 401


def test_send_message_and_validation(client, register, add_channel):
    headers = register()
    _webhook(client, add_channel(headers), customer_id="c-send")
    url = f"{API}/conversations/{_conversation_for(client, headers, 'c-send')['id']}/messages"

    assert client.post(url, json={"content": "   "}, headers=headers).status_code == 422

    sent = client.post(url, json={"content": "See you at 7:30!"}, headers=headers)
    assert sent.status_code == 201
    body = sent.json()
    assert body["direction"] == "outbound" and body["status"] == "sent" and body["external_id"].startswith("sim-")

    messages = client.get(url, headers=headers).json()
    assert [m["direction"] for m in messages] == ["inbound", "outbound"]
    assert messages[-1]["id"] == body["id"]


def test_send_to_closed_conversation_reopens(client, register, add_channel):
    headers = register()
    _webhook(client, add_channel(headers), customer_id="c-closed")
    conversation_id = _conversation_for(client, headers, "c-closed")["id"]
    client.patch(f"{API}/conversations/{conversation_id}", json={"status": "closed"}, headers=headers)

    client.post(f"{API}/conversations/{conversation_id}/messages", json={"content": "Hello again"}, headers=headers)
    assert _conversation_for(client, headers, "c-closed")["status"] == "open"


def test_send_failure_marks_failed(client, register, add_channel, monkeypatch):
    headers = register()
    _webhook(client, add_channel(headers), customer_id="c-fail")
    conversation_id = _conversation_for(client, headers, "c-fail")["id"]

    async def fail(self, channel, conversation, message):
        raise ChannelError("down")
    monkeypatch.setattr(SimulatedAdapter, "send", fail)
    sent = client.post(f"{API}/conversations/{conversation_id}/messages", json={"content": "Hi"}, headers=headers)
    assert sent.status_code == 201 and sent.json()["status"] == "failed"


def test_mark_read_and_close(client, register, add_channel):
    headers = register()
    channel_id = add_channel(headers)
    for i in range(3):
        _webhook(client, channel_id, customer_id="c-read", message_id=f"r{i}", content=f"msg {i}")
    conversation = _conversation_for(client, headers, "c-read")
    assert conversation["unread_count"] == 3

    read = client.post(f"{API}/conversations/{conversation['id']}/read", headers=headers).json()
    assert read["unread_count"] == 0
    messages = client.get(f"{API}/conversations/{conversation['id']}/messages", headers=headers).json()
    assert all(m["status"] == "read" for m in messages if m["direction"] == "inbound")

    closed = client.patch(f"{API}/conversations/{conversation['id']}", json={"status": "closed"}, headers=headers).json()
    assert closed["status"] == "closed"
    open_ids = [c["id"] for c in client.get(f"{API}/conversations", params={"status": "open"}, headers=headers).json()]
    assert conversation["id"] not in open_ids


def test_contact_details(client, demo_headers):
    conversation = client.get(f"{API}/conversations", headers=demo_headers).json()[0]
    contact = client.get(f"{API}/contacts/{conversation['contact']['id']}", headers=demo_headers).json()
    assert contact["name"] == conversation["contact"]["name"]
    assert conversation["id"] in contact["conversation_ids"]


def test_workspace_isolation(client, demo_headers, register):
    other = register("Other Business")
    conversation = client.get(f"{API}/conversations", headers=demo_headers).json()[0]
    assert client.get(f"{API}/conversations", headers=other).json() == []
    assert client.get(f"{API}/conversations/{conversation['id']}/messages", headers=other).status_code == 404
    assert client.post(f"{API}/conversations/{conversation['id']}/messages", json={"content": "x"}, headers=other).status_code == 404
    assert client.post(f"{API}/conversations/{conversation['id']}/read", headers=other).status_code == 404
    assert client.patch(f"{API}/conversations/{conversation['id']}", json={"status": "closed"}, headers=other).status_code == 404
    assert client.get(f"{API}/contacts/{conversation['contact']['id']}", headers=other).status_code == 404


def test_events_reach_only_their_workspace():
    async def scenario():
        workspace_a, workspace_b = uuid.uuid4(), uuid.uuid4()
        stream = EventService.stream(workspace_a)
        next_frame = asyncio.create_task(stream.__anext__())
        await asyncio.sleep(0)
        EventService.publish(workspace_b, "message.created", HealthResponse(status="for-b"))
        EventService.publish(workspace_a, "message.created", HealthResponse(status="for-a"))
        frame = await asyncio.wait_for(next_frame, 1)
        await stream.aclose()
        return frame

    frame = asyncio.run(scenario())
    assert frame.startswith("event: message.created\n")
    assert json.loads(frame.split("data: ")[1]) == {"status": "for-a"}
