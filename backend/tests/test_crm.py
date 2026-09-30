"""
CRM: contact profiles and consent, tags, search, merge, CSV import, and segments.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from app.db.models import Conversation
from tests.conftest import API, run_db


@pytest.fixture
def crm(client, register, add_channel):
    """A workspace with customers on WhatsApp and Instagram. Returns (headers, {name: contact}, channels)."""
    headers = register()
    channels = {"whatsapp": add_channel(headers, "whatsapp"), "instagram": add_channel(headers, "instagram")}

    def customer(platform, customer_id, name, content="Hi!"):
        response = client.post(f"{API}/webhooks/{channels[platform]}", json={"customer_id": customer_id, "name": name, "content": content})
        assert response.status_code == 200, response.text

    customer("whatsapp", "+919800000001", "Asha Rao")
    customer("whatsapp", "+919800000002", "Vikram Shah")
    customer("instagram", "ig_asha", "asha.rao")
    contacts = {c["contact"]["name"]: c["contact"] for c in client.get(f"{API}/conversations", headers=headers).json()}
    return headers, contacts, channels


def _contacts(client, headers, **params):
    response = client.get(f"{API}/contacts", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _tag(client, headers, name, color="#f59e0b"):
    response = client.post(f"{API}/tags", headers=headers, json={"name": name, "color": color})
    assert response.status_code == 201, response.text
    return response.json()


def _patch(client, headers, contact_id, **fields):
    return client.patch(f"{API}/contacts/{contact_id}", headers=headers, json=fields)


# ---------- profile ----------

def test_edit_profile_dates_notes_consent(client, crm):
    headers, contacts, _ = crm
    asha = contacts["Asha Rao"]
    response = _patch(client, headers, asha["id"], birthday="1990-03-14", anniversary="2018-11-02",
                      notes="Prefers evening slots", email="asha@example.com", phone="+91 98000 00001")
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["birthday"], body["anniversary"], body["notes"]) == ("1990-03-14", "2018-11-02", "Prefers evening slots")
    assert body["consent"] == "unknown" and body["consent_changed_at"] is None

    opted = _patch(client, headers, asha["id"], consent="opted_in").json()
    assert opted["consent"] == "opted_in" and opted["consent_changed_at"]
    again = _patch(client, headers, asha["id"], notes="VIP").json()
    assert again["consent_changed_at"] == opted["consent_changed_at"]  # unchanged consent keeps its time

    # the inbox sees the enriched contact
    conversation = next(c for c in client.get(f"{API}/conversations", headers=headers).json() if c["contact"]["id"] == asha["id"])
    assert conversation["contact"]["birthday"] == "1990-03-14"


def test_invalid_values_leave_contact_unchanged(client, crm, register):
    headers, contacts, _ = crm
    asha = contacts["Asha Rao"]
    assert _patch(client, headers, asha["id"], email="not-an-email").status_code == 422
    assert _patch(client, headers, asha["id"], birthday="1990-02-30").status_code == 422
    assert _patch(client, headers, asha["id"], consent="maybe").status_code == 422
    assert client.get(f"{API}/contacts/{asha['id']}", headers=headers).json()["email"] is None
    assert _patch(client, register(), asha["id"], notes="x").status_code == 404


# ---------- tags ----------

def test_tag_crud_and_unique_names(client, crm):
    headers, _, _ = crm
    vip = _tag(client, headers, "VIP")
    assert client.post(f"{API}/tags", headers=headers, json={"name": " vip "}).status_code == 409
    regular = _tag(client, headers, "Regular", "#10b981")
    assert client.patch(f"{API}/tags/{regular['id']}", headers=headers, json={"name": "Vip"}).status_code == 409
    renamed = client.patch(f"{API}/tags/{regular['id']}", headers=headers, json={"name": "Loyal", "color": "#6366f1"}).json()
    assert (renamed["name"], renamed["color"]) == ("Loyal", "#6366f1")
    assert client.post(f"{API}/tags", headers=headers, json={"name": "Bad", "color": "red"}).status_code == 422
    assert [t["name"] for t in client.get(f"{API}/tags", headers=headers).json()] == ["Loyal", "VIP"]
    assert vip["color"] == "#f59e0b"


def test_assign_remove_and_delete_tags(client, crm, monkeypatch):
    from app.services.event_service import EventService
    headers, contacts, _ = crm
    asha, vip = contacts["Asha Rao"], _tag(client, headers, "VIP")

    events = []
    monkeypatch.setattr(EventService, "publish", classmethod(lambda cls, k, event, data: events.append((event, data))))
    url = f"{API}/contacts/{asha['id']}/tags/{vip['id']}"
    assert client.post(url, headers=headers).status_code == 200
    assert client.post(url, headers=headers).status_code == 200  # idempotent
    assert [t["name"] for t in client.get(f"{API}/contacts/{asha['id']}", headers=headers).json()["tags"]] == ["VIP"]
    assert [e for e, _ in events] == ["conversation.updated", "conversation.updated"]
    assert events[0][1].contact.tags[0].name == "VIP"

    assert client.delete(url, headers=headers).status_code == 200
    assert client.get(f"{API}/contacts/{asha['id']}", headers=headers).json()["tags"] == []

    client.post(url, headers=headers)
    assert client.delete(f"{API}/tags/{vip['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/contacts/{asha['id']}", headers=headers).json()["tags"] == []
    assert client.post(url, headers=headers).status_code == 404


# ---------- search ----------

def test_search_and_filter(client, crm):
    headers, contacts, _ = crm
    vip = _tag(client, headers, "VIP")
    regular = _tag(client, headers, "Regular")
    client.post(f"{API}/contacts/{contacts['Asha Rao']['id']}/tags/{vip['id']}", headers=headers)
    client.post(f"{API}/contacts/{contacts['Vikram Shah']['id']}/tags/{regular['id']}", headers=headers)
    _patch(client, headers, contacts["Vikram Shah"]["id"], email="vikram@brightlabs.example", phone="+91 98000 00002")

    everyone = _contacts(client, headers)
    assert len(everyone) == 3 and all(c["last_activity_at"] for c in everyone)
    assert {c["name"]: c["platforms"] for c in everyone}["asha.rao"] == ["instagram"]
    assert sorted(c["name"] for c in _contacts(client, headers, q="asha")) == ["Asha Rao", "asha.rao"]
    assert [c["name"] for c in _contacts(client, headers, q="BRIGHTLABS")] == ["Vikram Shah"]
    assert [c["name"] for c in _contacts(client, headers, q="98000 00002")] == ["Vikram Shah"]
    assert [c["name"] for c in _contacts(client, headers, tag_ids=[vip["id"]])] == ["Asha Rao"]
    assert sorted(c["name"] for c in _contacts(client, headers, tag_ids=[vip["id"], regular["id"]])) == ["Asha Rao", "Vikram Shah"]


# ---------- merge ----------

def test_merge_same_customer_across_channels(client, crm):
    headers, contacts, _ = crm
    target, source = contacts["Asha Rao"], contacts["asha.rao"]
    vip, bridal = _tag(client, headers, "VIP"), _tag(client, headers, "Bridal")
    client.post(f"{API}/contacts/{target['id']}/tags/{vip['id']}", headers=headers)
    client.post(f"{API}/contacts/{source['id']}/tags/{vip['id']}", headers=headers)
    client.post(f"{API}/contacts/{source['id']}/tags/{bridal['id']}", headers=headers)
    _patch(client, headers, target["id"], phone="+91 98000 00001")
    _patch(client, headers, source["id"], phone="+91 11111 11111", email="asha@example.com", birthday="1990-03-14")

    response = client.post(f"{API}/contacts/{target['id']}/merge", headers=headers, json={"source_contact_id": source["id"]})
    assert response.status_code == 200, response.text
    merged = response.json()
    assert merged["phone"] == "+91 98000 00001"  # target's own value kept
    assert (merged["email"], merged["birthday"]) == ("asha@example.com", "1990-03-14")  # empty fields filled
    assert sorted(t["name"] for t in merged["tags"]) == ["Bridal", "VIP"]

    detail = client.get(f"{API}/contacts/{target['id']}", headers=headers).json()
    assert len(detail["conversation_ids"]) == 2
    assert client.get(f"{API}/contacts/{source['id']}", headers=headers).status_code == 404
    platforms = {c["platform"] for c in client.get(f"{API}/conversations", headers=headers).json() if c["contact"]["id"] == target["id"]}
    assert platforms == {"whatsapp", "instagram"}

    assert client.post(f"{API}/contacts/{target['id']}/merge", headers=headers, json={"source_contact_id": target["id"]}).status_code == 400
    assert client.post(f"{API}/contacts/{target['id']}/merge", headers=headers, json={"source_contact_id": str(uuid.uuid4())}).status_code == 404


# ---------- import ----------

def test_csv_import(client, crm):
    headers, contacts, _ = crm
    _patch(client, headers, contacts["Vikram Shah"]["id"], email="vikram@brightlabs.example", phone="+91 98000 00002")
    csv = "\n".join([
        "Name,Phone,Email,Birthday,Anniversary,Tags",
        "Meera Iyer,+91 99000 11111,meera@example.com,1992-07-01,,VIP;Bridal",
        "Vikram S.,,VIKRAM@brightlabs.example,1985-12-24,,Regular",   # updates by email
        "Rohit,+91-98000-00002,,,,",                                  # matches Vikram by phone digits
        "Bad Date,+91 99000 22222,,1992-13-45,,",
        "Bad Email,,nope,,,",
        ",,,,,",
        "Kiran,+91 99000 33333,,,2020-02-29,vip",
    ])
    response = client.post(f"{API}/contacts/import", headers=headers, json={"csv": csv})
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result["created"], result["updated"]) == (2, 2)
    assert [s["row"] for s in result["skipped"]] == [5, 6, 7]
    assert "birthday" in result["skipped"][0]["reason"].lower() and "email" in result["skipped"][1]["reason"].lower()

    by_name = {c["name"]: c for c in _contacts(client, headers)}
    assert by_name["Meera Iyer"]["birthday"] == "1992-07-01"
    assert sorted(t["name"] for t in by_name["Meera Iyer"]["tags"]) == ["Bridal", "VIP"]
    assert [t["name"] for t in by_name["Kiran"]["tags"]] == ["VIP"]  # existing tag reused ignoring case
    assert by_name["Kiran"]["anniversary"] == "2020-02-29"
    vikram = by_name["Rohit"]  # both rows matched Vikram; the later one set the name
    assert vikram["birthday"] == "1985-12-24" and [t["name"] for t in vikram["tags"]] == ["Regular"]
    assert len(client.get(f"{API}/tags", headers=headers).json()) == 3

    assert client.post(f"{API}/contacts/import", headers=headers, json={"csv": "just,some,columns\n1,2,3"}).status_code == 422


# ---------- segments ----------

def _set_activity(client, conversation_contact_id, days_ago):
    async def run(db):
        await db.execute(update(Conversation).where(Conversation.contact_id == uuid.UUID(conversation_contact_id))
                         .values(last_message_at=datetime.now(timezone.utc) - timedelta(days=days_ago)))
        await db.commit()
    run_db(client, run)


def _preview(client, headers, **rules):
    response = client.post(f"{API}/segments/preview", headers=headers, json={"rules": rules})
    assert response.status_code == 200, response.text
    body = response.json()
    return body["count"], sorted(m["name"] for m in body["members"])


def test_segment_rules(client, crm):
    headers, contacts, _ = crm
    asha, vikram, insta = contacts["Asha Rao"], contacts["Vikram Shah"], contacts["asha.rao"]
    vip, regular, blocked = _tag(client, headers, "VIP"), _tag(client, headers, "Regular"), _tag(client, headers, "Blocked")
    for contact, tag in [(asha, vip), (asha, regular), (vikram, vip), (insta, regular), (insta, blocked)]:
        client.post(f"{API}/contacts/{contact['id']}/tags/{tag['id']}", headers=headers)
    _set_activity(client, vikram["id"], 45)
    _patch(client, headers, asha["id"], consent="opted_in")
    today = date.today()
    _patch(client, headers, vikram["id"], birthday=(today + timedelta(days=3)).replace(year=1980).isoformat())
    _patch(client, headers, insta["id"], birthday=(today - timedelta(days=1)).replace(year=1995).isoformat())  # just passed

    assert _preview(client, headers) == (3, ["Asha Rao", "Vikram Shah", "asha.rao"])
    assert _preview(client, headers, tags=[vip["id"]]) == (2, ["Asha Rao", "Vikram Shah"])
    assert _preview(client, headers, tags=[vip["id"], regular["id"]], tags_match="all") == (1, ["Asha Rao"])
    assert _preview(client, headers, tags=[regular["id"]], exclude_tags=[blocked["id"]]) == (1, ["Asha Rao"])
    assert _preview(client, headers, platforms=["instagram"]) == (1, ["asha.rao"])
    assert _preview(client, headers, tags=[vip["id"]], active_within_days=30) == (1, ["Asha Rao"])
    assert _preview(client, headers, consent=["opted_in"]) == (1, ["Asha Rao"])
    assert _preview(client, headers, consent=["unknown", "opted_out"])[0] == 2
    assert _preview(client, headers, birthday_within_days=7) == (1, ["Vikram Shah"])
    assert client.post(f"{API}/segments/preview", headers=headers, json={"rules": {"platforms": ["fax"]}}).status_code == 422


def test_saved_segments_are_dynamic(client, crm):
    headers, contacts, _ = crm
    vip = _tag(client, headers, "VIP")
    client.post(f"{API}/contacts/{contacts['Asha Rao']['id']}/tags/{vip['id']}", headers=headers)
    response = client.post(f"{API}/segments", headers=headers, json={"name": "VIPs", "rules": {"tags": [vip["id"]], "active_within_days": 30}})
    assert response.status_code == 201, response.text
    segment = response.json()
    assert client.post(f"{API}/segments", headers=headers, json={"name": "vips", "rules": {}}).status_code == 409

    members = client.get(f"{API}/segments/{segment['id']}/members", headers=headers).json()
    assert members["count"] == 1
    client.post(f"{API}/contacts/{contacts['Vikram Shah']['id']}/tags/{vip['id']}", headers=headers)  # tagged later
    assert client.get(f"{API}/segments/{segment['id']}/members", headers=headers).json()["count"] == 2
    assert client.get(f"{API}/segments", headers=headers).json()[0]["count"] == 2

    page = client.get(f"{API}/segments/{segment['id']}/members", headers=headers, params={"limit": 1, "offset": 1}).json()
    assert page["count"] == 2 and len(page["members"]) == 1

    renamed = client.patch(f"{API}/segments/{segment['id']}", headers=headers, json={"name": "Top customers"}).json()
    assert renamed["name"] == "Top customers" and renamed["rules"]["active_within_days"] == 30
    assert client.delete(f"{API}/segments/{segment['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/segments", headers=headers).json() == []


def test_segment_preview_saves_nothing(client, crm):
    headers, _, _ = crm
    _preview(client, headers, platforms=["whatsapp"])
    assert client.get(f"{API}/segments", headers=headers).json() == []


# ---------- demo ----------

def test_demo_tags(client, demo_headers):
    tags = {t["name"] for t in client.get(f"{API}/tags", headers=demo_headers).json()}
    assert {"VIP", "Regular", "Bridal"} <= tags
    rahul = next(c for c in client.get(f"{API}/contacts", headers=demo_headers).json() if c["name"] == "Rahul Kumar")
    assert "VIP" in [t["name"] for t in rahul["tags"]]
