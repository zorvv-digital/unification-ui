"""
Gmail channel: Google OAuth connect, polling sync into threaded conversations, replies in the thread,
revoked grants, and the demo Gmail channel. Google's OAuth and Gmail APIs are an httpx mock.
"""

import base64
import email
import json
import uuid
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.config.settings import settings
from app.db.models import Channel
from app.services.crypto import decrypt_secret
from tests.conftest import API, run_db

ADDRESS = "hello@cornercafe.com"
REFRESH = "1//refresh-token"


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


def _gmail_message(id_, thread, subject, body, sender="Ravi Kumar <ravi@example.com>", html=False):
    parts = [{"mimeType": "text/html", "body": {"data": _b64(f"<p>{body}</p>")}}]
    if not html:
        parts.insert(0, {"mimeType": "text/plain", "body": {"data": _b64(body)}})
    return {"id": id_, "threadId": thread, "payload": {
        "mimeType": "multipart/alternative",
        "headers": [{"name": "From", "value": sender}, {"name": "Subject", "value": subject},
                    {"name": "Message-ID", "value": f"<{id_}@mail.example.com>"}],
        "parts": parts,
    }}


@pytest.fixture
def google(monkeypatch):
    """Fake Google OAuth + Gmail API. Put messages in `inbox`; set `revoked` to invalidate the grant."""
    from app.providers import gmail
    state = {"requests": [], "inbox": [], "sent": [], "revoked": False, "tokens": set(), "issued": 0}

    def token(n=None):
        state["issued"] += 1
        value = f"ya29.token{state['issued']}"
        state["tokens"].add(value)
        return value

    def handler(request: httpx.Request) -> httpx.Response:
        state["requests"].append(request)
        url = str(request.url)
        if url.startswith(settings.GOOGLE_TOKEN_URL):
            form = parse_qs(request.content.decode())
            if form["client_secret"] != [settings.GOOGLE_CLIENT_SECRET]:
                return httpx.Response(401, json={"error": "invalid_client"})
            if form["grant_type"] == ["authorization_code"]:
                if form["code"] != ["good-code"]:
                    return httpx.Response(400, json={"error": "invalid_grant", "error_description": "Bad Request"})
                return httpx.Response(200, json={"access_token": token(), "refresh_token": REFRESH, "expires_in": 3599})
            if state["revoked"] or form["refresh_token"] != [REFRESH]:
                return httpx.Response(400, json={"error": "invalid_grant", "error_description": "Token has been expired or revoked."})
            return httpx.Response(200, json={"access_token": token(), "expires_in": 3599})

        bearer = request.headers.get("Authorization", "").removeprefix("Bearer ")
        if state["revoked"] or bearer not in state["tokens"]:
            return httpx.Response(401, json={"error": {"code": 401, "message": "Invalid Credentials"}})
        path = request.url.path.split("/gmail/v1/users/me/")[-1]
        if path == "profile":
            return httpx.Response(200, json={"emailAddress": ADDRESS, "historyId": "100"})
        if path == "messages" and request.method == "GET":
            return httpx.Response(200, json={"messages": [{"id": m["id"], "threadId": m["threadId"]} for m in state["inbox"]]})
        if path.startswith("messages/") and request.method == "GET":
            found = next((m for m in state["inbox"] if m["id"] == path.split("/")[1]), None)
            return httpx.Response(200, json=found) if found else httpx.Response(404, json={"error": {"message": "Not Found"}})
        if path.startswith("threads/"):
            msgs = [m for m in state["inbox"] if m["threadId"] == path.split("/")[1]]
            return httpx.Response(200, json={"id": path.split("/")[1], "messages": msgs})
        if path == "messages/send":
            body = json.loads(request.content)
            state["sent"].append(body)
            return httpx.Response(200, json={"id": f"sent{len(state['sent'])}", "threadId": body.get("threadId")})
        return httpx.Response(404, json={"error": {"message": "Unknown path"}})

    monkeypatch.setattr(gmail, "_transport", httpx.MockTransport(handler))
    return state


