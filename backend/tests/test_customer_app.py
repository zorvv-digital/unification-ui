"""
Customer app: the demo-only customer side of the simulated channels (sessions, sending, history, live push, limits).
"""

import time
import uuid

import jwt
import pytest

from app.config.settings import settings
from tests.conftest import API

APP = f"{API}/customer-app"


@pytest.fixture
def demo(client, demo_headers):
    """Demo staff headers; the demo is reset afterwards so other tests see the seed."""
    yield demo_headers
    client.post(f"{API}/demo/reset", headers=demo_headers)


def _session(client, name="Priya"):
    response = client.post(f"{APP}/sessions", json={"name": name})
    assert response.status_code == 200, response.text
    return response.json()["customer_token"]


def _send(client, token, content="Do you have a slot on Saturday?", platform="whatsapp", **extra):
    return client.post(f"{APP}/messages", headers={"X-Customer-Token": token},
                       json={"platform": platform, "content": content, **extra})


def _sid(token):
    return jwt.decode(token, options={"verify_signature": False})["sid"]


def _conversation(client, headers, token, platform="whatsapp"):
    external_id = f"app:{_sid(token)}"
    return next(c for c in client.get(f"{API}/conversations", headers=headers).json()
                if c["external_id"] == external_id and c["platform"] == platform)


def _events(monkeypatch):
    from app.services.event_service import EventService
    events = []
    monkeypatch.setattr(EventService, "publish", classmethod(lambda cls, k, event, data: events.append((k, event, data))))
    return events


# ---------- config and sessions ----------

def test_config(client, demo):
    body = client.get(f"{APP}/config").json()
    assert body["business_name"] == client.get(f"{API}/auth/me", headers=demo).json()["workspace"]["name"]
    assert body["platforms"] == ["whatsapp", "instagram", "messenger", "gmail"]


def test_session_name_validation(client, demo):
    assert _session(client, "  Priya  ")
    assert client.post(f"{APP}/sessions", json={"name": "   "}).status_code == 422
    assert client.post(f"{APP}/sessions", json={"name": "x" * 61}).status_code == 422


def test_bad_tokens(client, demo):
    assert _send(client, "").status_code == 401
    assert _send(client, "not-a-jwt").status_code == 401
    foreign = jwt.encode({"purpose": "visitor", "sid": "abc"}, settings.SECRET_KEY, algorithm="HS256")
    assert _send(client, foreign).status_code == 401
    other_ws = jwt.encode({"purpose": "customer", "sid": "abc", "ws": str(uuid.uuid4()), "name": "X"},
                          settings.SECRET_KEY, algorithm="HS256")
    assert _send(client, other_ws).status_code == 401
    assert client.get(f"{APP}/messages", headers={"X-Customer-Token": "nope"}).status_code == 401


def test_demo_mode_off_hides_everything(client, demo, monkeypatch):
    token = _session(client)
    monkeypatch.setattr(settings, "DEMO_MODE", False)
    assert client.get(f"{APP}/config").status_code == 404
    assert client.post(f"{APP}/sessions", json={"name": "Priya"}).status_code == 404
    assert _send(client, token).status_code == 404
    assert client.get(f"{APP}/messages", headers={"X-Customer-Token": token}).status_code == 404


# ---------- messages reach the inbox ----------

def test_whatsapp_message_reaches_inbox(client, demo):
    token = _session(client, "Priya Menon")
    assert client.get(f"{API}/conversations", headers=demo).json()  # seeded
    response = _send(client, token)
    assert response.status_code == 201, response.text
    assert (response.json()["platform"], response.json()["direction"]) == ("whatsapp", "inbound")

    conversation = _conversation(client, demo, token)
    assert conversation["contact"]["name"] == "Priya Menon"
    assert conversation["contact"]["phone"].startswith("+91 9")
    assert conversation["unread_count"] >= 1
    messages = client.get(f"{API}/conversations/{conversation['id']}/messages", headers=demo).json()
    assert (messages[0]["direction"], messages[0]["content"]) == ("inbound", "Do you have a slot on Saturday?")


def test_platform_identities(client, demo):
    token = _session(client, "Priya Menon")
    assert _send(client, token, "Hi on insta", platform="instagram").status_code == 201
    assert _send(client, token, "Hi on messenger", platform="messenger").status_code == 201
    assert _send(client, token, "Hello by email", platform="gmail", subject="Bridal package").status_code == 201

    insta = _conversation(client, demo, token, "instagram")
    assert insta["contact"]["username"].startswith("priya")
    gmail = _conversation(client, demo, token, "gmail")
    assert gmail["contact"]["email"].endswith("@example.com")
    assert gmail["subject"] == "Bridal package"
    assert _conversation(client, demo, token, "messenger")["contact"]["name"] == "Priya Menon"
    assert _send(client, token, "fax me", platform="fax").status_code == 422


