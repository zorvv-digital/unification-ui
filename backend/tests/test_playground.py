"""
Playground: test chat against agent versions with knowledge, sessions, isolation from the inbox, and failures.
"""

from tests.conftest import API

PROFILE = {"business_name": "Glow Salon", "business_type": "Salon"}


def _agent(client, headers):
    return client.post(f"{API}/agents/generate", json={"business_profile": PROFILE}, headers=headers).json()


def _chat(client, headers, agent_id, **body):
    return client.post(f"{API}/agents/{agent_id}/playground/chat", json=body, headers=headers)


def _system(call) -> str:
    return next(m["content"] for m in call["messages"] if m["role"] == "system")


def test_chat_uses_active_version_by_default_and_chosen_version_when_given(client, register, llm_calls):
    headers = register()
    agent = _agent(client, headers)
    client.post(f"{API}/agents/{agent['id']}/versions", json={"system_prompt": "ACTIVE PROMPT"}, headers=headers)
    client.post(f"{API}/agents/{agent['id']}/refine", json={"feedback": "be brief"}, headers=headers)  # draft v3

    active = _chat(client, headers, agent["id"], message="Hi")
    assert active.status_code == 200
    assert active.json()["version_number"] == 2 and active.json()["reply"]
    assert _system(llm_calls[-1]).startswith("ACTIVE PROMPT")

    draft = _chat(client, headers, agent["id"], message="Hi", version_number=3)
    assert draft.json()["version_number"] == 3
    assert "be brief" in _system(llm_calls[-1])

    assert _chat(client, headers, agent["id"], message="Hi", version_number=42).status_code == 404


def test_multi_turn_and_new_session(client, register, llm_calls):
    headers = register()
    agent = _agent(client, headers)
    first = _chat(client, headers, agent["id"], message="What are your hours?").json()
    _chat(client, headers, agent["id"], message="And on Sunday?", session_id=first["session_id"])
    history = [m["content"] for m in llm_calls[-1]["messages"] if m["role"] != "system"]
    assert history == ["What are your hours?", first["reply"], "And on Sunday?"]

    fresh = _chat(client, headers, agent["id"], message="Hello").json()
    assert fresh["session_id"] != first["session_id"]
    assert [m["content"] for m in llm_calls[-1]["messages"] if m["role"] != "system"] == ["Hello"]


def test_only_enabled_attached_knowledge_is_used_and_edits_apply_immediately(client, register, llm_calls):
    headers = register()
    agent = _agent(client, headers)
    make = lambda title, content: client.post(f"{API}/knowledge", json={"title": title, "content": content}, headers=headers).json()
    prices, parking, unattached = make("Prices", "Haircut 500"), make("Parking", "Free parking"), make("Secret", "Not attached")
    for item in (prices, parking):
        client.post(f"{API}/agents/{agent['id']}/knowledge/{item['id']}", headers=headers)
    client.patch(f"{API}/knowledge/{parking['id']}", json={"enabled": False}, headers=headers)

    _chat(client, headers, agent["id"], message="How much is a haircut?")
    system = _system(llm_calls[-1])
    assert "Haircut 500" in system and "Free parking" not in system and "Not attached" not in system

    client.patch(f"{API}/knowledge/{prices['id']}", json={"content": "Haircut 650"}, headers=headers)
    _chat(client, headers, agent["id"], message="How much is a haircut?")
    assert "Haircut 650" in _system(llm_calls[-1])
    assert client.get(f"{API}/agents/{agent['id']}", headers=headers).json()["active_version_number"] == 1


def test_playground_does_not_touch_inbox(client, register):
    headers = register()
    agent = _agent(client, headers)
    _chat(client, headers, agent["id"], message="Hi")
    assert client.get(f"{API}/conversations", headers=headers).json() == []


def test_provider_failure_returns_502_and_session_stays_usable(client, register, monkeypatch, llm_calls):
    from app.providers import llm
    headers = register()
    agent = _agent(client, headers)
    first = _chat(client, headers, agent["id"], message="Hi").json()

    working = llm.complete

    async def fail(messages, schema=None):
        raise llm.LLMError("timeout")
    monkeypatch.setattr(llm, "complete", fail)
    assert _chat(client, headers, agent["id"], message="Still there?", session_id=first["session_id"]).status_code == 502

    monkeypatch.setattr(llm, "complete", working)
    retry = _chat(client, headers, agent["id"], message="Still there?", session_id=first["session_id"])
    assert retry.status_code == 200
    history = [m["content"] for m in llm_calls[-1]["messages"] if m["role"] != "system"]
    assert history == ["Hi", first["reply"], "Still there?"]


def test_playground_isolation(client, register):
    owner, other = register(), register()
    agent = _agent(client, owner)
    assert _chat(client, other, agent["id"], message="Hi").status_code == 404
