"""
Messenger and Instagram channels (Messenger Platform): connect a Page, webhook handshake and signatures,
inbound mapping and names, replies, the 24-hour window, and token health. Meta's Graph API is an httpx mock.
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import update

from app.db.models import Channel, Message
from app.services.crypto import decrypt_secret
from tests.conftest import API, run_db

PAGE_ID = "112233445566"
PAGE_NO_IG = "665544332211"
IG_ID = "17841400000000001"
PAGE_TOKEN = "EAAP-page-token"
APP_SECRET = "meta-app-secret"
PSID = "7000000000000001"
IGSID = "8000000000000001"
NAMES = {PSID: "Priya Shah", IGSID: "Arjun Mehta"}


@pytest.fixture
def graph(monkeypatch):
    """Fake Meta Graph API. Records requests; set `revoked` to make the Page token invalid (code 190)."""
    from app.providers import whatsapp
    state = {"requests": [], "revoked": False, "send_error": None}

    def handler(request: httpx.Request) -> httpx.Response:
        state["requests"].append(request)
        if request.headers.get("Authorization") != f"Bearer {PAGE_TOKEN}" or state["revoked"]:
            return httpx.Response(400, json={"error": {"message": "Error validating access token", "type": "OAuthException", "code": 190}})
        path = request.url.path.rsplit("/", 2)
        if request.method == "GET" and path[-1] == PAGE_ID:
            return httpx.Response(200, json={"id": PAGE_ID, "name": "Corner Cafe", "instagram_business_account": {"id": IG_ID, "username": "cornercafe"}})
        if request.method == "GET" and path[-1] == PAGE_NO_IG:
            return httpx.Response(200, json={"id": PAGE_NO_IG, "name": "Side Shop"})
        if request.method == "GET" and path[-1] in NAMES:
            return httpx.Response(200, json={"id": path[-1], "name": NAMES[path[-1]]})
        if request.method == "POST" and path[-2:] == [PAGE_ID, "messages"]:
            if state["send_error"]:
                return httpx.Response(400, json={"error": {"message": state["send_error"], "code": 100}})
            return httpx.Response(200, json={"recipient_id": "x", "message_id": f"m_out{len(state['requests'])}"})
        return httpx.Response(404, json={"error": {"message": "Unknown path", "code": 803}})

    monkeypatch.setattr(whatsapp, "_transport", httpx.MockTransport(handler))
    state["sends"] = lambda: [json.loads(r.content) for r in state["requests"] if r.method == "POST"]
    return state


def _connect(client, headers, page_id=PAGE_ID, token=PAGE_TOKEN):
    return client.post(f"{API}/channels/meta", headers=headers, json={
        "page_id": page_id, "page_access_token": token, "app_secret": APP_SECRET,
    })


def _by_platform(channels):
    return {c["platform"]: c for c in channels}


def _signed(client, channel_id, payload, secret=APP_SECRET, signature=None):
    raw = json.dumps(payload).encode()
    headers = {"Content-Type": "application/json"}
    if signature is None:
        signature = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    if signature:
        headers["X-Hub-Signature-256"] = signature
    return client.post(f"{API}/webhooks/{channel_id}", content=raw, headers=headers)


def _event(*messaging, platform="messenger"):
    own = PAGE_ID if platform == "messenger" else IG_ID
    return {"object": "page" if platform == "messenger" else "instagram",
            "entry": [{"id": own, "time": 1727600000, "messaging": list(messaging)}]}


def _dm(mid, text=None, sender=PSID, recipient=PAGE_ID, **message):
    body = {"mid": mid, **message}
    if text is not None:
        body["text"] = text
    return {"sender": {"id": sender}, "recipient": {"id": recipient}, "timestamp": 1727600000, "message": body}


def _connected(client, register, graph, platform="messenger"):
    """A workspace with a connected Page and one customer who just wrote on `platform`."""
    headers = register()
    channel_id = _by_platform(_connect(client, headers).json())[platform]["id"]
    sender, recipient = (PSID, PAGE_ID) if platform == "messenger" else (IGSID, IG_ID)
    assert _signed(client, channel_id, _event(_dm("m_in1", "Hi, are you open?", sender, recipient), platform=platform)).status_code == 200
    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]
    return headers, channel_id, conversation["id"]


def _messages(client, headers, conversation_id):
    return client.get(f"{API}/conversations/{conversation_id}/messages", headers=headers).json()


def _send(client, headers, conversation_id, content="Yes, until 10!", type_="text"):
    return client.post(f"{API}/conversations/{conversation_id}/messages", json={"content": content, "type": type_}, headers=headers)


def _stored_config(client, channel_id):
    async def load(db):
        return (await db.get(Channel, uuid.UUID(channel_id))).config
    return run_db(client, load)


# ---------- connect ----------

def test_connect_page_with_instagram(client, register, graph):
    headers = register()
    response = _connect(client, headers)
    assert response.status_code == 201, response.text
    channels = _by_platform(response.json())
    assert set(channels) == {"messenger", "instagram"}
    assert channels["messenger"]["name"] == "Corner Cafe" and channels["instagram"]["name"] == "@cornercafe"
    for c in channels.values():
        assert c["status"] == "connected" and c["adapter_type"] == c["platform"]
        assert c["webhook_url"].endswith(f"{API}/webhooks/{c['id']}") and len(c["verify_token"]) >= 16

    config = _stored_config(client, channels["instagram"]["id"])
    assert PAGE_TOKEN not in json.dumps(config) and APP_SECRET not in json.dumps(config)
    assert decrypt_secret(config["access_token"]) == PAGE_TOKEN and config["page_id"] == PAGE_ID and config["ig_id"] == IG_ID
    assert "config" not in client.get(f"{API}/channels", headers=headers).json()[0]


def test_connect_page_without_instagram(client, register, graph):
    headers = register()
    response = _connect(client, headers, page_id=PAGE_NO_IG)
    assert response.status_code == 201, response.text
    assert [c["platform"] for c in response.json()] == ["messenger"]


def test_connect_rejected_by_meta_saves_nothing(client, register, graph):
    headers = register()
    response = _connect(client, headers, token="bad-token")
    assert response.status_code == 400 and "Error validating access token" in response.json()["detail"]
    assert client.get(f"{API}/channels", headers=headers).json() == []


def test_reconnect_reuses_channels(client, register, graph):
    headers = register()
    first = _by_platform(_connect(client, headers).json())
    again = _by_platform(_connect(client, headers).json())
    for platform in ("messenger", "instagram"):
        assert again[platform]["id"] == first[platform]["id"]
        assert again[platform]["verify_token"] == first[platform]["verify_token"]
    assert len(client.get(f"{API}/channels", headers=headers).json()) == 2


# ---------- webhooks ----------

def test_webhook_verification_handshake(client, register, graph):
    channel = _connect(client, register()).json()[0]
    params = {"hub.mode": "subscribe", "hub.verify_token": channel["verify_token"], "hub.challenge": "42"}
    assert client.get(f"{API}/webhooks/{channel['id']}", params=params).text == "42"
    params["hub.verify_token"] = "wrong"
    assert client.get(f"{API}/webhooks/{channel['id']}", params=params).status_code == 403


def test_messenger_text_reaches_inbox_with_name(client, register, graph):
    headers, channel_id, conversation_id = _connected(client, register, graph)
    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]
    assert conversation["platform"] == "messenger" and conversation["contact"]["name"] == "Priya Shah"
    assert [m["content"] for m in _messages(client, headers, conversation_id)] == ["Hi, are you open?"]

    # Meta retries the same mid: stored once
    assert _signed(client, channel_id, _event(_dm("m_in1", "Hi, are you open?"))).json()["received"] == 0


def test_instagram_dm_reaches_inbox(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph, platform="instagram")
    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]
    assert conversation["id"] == conversation_id
    assert conversation["platform"] == "instagram" and conversation["contact"]["name"] == "Arjun Mehta"


def test_attachments_echoes_and_reads(client, register, graph):
    headers, channel_id, conversation_id = _connected(client, register, graph)
    response = _signed(client, channel_id, _event(
        _dm("m_img", attachments=[{"type": "image", "payload": {"url": "https://cdn.example/x.jpg"}}]),
        _dm("m_echo", "Sent from Meta Business Suite", sender=PAGE_ID, recipient=PSID, is_echo=True),
        {"sender": {"id": PSID}, "recipient": {"id": PAGE_ID}, "timestamp": 1727600001, "read": {"watermark": 1727600000}},
        _dm("m_sticker", attachments=[{"type": "fallback", "payload": {}}]),
    ))
    assert response.status_code == 200 and response.json()["received"] == 1
    last = _messages(client, headers, conversation_id)[-1]
    assert (last["type"], last["content"]) == ("image", "[image]")


def test_unknown_sender_name_falls_back_to_id(client, register, graph):
    headers = register()
    channel_id = _by_platform(_connect(client, headers).json())["messenger"]["id"]
    _signed(client, channel_id, _event(_dm("m_x", "hello", sender="7000000000000999")))
    assert client.get(f"{API}/conversations", headers=headers).json()[0]["contact"]["name"] == "7000000000000999"


def test_bad_or_missing_signature_is_rejected(client, register, graph):
    headers = register()
    channel_id = _connect(client, headers).json()[0]["id"]
    assert _signed(client, channel_id, _event(_dm("m_1", "hi")), secret="wrong").status_code == 401
    assert _signed(client, channel_id, _event(_dm("m_1", "hi")), signature="").status_code == 401
    assert client.get(f"{API}/conversations", headers=headers).json() == []


# ---------- sending ----------

def test_reply_through_messenger_platform(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph, platform="instagram")
    sent = _send(client, headers, conversation_id).json()
    assert sent["status"] == "sent" and sent["external_id"].startswith("m_out")
    assert graph["sends"]()[-1] == {"recipient": {"id": IGSID}, "messaging_type": "RESPONSE", "message": {"text": "Yes, until 10!"}}

    _send(client, headers, conversation_id, "https://cdn.example/menu.pdf", "file")
    assert graph["sends"]()[-1]["message"] == {"attachment": {"type": "file", "payload": {"url": "https://cdn.example/menu.pdf"}}}


def test_meta_send_error_marks_message_failed(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph)
    graph["send_error"] = "This person isn't available right now"
    assert _send(client, headers, conversation_id).json()["status"] == "failed"
    assert client.get(f"{API}/channels", headers=headers).json()[0]["status"] == "connected"


def test_closed_window_blocks_reply(client, register, graph):
    headers, _, conversation_id = _connected(client, register, graph, platform="instagram")

    async def age(db):
        await db.execute(update(Message).where(Message.conversation_id == uuid.UUID(conversation_id))
                         .values(created_at=datetime.now(timezone.utc) - timedelta(days=3)))
        await db.commit()
    run_db(client, age)
    sends_before = len(graph["sends"]())

    response = _send(client, headers, conversation_id)
    assert response.status_code == 409
    assert "24-hour" in response.json()["detail"] and "template" not in response.json()["detail"]
    assert len(graph["sends"]()) == sends_before


# ---------- token health ----------

def test_revoked_token_disconnects_channel(client, register, graph, monkeypatch):
    from app.services.event_service import EventService
    events = []
    monkeypatch.setattr(EventService, "publish", classmethod(lambda cls, ws, event, data: events.append((event, data))))

    headers, channel_id, conversation_id = _connected(client, register, graph)
    graph["revoked"] = True
    assert _send(client, headers, conversation_id).json()["status"] == "failed"

    channel = next(c for c in client.get(f"{API}/channels", headers=headers).json() if c["id"] == channel_id)
    assert channel["status"] == "disconnected"
    assert [data.status for event, data in events if event == "channel.updated"] == ["disconnected"]
    assert _stored_config(client, channel_id)["page_id"] == PAGE_ID  # kept so reconnecting reuses the channel
    assert _send(client, headers, conversation_id).status_code == 409

    graph["revoked"] = False
    assert _by_platform(_connect(client, headers).json())["messenger"]["id"] == channel_id
    assert _send(client, headers, conversation_id).json()["status"] == "sent"