def test_first_gmail_needs_subject(client, demo):
    token = _session(client)
    assert _send(client, token, "No subject", platform="gmail").status_code == 422
    assert client.get(f"{APP}/messages", headers={"X-Customer-Token": token}).json() == []
    assert _send(client, token, "Now with one", platform="gmail", subject="Question").status_code == 201
    assert _send(client, token, "Follow-up without subject", platform="gmail").status_code == 201


def test_history_has_platforms(client, demo):
    token = _session(client)
    _send(client, token, "one")
    _send(client, token, "two", platform="messenger")
    history = client.get(f"{APP}/messages", headers={"X-Customer-Token": token}).json()
    contents = [(m["platform"], m["content"]) for m in history if m["direction"] == "inbound"]
    assert contents == [("whatsapp", "one"), ("messenger", "two")]
    # another customer sees none of it
    assert client.get(f"{APP}/messages", headers={"X-Customer-Token": _session(client)}).json() == []


def test_length_and_rate_limits(client, demo):
    token = _session(client)
    assert _send(client, token, "x" * 2001).status_code == 422
    assert _send(client, token, "   ").status_code == 422
    for i in range(20):
        assert _send(client, token, f"message {i}", platform="messenger").status_code == 201
    assert _send(client, token, "one too many", platform="messenger").status_code == 429
    assert _send(client, _session(client), "someone else").status_code == 201


def test_ai_answers_customer_app_message(client, demo, monkeypatch):
    token = _session(client)
    events = _events(monkeypatch)
    _send(client, token, "Do you open on Sunday?")  # the demo WhatsApp channel has AI auto-reply on
    deadline = time.time() + 3
    replies = []
    while not replies and time.time() < deadline:
        history = client.get(f"{APP}/messages", headers={"X-Customer-Token": token}).json()
        replies = [m for m in history if m["direction"] == "outbound"]
        time.sleep(0.05)
    assert replies and replies[0]["platform"] == "whatsapp"
    pushed = [d for k, e, d in events if k == ("customer", _sid(token)) and e == "message.created"]
    assert [m.direction for m in pushed] == ["inbound", "outbound"]  # the AI answer reaches the open app live


# ---------- live push ----------

def test_replies_and_read_state_are_pushed(client, demo, monkeypatch):
    token = _session(client)
    _send(client, token, "Hi!", platform="messenger")
    conversation = _conversation(client, demo, token, "messenger")
    other = _session(client, "Someone Else")
    _send(client, other, "Hello", platform="messenger")
    other_conversation = _conversation(client, demo, other, "messenger")

    events = _events(monkeypatch)
    key = ("customer", _sid(token))
    _send(client, token, "Are you there?", platform="messenger")  # own message echoes to other devices
    client.post(f"{API}/conversations/{conversation['id']}/messages", headers=demo, json={"content": "Yes, how can we help?"})
    client.post(f"{API}/conversations/{other_conversation['id']}/messages", headers=demo, json={"content": "Not for Priya"})
    client.post(f"{API}/conversations/{conversation['id']}/read", headers=demo)

    mine = [(event, data) for k, event, data in events if k == key]
    created = [data for event, data in mine if event == "message.created"]
    assert [(m.direction, m.content, m.platform) for m in created] == [
        ("inbound", "Are you there?", "messenger"), ("outbound", "Yes, how can we help?", "messenger"),
    ]
    assert [data.platform for event, data in mine if event == "conversation.read"] == ["messenger"]


# ---------- canned replies and reset ----------

def test_no_canned_reply_in_customer_app_conversation(client, demo):
    token = _session(client)
    _send(client, token, "Hi!", platform="messenger")  # no AI auto-reply on the demo Messenger channel
    conversation = _conversation(client, demo, token, "messenger")
    url = f"{API}/conversations/{conversation['id']}/messages"
    client.post(url, headers=demo, json={"content": "Hello from the salon"})
    time.sleep(0.3)
    assert [m["direction"] for m in client.get(url, headers=demo).json()] == ["inbound", "outbound"]


def test_session_survives_reset(client, demo):
    token = _session(client)
    _send(client, token, "before reset")
    assert client.post(f"{API}/demo/reset", headers=demo).status_code == 204
    external_id = f"app:{_sid(token)}"
    assert not any(c["external_id"] == external_id for c in client.get(f"{API}/conversations", headers=demo).json())
    assert client.get(f"{APP}/messages", headers={"X-Customer-Token": token}).json() == []
    assert _send(client, token, "after reset", platform="messenger").status_code == 201
    assert _conversation(client, demo, token, "messenger")["last_message_preview"] == "after reset"
