"""
AI replies: channel auto-reply settings, conversation mode, takeover and hand-back, escalation, suggestions, and demo.
"""

import time

from tests.conftest import API

PROFILE = {"business_name": "Corner Cafe", "business_type": "Cafe"}
HOURS_QUESTION = "What are your opening hours?"


def _agent(client, headers) -> str:
    agent = client.post(f"{API}/agents/generate", json={"business_profile": PROFILE, "collected_answers": {}}, headers=headers).json()
    item = client.post(f"{API}/knowledge", json={"title": "Opening Hours", "content": "Open 9am to 8pm daily."}, headers=headers).json()
    assert client.post(f"{API}/agents/{agent['id']}/knowledge/{item['id']}", headers=headers).status_code == 204
    return agent["id"]


def _workspace(client, register, add_channel, enable=True):
    """A workspace with one WhatsApp channel and an agent that knows the opening hours."""
    headers = register()
    channel_id = add_channel(headers)
    agent_id = _agent(client, headers)
    if enable:
        response = client.patch(f"{API}/channels/{channel_id}", json={"ai_enabled": True, "ai_agent_id": agent_id}, headers=headers)
        assert response.status_code == 200, response.text
    return headers, channel_id, agent_id


def _inbound(client, channel_id, content, customer_id="cust-1"):
    response = client.post(f"{API}/webhooks/{channel_id}", json={"customer_id": customer_id, "name": "Anu", "content": content})
    assert response.status_code == 200, response.text


def _conversation(client, headers):
    return client.get(f"{API}/conversations", headers=headers).json()[0]


def _messages(client, headers, conversation_id):
    return client.get(f"{API}/conversations/{conversation_id}/messages", headers=headers).json()


# ---------- channel settings ----------

def test_channel_settings(client, register, add_channel):
    headers, channel_id, agent_id = _workspace(client, register, add_channel, enable=False)

    enabled = client.patch(f"{API}/channels/{channel_id}", json={"ai_enabled": True, "ai_agent_id": agent_id}, headers=headers)
    assert enabled.status_code == 200
    assert enabled.json()["ai_enabled"] is True and enabled.json()["ai_agent_id"] == agent_id
    listed = client.get(f"{API}/channels", headers=headers).json()[0]
    assert listed["ai_enabled"] is True and listed["ai_agent_id"] == agent_id

    disabled = client.patch(f"{API}/channels/{channel_id}", json={"ai_enabled": False}, headers=headers)
    assert disabled.json()["ai_enabled"] is False


def test_channel_settings_validation(client, register, add_channel):
    headers = register()
    channel_id = add_channel(headers)
    no_agent = client.patch(f"{API}/channels/{channel_id}", json={"ai_enabled": True}, headers=headers)
    assert no_agent.status_code == 400

    other_headers = register("Other Cafe")
    foreign_agent = _agent(client, other_headers)
    assert client.patch(f"{API}/channels/{channel_id}", json={"ai_agent_id": foreign_agent}, headers=headers).status_code == 404
    assert client.patch(f"{API}/channels/{channel_id}", json={"ai_enabled": False}, headers=other_headers).status_code == 404


# ---------- auto-reply ----------

def test_auto_reply_answers_with_knowledge(client, register, add_channel):
    headers, channel_id, _ = _workspace(client, register, add_channel)
    _inbound(client, channel_id, HOURS_QUESTION)

    conversation = _conversation(client, headers)
    assert conversation["mode"] == "ai" and conversation["needs_human"] is False
    messages = _messages(client, headers, conversation["id"])
    assert [(m["direction"], m["author"]) for m in messages] == [("inbound", "customer"), ("outbound", "agent")]
    assert "Open 9am to 8pm daily." in messages[-1]["content"]


def test_auto_reply_uses_conversation_history(client, register, add_channel, llm_calls):
    headers, channel_id, _ = _workspace(client, register, add_channel)
    _inbound(client, channel_id, HOURS_QUESTION)
    _inbound(client, channel_id, "And on Sunday?")

    sent = llm_calls[-1]["messages"]
    assert sent[0]["role"] == "system" and "Open 9am to 8pm daily." in sent[0]["content"]
    assert [m["role"] for m in sent[1:]] == ["user", "assistant", "user"]
    assert sent[1]["content"] == HOURS_QUESTION and sent[-1]["content"] == "And on Sunday?"
    assert len(_messages(client, headers, _conversation(client, headers)["id"])) == 4


