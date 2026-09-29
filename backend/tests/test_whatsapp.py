"""
WhatsApp Cloud API channel: connect, webhook handshake and signatures, inbound mapping, statuses, sending,
the 24-hour window, templates, and disconnect. Meta's Graph API is replaced by an httpx mock.
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select, update

from app.db.models import Channel, Message
from app.services.crypto import decrypt_secret, encrypt_secret
from tests.conftest import API, run_db

PHONE_ID = "109876543210"
WABA_ID = "208765432109"
GOOD_TOKEN = "EAAG-good-token"
APP_SECRET = "meta-app-secret"
CUSTOMER = "919812345678"
TEMPLATES = [
    {"name": "appointment_reminder", "language": "en_US", "status": "APPROVED", "category": "UTILITY",
     "components": [{"type": "BODY", "text": "Hi {{1}}, see you on {{2}}."}]},
    {"name": "hello_world", "language": "en_US", "status": "APPROVED", "category": "UTILITY",
     "components": [{"type": "HEADER", "format": "TEXT", "text": "Hello World"}, {"type": "BODY", "text": "Welcome!"}]},
]


@pytest.fixture
def graph(monkeypatch):
    """Fake Meta Graph API. Records requests; set `send_error` to make sends fail."""
    from app.providers import whatsapp
    state = {"requests": [], "send_error": None}

    def handler(request: httpx.Request) -> httpx.Response:
        state["requests"].append(request)
        if request.headers.get("Authorization") != f"Bearer {GOOD_TOKEN}":
            return httpx.Response(401, json={"error": {"message": "Invalid OAuth access token."}})
        path = request.url.path
        if request.method == "GET" and path.endswith(f"/{PHONE_ID}"):
            return httpx.Response(200, json={"id": PHONE_ID, "display_phone_number": "+91 98000 11111", "verified_name": "Corner Cafe"})
        if request.method == "POST" and path.endswith(f"/{PHONE_ID}/messages"):
            if state["send_error"]:
                return httpx.Response(400, json={"error": {"message": state["send_error"]}})
            if state.get("revoked"):
                return httpx.Response(401, json={"error": {"message": "Session has expired", "type": "OAuthException", "code": 190}})
            return httpx.Response(200, json={"messages": [{"id": f"wamid.out{len(state['requests'])}"}]})
        if request.method == "GET" and path.endswith(f"/{WABA_ID}/message_templates"):
            return httpx.Response(200, json={"data": TEMPLATES})
        return httpx.Response(404, json={"error": {"message": "Unknown path"}})

    monkeypatch.setattr(whatsapp, "_transport", httpx.MockTransport(handler))
    state["sends"] = lambda: [json.loads(r.content) for r in state["requests"] if r.method == "POST"]
    return state


def _connect(client, headers, token=GOOD_TOKEN):
    return client.post(f"{API}/channels/whatsapp", headers=headers, json={
        "phone_number_id": PHONE_ID, "waba_id": WABA_ID, "access_token": token, "app_secret": APP_SECRET,
    })


def _signed(client, channel_id, payload, secret=APP_SECRET, signature=None):
    raw = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if signature is None:
        signature = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if signature:
        headers["X-Hub-Signature-256"] = signature
    return client.post(f"{API}/webhooks/{channel_id}", content=raw, headers=headers)


def _event(messages=(), statuses=(), name="Ravi"):
    value = {"messaging_product": "whatsapp", "metadata": {"phone_number_id": PHONE_ID}}
    if messages:
        value["contacts"] = [{"profile": {"name": name}, "wa_id": CUSTOMER}]
        value["messages"] = list(messages)
    if statuses:
        value["statuses"] = list(statuses)
    return {"object": "whatsapp_business_account", "entry": [{"id": WABA_ID, "changes": [{"field": "messages", "value": value}]}]}


def _message(wamid, type_="text", **body):
    return {"from": CUSTOMER, "id": wamid, "timestamp": "1727600000", "type": type_, **body}


def _text(content, wamid="wamid.in1"):
    return _message(wamid, text={"body": content})


def _status(wamid, status):
    return {"id": wamid, "status": status, "timestamp": "1727600100", "recipient_id": CUSTOMER}


def _connected(client, register, graph):
    """A workspace with a connected WhatsApp number and one customer who just wrote in."""
    headers = register()
    channel_id = _connect(client, headers).json()["id"]
    assert _signed(client, channel_id, _event([_text("Hi, table for two tonight?")])).status_code == 200
    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]
    return headers, channel_id, conversation["id"]


def _messages(client, headers, conversation_id):
    return client.get(f"{API}/conversations/{conversation_id}/messages", headers=headers).json()


def _send(client, headers, conversation_id, content="Hello!", type_="text"):
    return client.post(f"{API}/conversations/{conversation_id}/messages", json={"content": content, "type": type_}, headers=headers)


# ---------- secrets ----------

def test_secrets_are_encrypted_and_round_trip():
    token = encrypt_secret(GOOD_TOKEN)
    assert token != GOOD_TOKEN and GOOD_TOKEN not in token
    assert decrypt_secret(token) == GOOD_TOKEN


# ---------- connect ----------

def test_connect_with_valid_credentials(client, register, graph):
    headers = register()
    response = _connect(client, headers)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["platform"] == "whatsapp" and body["adapter_type"] == "whatsapp" and body["status"] == "connected"
    assert body["webhook_url"].endswith(f"{API}/webhooks/{body['id']}")
    assert len(body["verify_token"]) >= 16
    assert "+91 98000 11111" in body["name"]

    listed = client.get(f"{API}/channels", headers=headers).json()
    assert [c["id"] for c in listed] == [body["id"]] and "config" not in listed[0]
    again = client.get(f"{API}/channels/{body['id']}/webhook", headers=headers).json()
    assert again == {"webhook_url": body["webhook_url"], "verify_token": body["verify_token"]}

    async def stored_config(db):
        return (await db.get(Channel, uuid.UUID(body["id"]))).config
    config = run_db(client, stored_config)
    assert GOOD_TOKEN not in json.dumps(config) and APP_SECRET not in json.dumps(config)
    assert decrypt_secret(config["access_token"]) == GOOD_TOKEN and decrypt_secret(config["app_secret"]) == APP_SECRET


def test_connect_rejected_by_meta_saves_nothing(client, register, graph):
    headers = register()
    response = _connect(client, headers, token="bad-token")
    assert response.status_code == 400
    assert "Invalid OAuth access token" in response.json()["detail"]
    assert client.get(f"{API}/channels", headers=headers).json() == []


# ---------- webhooks ----------

def test_webhook_verification_handshake(client, register, graph):
    body = _connect(client, register()).json()
    params = {"hub.mode": "subscribe", "hub.verify_token": body["verify_token"], "hub.challenge": "1158201444"}
    ok = client.get(f"{API}/webhooks/{body['id']}", params=params)
    assert ok.status_code == 200 and ok.text == "1158201444"
    wrong = client.get(f"{API}/webhooks/{body['id']}", params={**params, "hub.verify_token": "nope"})
    assert wrong.status_code == 403


def test_signed_text_reaches_inbox_once(client, register, graph):
    headers, channel_id, conversation_id = _connected(client, register, graph)
    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]
    assert conversation["platform"] == "whatsapp" and conversation["external_id"] == CUSTOMER
    assert conversation["contact"]["name"] == "Ravi"
    assert [m["content"] for m in _messages(client, headers, conversation_id)] == ["Hi, table for two tonight?"]

    retry = _signed(client, channel_id, _event([_text("Hi, table for two tonight?")]))
    assert retry.status_code == 200 and retry.json()["received"] == 0


def test_bad_or_missing_signature_is_rejected(client, register, graph):
    headers = register()
    channel_id = _connect(client, headers).json()["id"]
    assert _signed(client, channel_id, _event([_text("Hi")]), secret="wrong-secret").status_code == 401
    assert _signed(client, channel_id, _event([_text("Hi")]), signature="").status_code == 401
    assert client.get(f"{API}/conversations", headers=headers).json() == []


def test_media_messages_are_mapped(client, register, graph):
    headers = register()
    channel_id = _connect(client, headers).json()["id"]
    _signed(client, channel_id, _event([
        _message("wamid.m1", "image", image={"id": "media-1", "caption": "Look at this", "mime_type": "image/jpeg"}),
        _message("wamid.m2", "document", document={"id": "media-2", "filename": "menu.pdf"}),
        _message("wamid.m3", "audio", audio={"id": "media-3"}),
        _message("wamid.m4", "sticker", sticker={"id": "media-4"}),
    ]))
    conversation_id = client.get(f"{API}/conversations", headers=headers).json()[0]["id"]
    assert [(m["type"], m["content"]) for m in _messages(client, headers, conversation_id)] == [
        ("image", "Look at this"), ("file", "[document]"), ("audio", "[audio]"),
    ]


# ---------- sending ----------

def test_send_text_through_cloud_api(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph)
    sent = _send(client, headers, conversation_id, "Yes, 8 pm works!")
    assert sent.status_code == 201
    assert sent.json()["status"] == "sent" and sent.json()["external_id"].startswith("wamid.out")
    assert graph["sends"]()[-1] == {"messaging_product": "whatsapp", "to": CUSTOMER, "type": "text", "text": {"body": "Yes, 8 pm works!"}}


def test_send_media_through_cloud_api(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph)
    _send(client, headers, conversation_id, "https://cdn.example.com/menu.jpg", "image")
    _send(client, headers, conversation_id, "https://cdn.example.com/menu.pdf", "file")
    image, document = graph["sends"]()[-2:]
    assert image["type"] == "image" and image["image"] == {"link": "https://cdn.example.com/menu.jpg"}
    assert document["type"] == "document" and document["document"] == {"link": "https://cdn.example.com/menu.pdf"}


def test_meta_send_error_marks_message_failed(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph)
    graph["send_error"] = "Recipient phone number not in allowed list"
    assert _send(client, headers, conversation_id).json()["status"] == "failed"


def test_expired_token_disconnects_number(client, register, graph):
    headers, channel_id, conversation_id = _connected(client, register, graph)
    graph["revoked"] = True
    assert _send(client, headers, conversation_id).json()["status"] == "failed"
    assert client.get(f"{API}/channels", headers=headers).json()[0]["status"] == "disconnected"
    assert _send(client, headers, conversation_id).status_code == 409


def _age_inbound(client, conversation_id, hours):
    async def age(db):
        await db.execute(
            update(Message)
            .where(Message.conversation_id == uuid.UUID(conversation_id))
            .values(created_at=datetime.now(timezone.utc) - timedelta(hours=hours))
        )
        await db.commit()
    run_db(client, age)


def test_closed_24_hour_window_blocks_free_form(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph)
    _age_inbound(client, conversation_id, 30)
    sends_before = len(graph["sends"]())

    response = _send(client, headers, conversation_id)
    assert response.status_code == 409
    assert "template" in response.json()["detail"]
    assert len(graph["sends"]()) == sends_before
    assert len(_messages(client, headers, conversation_id)) == 1


# ---------- delivery statuses ----------

def test_delivery_statuses_update_messages(client, register, graph, monkeypatch):
    from app.services.event_service import EventService
    events = []
    monkeypatch.setattr(EventService, "publish", classmethod(lambda cls, ws, event, data: events.append((event, data))))

    headers, channel_id, conversation_id = _connected(client, register, graph)
    first = _send(client, headers, conversation_id, "One").json()
    second = _send(client, headers, conversation_id, "Two").json()

    _signed(client, channel_id, _event(statuses=[_status(first["external_id"], "read")]))
    _signed(client, channel_id, _event(statuses=[_status(first["external_id"], "delivered")]))  # late, out of order
    _signed(client, channel_id, _event(statuses=[_status(second["external_id"], "failed")]))

    statuses = {m["id"]: m["status"] for m in _messages(client, headers, conversation_id)}
    assert statuses[first["id"]] == "read" and statuses[second["id"]] == "failed"
    updated = [(data.id, data.status) for event, data in events if event == "message.updated"]
    assert updated == [(uuid.UUID(first["id"]), "read"), (uuid.UUID(second["id"]), "failed")]


# ---------- templates ----------

def test_list_templates(client, register, graph):
    headers, channel_id, _ = _connected(client, register, graph)
    templates = client.get(f"{API}/channels/{channel_id}/templates", headers=headers).json()
    assert [(t["name"], t["language"], t["parameter_count"]) for t in templates] == [
        ("appointment_reminder", "en_US", 2), ("hello_world", "en_US", 0),
    ]
    assert templates[0]["body"] == "Hi {{1}}, see you on {{2}}."


def test_send_template_outside_window(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph)
    _age_inbound(client, conversation_id, 30)
    response = client.post(f"{API}/conversations/{conversation_id}/template", headers=headers, json={
        "name": "appointment_reminder", "language": "en_US", "parameters": ["Ravi", "Friday"],
    })
    assert response.status_code == 201, response.text
    assert response.json()["type"] == "template" and response.json()["content"] == "Hi Ravi, see you on Friday."
    assert graph["sends"]()[-1] == {
        "messaging_product": "whatsapp", "to": CUSTOMER, "type": "template",
        "template": {"name": "appointment_reminder", "language": {"code": "en_US"}, "components": [
            {"type": "body", "parameters": [{"type": "text", "text": "Ravi"}, {"type": "text", "text": "Friday"}]},
        ]},
    }
    assert _messages(client, headers, conversation_id)[-1]["type"] == "template"


def test_template_errors(client, register, graph, add_channel):
    headers, _, conversation_id = _connected(client, register, graph)
    sends_before = len(graph["sends"]())
    url = f"{API}/conversations/{conversation_id}/template"
    missing = client.post(url, headers=headers, json={"name": "appointment_reminder", "language": "en_US", "parameters": ["Ravi"]})
    assert missing.status_code == 422
    unknown = client.post(url, headers=headers, json={"name": "nope", "language": "en_US", "parameters": []})
    assert unknown.status_code == 404
    assert len(graph["sends"]()) == sends_before

    simulated = add_channel(headers)
    assert client.get(f"{API}/channels/{simulated}/templates", headers=headers).status_code == 400


# ---------- disconnect ----------

def test_disconnect_keeps_history_and_rejects_traffic(client, register, graph):
    headers, channel_id, conversation_id = _connected(client, register, graph)
    assert client.delete(f"{API}/channels/{channel_id}", headers=headers).status_code == 204

    channel = client.get(f"{API}/channels", headers=headers).json()[0]
    assert channel["status"] == "disconnected" and channel["ai_enabled"] is False

    async def stored_config(db):
        return (await db.execute(select(Channel.config).where(Channel.id == uuid.UUID(channel_id)))).scalar_one()
    assert run_db(client, stored_config) == {}

    assert len(_messages(client, headers, conversation_id)) == 1
    assert _signed(client, channel_id, _event([_text("Hello?", "wamid.after")])).status_code == 410
    assert _send(client, headers, conversation_id).status_code == 409
    assert client.delete(f"{API}/channels/{channel_id}", headers=register()).status_code == 404


# ---------- demo ----------

def test_demo_reset_removes_connected_numbers(client, demo_headers, graph):
    assert _connect(client, demo_headers).status_code == 201
    assert client.post(f"{API}/demo/reset", headers=demo_headers).status_code == 204
    channels = client.get(f"{API}/channels", headers=demo_headers).json()
    assert sorted(c["adapter_type"] for c in channels) == ["simulated"] * 4 + ["website"]
