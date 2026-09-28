"""
Knowledge items: CRUD, size limit, and workspace isolation.
"""

from tests.conftest import API

ITEM = {"title": "Pricing Plans", "category": "Sales", "description": "Current prices", "content": "Haircut: 500 INR"}


def test_create_list_update_delete(client, register):
    headers = register()
    created = client.post(f"{API}/knowledge", json=ITEM, headers=headers)
    assert created.status_code == 201
    item = created.json()
    assert item["enabled"] is True and item["title"] == "Pricing Plans"

    assert [i["id"] for i in client.get(f"{API}/knowledge", headers=headers).json()] == [item["id"]]

    updated = client.patch(f"{API}/knowledge/{item['id']}", json={"content": "Haircut: 600 INR", "enabled": False}, headers=headers)
    assert updated.json()["content"] == "Haircut: 600 INR" and updated.json()["enabled"] is False
    assert updated.json()["title"] == "Pricing Plans"

    assert client.delete(f"{API}/knowledge/{item['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/knowledge", headers=headers).json() == []


def test_content_limit(client, register):
    headers = register()
    too_long = {**ITEM, "content": "x" * 20001}
    assert client.post(f"{API}/knowledge", json=too_long, headers=headers).status_code == 422
    assert client.get(f"{API}/knowledge", headers=headers).json() == []
    assert client.post(f"{API}/knowledge", json={**ITEM, "content": "x" * 20000}, headers=headers).status_code == 201


def test_isolation(client, register):
    owner, other = register(), register()
    item = client.post(f"{API}/knowledge", json=ITEM, headers=owner).json()
    assert client.get(f"{API}/knowledge", headers=other).json() == []
    assert client.patch(f"{API}/knowledge/{item['id']}", json={"title": "x"}, headers=other).status_code == 404
    assert client.delete(f"{API}/knowledge/{item['id']}", headers=other).status_code == 404