def test_disabled_channel_gets_no_reply(client, register, add_channel, llm_calls):
    headers, channel_id, _ = _workspace(client, register, add_channel, enable=False)
    calls_before = len(llm_calls)
    _inbound(client, channel_id, HOURS_QUESTION)

    conversation = _conversation(client, headers)
    assert conversation["mode"] == "human"
    assert len(_messages(client, headers, conversation["id"])) == 1
    assert len(llm_calls) == calls_before


def test_switching_channel_off_stops_replies(client, register, add_channel):
    headers, channel_id, _ = _workspace(client, register, add_channel)
    _inbound(client, channel_id, HOURS_QUESTION)
    client.patch(f"{API}/channels/{channel_id}", json={"ai_enabled": False}, headers=headers)
    _inbound(client, channel_id, "Still there?")
    assert len(_messages(client, headers, _conversation(client, headers)["id"])) == 3


# ---------- takeover and hand-back ----------

def test_staff_takeover_and_hand_back(client, register, add_channel):
    headers, channel_id, _ = _workspace(client, register, add_channel)
    _inbound(client, channel_id, HOURS_QUESTION)
    conversation_id = _conversation(client, headers)["id"]

    sent = client.post(f"{API}/conversations/{conversation_id}/messages", json={"content": "Hi, Anu here from the cafe!"}, headers=headers)
    assert sent.json()["author"] == "staff"
    assert _conversation(client, headers)["mode"] == "human"
    _inbound(client, channel_id, "Great, thanks")
    assert len(_messages(client, headers, conversation_id)) == 4  # no AI reply

    back = client.patch(f"{API}/conversations/{conversation_id}", json={"mode": "ai"}, headers=headers)
    assert back.status_code == 200 and back.json()["mode"] == "ai"
    _inbound(client, channel_id, HOURS_QUESTION)
    messages = _messages(client, headers, conversation_id)
    assert len(messages) == 6 and messages[-1]["author"] == "agent"


def test_hand_back_needs_auto_reply_channel(client, register, add_channel):
    headers, channel_id, _ = _workspace(client, register, add_channel, enable=False)
    _inbound(client, channel_id, HOURS_QUESTION)
    conversation_id = _conversation(client, headers)["id"]
    response = client.patch(f"{API}/conversations/{conversation_id}", json={"mode": "ai"}, headers=headers)
    assert response.status_code == 400
    assert client.patch(f"{API}/conversations/{conversation_id}", json={"status": "closed"}, headers=headers).status_code == 200


# ---------- escalation ----------

def _assert_escalated(client, headers):
    conversation = _conversation(client, headers)
    assert conversation["mode"] == "human" and conversation["needs_human"] is True
    assert [m["direction"] for m in _messages(client, headers, conversation["id"])] == ["inbound"]
    return conversation


def test_customer_asking_for_person_escalates(client, register, add_channel, llm_calls):
    headers, channel_id, _ = _workspace(client, register, add_channel)
    calls_before = len(llm_calls)
    _inbound(client, channel_id, "I want to talk to a real person")
    conversation = _assert_escalated(client, headers)
    assert len(llm_calls) == calls_before

    flagged = client.get(f"{API}/conversations", params={"needs_human": "true"}, headers=headers).json()
    assert [c["id"] for c in flagged] == [conversation["id"]]

    client.post(f"{API}/conversations/{conversation['id']}/messages", json={"content": "Hi, I'm here"}, headers=headers)
    assert _conversation(client, headers)["needs_human"] is False
    assert client.get(f"{API}/conversations", params={"needs_human": "true"}, headers=headers).json() == []


def test_model_handoff_escalates(client, register, add_channel, monkeypatch):
    from app.providers import llm

    async def handoff(messages, schema=None):
        return "HANDOFF"
    headers, channel_id, _ = _workspace(client, register, add_channel)
    monkeypatch.setattr(llm, "complete", handoff)
    _inbound(client, channel_id, "Can you fix my car?")
    _assert_escalated(client, headers)


