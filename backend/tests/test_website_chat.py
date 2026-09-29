"""
Website chat: widget settings, the public widget API (origin checks, visitor sessions, messages, history,
rate and length limits, lead capture), live replies to the visitor, and the demo widget.
"""

import uuid

import pytest

from app.config.settings import settings
from tests.conftest import API

SITE = "https://www.cornercafe.example"


@pytest.fixture
def widget(client, register):
    """A workspace with a website widget allowing cornercafe.example; returns (staff headers, channel, key)."""
    headers = register()
    response = client.post(f"{API}/channels/website", headers=headers, json={"allowed_domains": ["cornercafe.example"]})
    assert response.status_code == 201, response.text
    channel = response.json()
    key = client.get(f"{API}/channels/{channel['id']}/widget", headers=headers).json()["widget_key"]
    return headers, channel, key


def _public(client, method, key, path, origin=SITE, token=None, **kwargs):
    headers = {"Origin": origin} if origin else {}
    if token:
        headers["X-Visitor-Token"] = token
    return client.request(method, f"{API}/widget/{key}{path}", headers=headers, **kwargs)


def _session(client, key):
    response = _public(client, "POST", key, "/sessions")
    assert response.status_code == 200, response.text
    return response.json()["visitor_token"]


def _say(client, key, token, content):
    return _public(client, "POST", key, "/messages", token=token, json={"content": content})


# ---------- settings ----------

def test_create_widget_and_snippet(client, widget):
    headers, channel, key = widget
    assert (channel["platform"], channel["adapter_type"], channel["status"]) == ("website", "website", "connected")
    settings_ = client.get(f"{API}/channels/{channel['id']}/widget", headers=headers).json()
    assert settings_["allowed_domains"] == ["cornercafe.example"] and len(key) >= 16
    assert settings_["lead_fields"] == ["name", "email", "phone"] and settings_["greeting"]
    assert f'data-widget-key="{key}"' in settings_["embed_snippet"]
    assert f"{settings.PUBLIC_BASE_URL}{API}/widget.js" in settings_["embed_snippet"]
    assert client.post(f"{API}/channels/website", headers=headers, json={}).status_code == 409


def test_update_widget_settings(client, widget):
    headers, channel, _ = widget
    url = f"{API}/channels/{channel['id']}/widget"
    updated = client.patch(url, headers=headers, json={
        "allowed_domains": ["cornercafe.example", "shop.example"], "greeting": "Hi! Ask us anything.", "lead_fields": ["phone"],
    }).json()
    assert updated["allowed_domains"] == ["cornercafe.example", "shop.example"]
    assert (updated["greeting"], updated["lead_fields"]) == ("Hi! Ask us anything.", ["phone"])
    assert client.patch(url, headers=headers, json={"lead_fields": ["age"]}).status_code == 422
    assert client.patch(url, headers=headers, json={"allowed_domains": ["https://x.example/page"]}).status_code == 422
    assert client.get(url, headers=register_other(client)).status_code == 404


def register_other(client):
    response = client.post(f"{API}/auth/register", json={
        "workspace_name": "Other", "name": "O", "email": f"o-{uuid.uuid4().hex[:8]}@example.com", "password": "password123",
    })
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


# ---------- public API ----------

def test_origin_check(client, widget):
    _, _, key = widget
    assert _public(client, "GET", key, "/config").status_code == 200
    assert _public(client, "GET", key, "/config", origin="https://shop.cornercafe.example").status_code == 200  # subdomain
    assert _public(client, "GET", key, "/config", origin="https://evil.example").status_code == 403
    assert _public(client, "GET", key, "/config", origin=None).status_code == 403
    assert _public(client, "POST", key, "/sessions", origin="https://cornercafe.example.evil.com").status_code == 403
    assert _public(client, "GET", "no-such-key", "/config").status_code == 404


def test_config_for_widget(client, widget):
    _, _, key = widget
    config = _public(client, "GET", key, "/config").json()
    assert config["business_name"] == "Test Cafe" and config["greeting"] and config["lead_fields"] == ["name", "email", "phone"]


def test_first_message_creates_website_conversation(client, widget):
    headers, channel, key = widget
    token = _session(client, key)
    assert _public(client, "GET", key, "/messages", token=token).json() == []
    response = _say(client, key, token, "Hi, are you open today?")
    assert response.status_code == 201, response.text

    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]
    assert (conversation["platform"], conversation["channel_id"]) == ("website", channel["id"])
    assert conversation["contact"]["name"].startswith("Website visitor")
    assert conversation["last_message_preview"] == "Hi, are you open today?"