def _authorize(client, headers):
    response = client.post(f"{API}/channels/gmail/authorize", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["authorize_url"]


def _callback(client, **params):
    response = client.get(f"{API}/channels/gmail/callback", params=params, follow_redirects=False)
    assert response.status_code in (302, 307), response.text
    return response.headers["location"]


def _connect(client, headers):
    state = parse_qs(urlparse(_authorize(client, headers)).query)["state"][0]
    assert _callback(client, code="good-code", state=state).endswith("/inbox?gmail=connected")
    return next(c for c in client.get(f"{API}/channels", headers=headers).json() if c["platform"] == "gmail")


def _sync(client, headers, channel_id):
    return client.post(f"{API}/channels/{channel_id}/sync", headers=headers)


def _config(client, channel_id):
    async def load(db):
        return (await db.get(Channel, uuid.UUID(channel_id))).config
    return run_db(client, load)


def _connected_with_email(client, register, google):
    headers = register()
    channel = _connect(client, headers)
    google["inbox"].append(_gmail_message("m1", "t1", "Booking for Saturday", "Hi, can I book a table for 4 on Saturday?"))
    assert _sync(client, headers, channel["id"]).json() == {"received": 1}
    conversation = client.get(f"{API}/conversations", headers=headers).json()[0]
    return headers, channel["id"], conversation


# ---------- connect ----------

def test_authorize_url(client, register, google):
    url = urlparse(_authorize(client, register()))
    query = parse_qs(url.query)
    assert url.geturl().startswith(settings.GOOGLE_AUTH_URL)
    assert query["client_id"] == [settings.GOOGLE_CLIENT_ID] and query["access_type"] == ["offline"] and query["prompt"] == ["consent"]
    assert "https://www.googleapis.com/auth/gmail.send" in query["scope"][0].split()
    assert query["redirect_uri"] == [f"{settings.PUBLIC_BASE_URL}{API}/channels/gmail/callback"]


def test_authorize_needs_google_configured(client, register, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", None)
    assert client.post(f"{API}/channels/gmail/authorize", headers=register()).status_code == 400


def test_consent_granted_creates_channel(client, register, google):
    headers = register()
    channel = _connect(client, headers)
    assert (channel["name"], channel["adapter_type"], channel["status"]) == (ADDRESS, "gmail", "connected")
    config = _config(client, channel["id"])
    assert REFRESH not in json.dumps(config) and decrypt_secret(config["refresh_token"]) == REFRESH

    # Connecting the same address again reuses the channel
    assert _connect(client, headers)["id"] == channel["id"]
    assert len(client.get(f"{API}/channels", headers=headers).json()) == 1


def test_consent_denied_creates_nothing(client, register, google):
    headers = register()
    state = parse_qs(urlparse(_authorize(client, headers)).query)["state"][0]
    assert _callback(client, error="access_denied", state=state).endswith("/inbox?gmail=denied")
    assert client.get(f"{API}/channels", headers=headers).json() == []


def test_bad_state_or_code_is_an_error(client, register, google):
    headers = register()
    state = parse_qs(urlparse(_authorize(client, headers)).query)["state"][0]
    assert _callback(client, code="good-code", state="forged").endswith("/inbox?gmail=error")
    assert _callback(client, code="bad-code", state=state).endswith("/inbox?gmail=error")
    assert client.get(f"{API}/channels", headers=headers).json() == []


# ---------- sync ----------

def test_new_email_becomes_conversation_with_subject(client, register, google):
    headers, channel_id, conversation = _connected_with_email(client, register, google)
    assert conversation["platform"] == "gmail" and conversation["subject"] == "Booking for Saturday"
    assert conversation["external_id"] == "t1"
    assert (conversation["contact"]["name"], conversation["contact"]["email"]) == ("Ravi Kumar", "ravi@example.com")
    messages = client.get(f"{API}/conversations/{conversation['id']}/messages", headers=headers).json()
    assert [m["content"] for m in messages] == ["Hi, can I book a table for 4 on Saturday?"]

    # The next sync sees the same message again (overlap window): stored once
    assert _sync(client, headers, channel_id).json() == {"received": 0}


def test_thread_reply_and_new_thread(client, register, google):
    headers, channel_id, conversation = _connected_with_email(client, register, google)
    google["inbox"].append(_gmail_message(
        "m2", "t1", "Re: Booking for Saturday",
        "Actually make it 5 people.\n\nOn Mon, 29 Sep 2026 at 10:00, Corner Cafe <hello@cornercafe.com> wrote:\n> Sure!",
    ))
    google["inbox"].append(_gmail_message("m3", "t2", "Allergy question", "Do you have gluten-free options?", html=True))
    assert _sync(client, headers, channel_id).json() == {"received": 2}

    conversations = {c["external_id"]: c for c in client.get(f"{API}/conversations", headers=headers).json()}
    assert set(conversations) == {"t1", "t2"}
    assert conversations["t1"]["contact"]["id"] == conversations["t2"]["contact"]["id"]  # one contact per address
    thread = client.get(f"{API}/conversations/{conversation['id']}/messages", headers=headers).json()
    assert thread[-1]["content"] == "Actually make it 5 people."
    other = client.get(f"{API}/conversations/{conversations['t2']['id']}/messages", headers=headers).json()
    assert other[0]["content"] == "Do you have gluten-free options?"


def test_expired_access_token_is_refreshed(client, register, google):
    headers, channel_id, _ = _connected_with_email(client, register, google)

    async def expire(db):
        channel = await db.get(Channel, uuid.UUID(channel_id))
        channel.config = {**channel.config, "expires_at": 0}
        await db.commit()
    run_db(client, expire)
    google["inbox"].append(_gmail_message("m9", "t9", "Hello", "Hello there"))
    assert _sync(client, headers, channel_id).json() == {"received": 1}
    assert google["issued"] == 2


def test_revoked_grant_disconnects_on_sync(client, register, google, monkeypatch):
    from app.services.event_service import EventService
    events = []
    monkeypatch.setattr(EventService, "publish", classmethod(lambda cls, ws, event, data: events.append((event, data))))
    headers, channel_id, _ = _connected_with_email(client, register, google)

    google["revoked"] = True
    assert _sync(client, headers, channel_id).json() == {"received": 0}
    assert client.get(f"{API}/channels", headers=headers).json()[0]["status"] == "disconnected"
    assert [data.status for event, data in events if event == "channel.updated"] == ["disconnected"]


def test_sync_is_only_for_gmail(client, register, add_channel):
    headers = register()
    assert _sync(client, headers, add_channel(headers)).status_code == 400


# ---------- replies ----------

def test_reply_is_sent_in_the_thread(client, register, google):
    headers, _, conversation = _connected_with_email(client, register, google)
    sent = client.post(f"{API}/conversations/{conversation['id']}/messages", headers=headers,
                       json={"content": "Yes, table for 4 at 8pm is booked!"}).json()
    assert sent["status"] == "sent" and sent["external_id"] == "sent1"

    body = google["sent"][-1]
    assert body["threadId"] == "t1"
    mime = email.message_from_bytes(base64.urlsafe_b64decode(body["raw"] + "=="))
    assert mime["To"] == "ravi@example.com" and mime["From"] == ADDRESS
    assert mime["Subject"] == "Re: Booking for Saturday"
    assert mime["In-Reply-To"] == "<m1@mail.example.com>" and mime["References"] == "<m1@mail.example.com>"
    assert mime.get_payload(decode=True).decode().strip() == "Yes, table for 4 at 8pm is booked!"


def test_reply_with_revoked_grant_disconnects(client, register, google):
    headers, _, conversation = _connected_with_email(client, register, google)
    google["revoked"] = True
    sent = client.post(f"{API}/conversations/{conversation['id']}/messages", headers=headers, json={"content": "Hi"}).json()
    assert sent["status"] == "failed"
    assert client.get(f"{API}/channels", headers=headers).json()[0]["status"] == "disconnected"


# ---------- demo ----------

def test_demo_has_seeded_gmail(client, demo_headers):
    gmail = [c for c in client.get(f"{API}/conversations", headers=demo_headers).json() if c["platform"] == "gmail"]
    assert len(gmail) == 3 and all(c["subject"] for c in gmail)
    reply = client.post(f"{API}/conversations/{gmail[0]['id']}/messages", headers=demo_headers, json={"content": "Thanks!"})
    assert reply.status_code == 201 and reply.json()["status"] == "sent"
