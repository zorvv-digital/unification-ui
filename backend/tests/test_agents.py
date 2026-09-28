"""
Agent builder: profiling questions, generation, versions, activation, knowledge attachment, and isolation.
"""

from tests.conftest import API

PROFILE = {
    "business_name": "Bright Smile Dental",
    "business_type": "Dental Clinic",
    "location": "Kochi",
    "offerings": ["Cleaning", "Braces"],
    "working_hours": "Mon-Sat 9-6",
}


def _generate(client, headers, setup=None):
    body = {"business_profile": PROFILE, "collected_answers": {"insurance": "Star Health"}}
    if setup:
        body["agent_setup"] = setup
    response = client.post(f"{API}/agents/generate", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_profiler_questions_use_business_type(client, register, llm_calls):
    response = client.post(f"{API}/agents/profiler/questions", json=PROFILE, headers=register())
    assert response.status_code == 200
    fields = response.json()["fields"]
    assert fields and all({"field_id", "question_text", "ui_type", "is_required"} <= f.keys() for f in fields)
    assert "Dental Clinic" in llm_calls[0]["messages"][-1]["content"]


def test_generate_with_setup(client, register, llm_calls):
    headers = register()
    agent = _generate(client, headers, {"agent_name": "Smiley", "personality": "warm", "rules": ["Never quote surgery prices"]})
    assert agent["name"] == "Smiley"
    assert agent["active_version_number"] == 1
    version = agent["active_version"]
    assert version["source"] == "generated" and version["is_active"] is True
    prompt_sent = llm_calls[-1]["messages"][-1]["content"]
    assert "Smiley" in prompt_sent and "Never quote surgery prices" in prompt_sent and "Star Health" in prompt_sent


def test_generate_without_setup_picks_defaults(client, register):
    agent = _generate(client, register())
    assert "Bright Smile Dental" in agent["name"]
    assert agent["active_version"]["greeting_message"]


def test_generate_provider_failure_stores_nothing(client, register, llm_down):
    headers = register()
    body = {"business_profile": PROFILE}
    assert client.post(f"{API}/agents/generate", json=body, headers=headers).status_code == 502
    assert client.post(f"{API}/agents/profiler/questions", json=PROFILE, headers=headers).status_code == 502
    assert client.get(f"{API}/agents", headers=headers).json() == []


def test_manual_edit_creates_active_version(client, register):
    headers = register()
    agent = _generate(client, headers)
    edited = client.post(f"{API}/agents/{agent['id']}/versions", json={"system_prompt": "You are formal."}, headers=headers)
    assert edited.status_code == 201
    assert edited.json()["version_number"] == 2 and edited.json()["source"] == "manual"
    # omitted fields are copied from the previous active version
    assert edited.json()["greeting_message"] == agent["active_version"]["greeting_message"]

    current = client.get(f"{API}/agents/{agent['id']}", headers=headers).json()
    assert current["active_version_number"] == 2
    assert current["active_version"]["system_prompt"] == "You are formal."

    versions = client.get(f"{API}/agents/{agent['id']}/versions", headers=headers).json()
    assert [v["version_number"] for v in versions] == [2, 1]
    assert versions[1]["system_prompt"] == agent["active_version"]["system_prompt"]
    assert [v["is_active"] for v in versions] == [True, False]


def test_refine_creates_inactive_draft(client, register, llm_calls):
    headers = register()
    agent = _generate(client, headers)
    draft = client.post(f"{API}/agents/{agent['id']}/refine", json={"feedback": "Always mention free parking"}, headers=headers)
    assert draft.status_code == 201
    assert draft.json()["version_number"] == 2
    assert draft.json()["source"] == "feedback" and draft.json()["feedback"] == "Always mention free parking"
    assert draft.json()["is_active"] is False
    assert "free parking" in draft.json()["system_prompt"]
    assert agent["active_version"]["system_prompt"] in llm_calls[-1]["messages"][-1]["content"]
    assert client.get(f"{API}/agents/{agent['id']}", headers=headers).json()["active_version_number"] == 1


def test_activate_and_rollback(client, register):
    headers = register()
    agent = _generate(client, headers)
    for i in range(3):
        client.post(f"{API}/agents/{agent['id']}/versions", json={"system_prompt": f"prompt {i + 2}"}, headers=headers)
    assert client.get(f"{API}/agents/{agent['id']}", headers=headers).json()["active_version_number"] == 4

    activated = client.post(f"{API}/agents/{agent['id']}/versions/1/activate", headers=headers)
    assert activated.status_code == 200 and activated.json()["active_version_number"] == 1
    assert len(client.get(f"{API}/agents/{agent['id']}/versions", headers=headers).json()) == 4
    assert client.post(f"{API}/agents/{agent['id']}/versions/99/activate", headers=headers).status_code == 404


def test_list_rename_delete(client, register):
    headers = register()
    first, second = _generate(client, headers), _generate(client, headers)
    listed = client.get(f"{API}/agents", headers=headers).json()
    assert {a["id"] for a in listed} == {first["id"], second["id"]}

    renamed = client.patch(f"{API}/agents/{first['id']}", json={"name": "Front Desk"}, headers=headers)
    assert renamed.json()["name"] == "Front Desk"

    assert client.delete(f"{API}/agents/{first['id']}", headers=headers).status_code == 204
    assert [a["id"] for a in client.get(f"{API}/agents", headers=headers).json()] == [second["id"]]
    assert client.get(f"{API}/agents/{first['id']}/versions", headers=headers).status_code == 404


def test_attach_and_detach_knowledge(client, register):
    headers = register()
    agent = _generate(client, headers)
    item = client.post(f"{API}/knowledge", json={"title": "Parking", "content": "Free parking behind the clinic"}, headers=headers).json()

    assert client.post(f"{API}/agents/{agent['id']}/knowledge/{item['id']}", headers=headers).status_code == 204
    assert client.post(f"{API}/agents/{agent['id']}/knowledge/{item['id']}", headers=headers).status_code == 204  # idempotent
    assert client.get(f"{API}/agents/{agent['id']}", headers=headers).json()["knowledge_ids"] == [item["id"]]

    assert client.delete(f"{API}/agents/{agent['id']}/knowledge/{item['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/agents/{agent['id']}", headers=headers).json()["knowledge_ids"] == []


def test_isolation(client, register):
    owner, other = register(), register()
    agent = _generate(client, owner)
    item = client.post(f"{API}/knowledge", json={"title": "T", "content": "C"}, headers=other).json()
    assert client.get(f"{API}/agents", headers=other).json() == []
    assert client.get(f"{API}/agents/{agent['id']}", headers=other).status_code == 404
    assert client.post(f"{API}/agents/{agent['id']}/versions", json={"system_prompt": "x"}, headers=other).status_code == 404
    assert client.delete(f"{API}/agents/{agent['id']}", headers=other).status_code == 404
    # cannot attach another workspace's knowledge item
    assert client.post(f"{API}/agents/{agent['id']}/knowledge/{item['id']}", headers=owner).status_code == 404