def test_provider_failure_escalates(client, register, add_channel, monkeypatch):
    from app.providers import llm

    async def fail(messages, schema=None):
        raise llm.LLMError("provider down")
    headers, channel_id, _ = _workspace(client, register, add_channel)
    monkeypatch.setattr(llm, "complete", fail)
    _inbound(client, channel_id, HOURS_QUESTION)
    conversation = _assert_escalated(client, headers)

    back = client.patch(f"{API}/conversations/{conversation['id']}", json={"mode": "ai"}, headers=headers)
    assert back.json()["needs_human"] is False


# ---------- suggested reply ----------

def test_suggest_reply_is_not_sent(client, register, add_channel):
    headers, channel_id, _ = _workspace(client, register, add_channel, enable=False)
    _inbound(client, channel_id, HOURS_QUESTION)
    conversation_id = _conversation(client, headers)["id"]

    response = client.post(f"{API}/conversations/{conversation_id}/suggest-reply", headers=headers)
    assert response.status_code == 200
    assert "Open 9am to 8pm daily." in response.json()["suggestion"]
    assert len(_messages(client, headers, conversation_id)) == 1


def test_suggest_reply_errors(client, register, add_channel, llm_down):
    headers = register()
    channel_id = add_channel(headers)
    _inbound(client, channel_id, HOURS_QUESTION)
    conversation_id = _conversation(client, headers)["id"]
    assert client.post(f"{API}/conversations/{conversation_id}/suggest-reply", headers=headers).status_code == 400

    # An agent exists but the provider is down (agent created directly, since generate also needs the provider).
    from app.db.models import Agent, AgentVersion
    from tests.conftest import run_db
    import uuid
    workspace_id = uuid.UUID(client.get(f"{API}/auth/me", headers=headers).json()["workspace"]["id"])

    async def create(db):
        agent = Agent(workspace_id=workspace_id, name="Helper")
        db.add(agent)
        await db.flush()
        db.add(AgentVersion(workspace_id=workspace_id, agent_id=agent.id, version_number=1, system_prompt="Help.", greeting_message="Hi"))
        await db.commit()
    run_db(client, create)
    assert client.post(f"{API}/conversations/{conversation_id}/suggest-reply", headers=headers).status_code == 502


# ---------- demo ----------

def _reset_demo(client, demo_headers):
    assert client.post(f"{API}/demo/reset", headers=demo_headers).status_code == 204


def _demo_conversation(client, demo_headers, name):
    return next(c for c in client.get(f"{API}/conversations", headers=demo_headers).json() if c["contact"]["name"] == name)


def test_demo_seed_has_whatsapp_auto_reply(client, demo_headers):
    for _ in range(2):  # fresh seed, then after a reset (the agent is recreated)
        _reset_demo(client, demo_headers)
        agent_id = client.get(f"{API}/agents", headers=demo_headers).json()[0]["id"]
        channels = {c["platform"]: c for c in client.get(f"{API}/channels", headers=demo_headers).json()}
        assert channels["whatsapp"]["ai_enabled"] is True and channels["whatsapp"]["ai_agent_id"] == agent_id
        assert channels["instagram"]["ai_enabled"] is False and channels["messenger"]["ai_enabled"] is False
        assert _demo_conversation(client, demo_headers, "Priya Singh")["mode"] == "ai"
        assert _demo_conversation(client, demo_headers, "Rahul Kumar")["mode"] == "human"


def test_demo_simulate_customer_gets_ai_reply_without_loop(client, demo_headers):
    _reset_demo(client, demo_headers)
    priya = _demo_conversation(client, demo_headers, "Priya Singh")
    before = len(_messages(client, demo_headers, priya["id"]))

    response = client.post(f"{API}/demo/conversations/{priya['id']}/simulate", json={"content": "What is your pricing?"}, headers=demo_headers)
    assert response.status_code == 201
    assert response.json()["direction"] == "inbound" and response.json()["author"] == "customer"

    time.sleep(0.3)  # a simulated customer reply (delay 0 in tests) would have arrived by now
    messages = _messages(client, demo_headers, priya["id"])
    assert len(messages) == before + 2
    assert messages[-1]["author"] == "agent"


def test_demo_simulate_outside_demo_is_forbidden(client, register, add_channel):
    headers = register()
    _inbound(client, add_channel(headers), "Hi")
    conversation_id = _conversation(client, headers)["id"]
    response = client.post(f"{API}/demo/conversations/{conversation_id}/simulate", json={"content": "Hi"}, headers=headers)
    assert response.status_code == 403
    assert len(_messages(client, headers, conversation_id)) == 1