def test_returning_visitor_sees_history(client, widget):
    headers, _, key = widget
    token = _session(client, key)
    _say(client, key, token, "Hi, are you open today?")
    conversation_id = client.get(f"{API}/conversations", headers=headers).json()[0]["id"]
    client.post(f"{API}/conversations/{conversation_id}/messages", headers=headers, json={"content": "Yes, until 9pm!"})

    # same token later: history, and new messages join the same conversation
    history = _public(client, "GET", key, "/messages", token=token).json()
    assert [(m["direction"], m["content"]) for m in history] == [("inbound", "Hi, are you open today?"), ("outbound", "Yes, until 9pm!")]
    _say(client, key, token, "Great, see you!")
    conversations = client.get(f"{API}/conversations", headers=headers).json()
    assert len(conversations) == 1

    # a different visitor gets their own conversation and no history
    other = _session(client, key)
    assert _public(client, "GET", key, "/messages", token=other).json() == []


def test_bad_visitor_token(client, widget, register):
    _, _, key = widget
    assert _say(client, key, "not-a-token", "hi").status_code == 401
    assert _say(client, key, None, "hi").status_code == 401
    # a token issued for another workspace's widget
    headers = register()
    other_channel = client.post(f"{API}/channels/website", headers=headers, json={"allowed_domains": ["cornercafe.example"]}).json()
    other_key = client.get(f"{API}/channels/{other_channel['id']}/widget", headers=headers).json()["widget_key"]
    assert _say(client, key, _session(client, other_key), "hi").status_code == 401


def test_length_and_rate_limits(client, widget):
    headers, _, key = widget
    token = _session(client, key)
    assert _say(client, key, token, "x" * 2001).status_code == 422
    assert _say(client, key, token, "   ").status_code == 422
    for i in range(20):
        assert _say(client, key, token, f"message {i}").status_code == 201
    assert _say(client, key, token, "one too many").status_code == 429
    conversation_id = client.get(f"{API}/conversations", headers=headers).json()[0]["id"]
    messages = client.get(f"{API}/conversations/{conversation_id}/messages", headers=headers).json()
    assert len(messages) == 20
    # another visitor is not affected
    assert _say(client, key, _session(client, key), "hello").status_code == 201


# ---------- lead capture ----------

def test_lead_capture_updates_contact(client, widget, monkeypatch):
    from app.services.event_service import EventService
    headers, _, key = widget
    token = _session(client, key)
    assert _public(client, "POST", key, "/lead", token=token, json={"name": "Priya"}).status_code == 404  # no chat yet
    _say(client, key, token, "Do you cater events?")

    events = []
    monkeypatch.setattr(EventService, "publish", classmethod(lambda cls, k, event, data: events.append((k, event, data))))
    response = _public(client, "POST", key, "/lead", token=token, json={"name": "Priya", "phone": "+91 98765 43210"})
    assert response.status_code == 200, response.text
    contact = client.get(f"{API}/conversations", headers=headers).json()[0]["contact"]
    assert (contact["name"], contact["phone"]) == ("Priya", "+91 98765 43210")
    assert [e for _, e, _ in events] == ["conversation.updated"]

    assert _public(client, "POST", key, "/lead", token=token, json={"email": "not-an-email"}).status_code == 422
    assert client.get(f"{API}/conversations", headers=headers).json()[0]["contact"]["email"] is None


# ---------- live replies ----------

def test_staff_reply_is_pushed_to_the_visitor(client, widget, monkeypatch):
    from app.services.event_service import EventService
    headers, _, key = widget
    token = _session(client, key)
    _say(client, key, token, "Hi!")
    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]

    events = []
    monkeypatch.setattr(EventService, "publish", classmethod(lambda cls, k, event, data: events.append((k, event, data))))
    client.post(f"{API}/conversations/{conversation['id']}/messages", headers=headers, json={"content": "Hello, how can we help?"})
    visitor = [(k, data) for k, event, data in events if isinstance(k, tuple) and event == "message.created"]
    assert len(visitor) == 1
    assert visitor[0][0] == ("visitor", conversation["external_id"])
    assert (visitor[0][1].direction, visitor[0][1].content) == ("outbound", "Hello, how can we help?")


def test_visitors_cannot_use_webhooks(client, widget):
    _, channel, _ = widget
    response = client.post(f"{API}/webhooks/{channel['id']}", json={"customer_id": "x", "content": "hi"})
    assert response.status_code == 401


# ---------- script, demo ----------

def test_widget_script_and_demo_page(client, demo_headers):
    script = client.get(f"{API}/widget.js")
    assert script.status_code == 200 and "javascript" in script.headers["content-type"]
    page = client.get(f"{API}/widget/demo")
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]

    website = next(c for c in client.get(f"{API}/channels", headers=demo_headers).json() if c["platform"] == "website")
    key = client.get(f"{API}/channels/{website['id']}/widget", headers=demo_headers).json()["widget_key"]
    assert f'data-widget-key="{key}"' in page.text
    assert _public(client, "GET", key, "/config", origin="http://localhost:8000").status_code == 200
    assert any(c["platform"] == "website" for c in client.get(f"{API}/conversations", headers=demo_headers).json())


def test_widget_paths_allow_any_origin_for_cors(client, widget):
    _, _, key = widget
    preflight = client.options(f"{API}/widget/{key}/messages", headers={
        "Origin": SITE, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-visitor-token",
    })
    assert preflight.status_code == 200 and preflight.headers["access-control-allow-origin"] in ("*", SITE)
