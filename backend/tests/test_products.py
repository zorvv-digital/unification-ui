"""
Product tags and per-contact product interest decided by the decision model (fake provider in tests).
"""

import time

import pytest

from app.providers import decision
from app.providers.decision import DecisionError, ProductOption
from tests.conftest import API


def _wait(fn, timeout=3.0):
    """Polls `fn` until it returns something truthy (background classification) or times out."""
    deadline = time.time() + timeout
    while True:
        value = fn()
        if value or time.time() > deadline:
            return value
        time.sleep(0.05)


@pytest.fixture
def shop(client, register, add_channel):
    """A workspace with WhatsApp and Gmail. Returns (headers, say) where say(platform, customer_id, text) -> contact id."""
    headers = register("Skin Studio")
    channels = {"whatsapp": add_channel(headers, "whatsapp"), "gmail": add_channel(headers, "gmail")}

    def say(platform, customer_id, text, name=None):
        response = client.post(f"{API}/webhooks/{channels[platform]}", json={"customer_id": customer_id, "content": text, "name": name or customer_id})
        assert response.status_code == 200, response.text
        return next(c["contact"]["id"] for c in client.get(f"{API}/conversations", headers=headers).json() if c["external_id"] == customer_id)
    return headers, say


def _product(client, headers, name, keywords=(), **extra):
    response = client.post(f"{API}/products", headers=headers, json={"name": name, "keywords": list(keywords), **extra})
    assert response.status_code == 201, response.text
    return response.json()


def _contact(client, headers, contact_id):
    return client.get(f"{API}/contacts/{contact_id}", headers=headers).json()


def _interests(contact):
    return sorted(i["name"] for i in contact["product_interests"])


def _wait_status(client, headers, contact_id, status):
    return _wait(lambda: (c := _contact(client, headers, contact_id))["product_status"] == status and c)


# ---------- decision provider ----------

def test_fake_decision_matches_names_and_keywords():
    import asyncio
    products = [ProductOption("s", "Sunscreen", keywords=["spf", "sunblock"]), ProductOption("f", "Face wash"), ProductOption("h", "Haircut")]
    result = asyncio.run(decision.product_interest("Do you sell sunscreens? Also a FACE WASH for oily skin", products))
    assert result == {"s": decision.FAKE_YES, "f": decision.FAKE_YES, "h": decision.FAKE_NO}
    assert asyncio.run(decision.product_interest("what SPF is it", products))["s"] == decision.FAKE_YES
    assert asyncio.run(decision.product_interest("", products)) == {"s": 0.0, "f": 0.0, "h": 0.0}


def test_laya_provider_asks_one_yes_no_question_per_product(monkeypatch):
    import asyncio
    from app.config.settings import settings
    seen = {}

    class StubRouter:
        def predict(self, state, questions):
            seen.update(state=state, questions=questions)
            return {"answers": {key: {"noul": 0.8 if key == "s" else 0.1} for key in questions}}

    monkeypatch.setattr(settings, "DECISION_PROVIDER", "laya")
    monkeypatch.setattr(decision, "_router", StubRouter())
    products = [ProductOption("s", "Sunscreen", "SPF 50 gel", ["spf"]), ProductOption("h", "Haircut")]
    assert asyncio.run(decision.product_interest("Customer: sunscreen?", products)) == {"s": 0.8, "h": 0.1}
    assert seen["questions"]["s"]["type"] == "noul"
    assert "Sunscreen" in seen["questions"]["s"]["instructions"] and "spf" in seen["questions"]["s"]["instructions"]

    class Broken:
        def predict(self, state, questions):
            raise RuntimeError("model load failed")
    monkeypatch.setattr(decision, "_router", Broken())
    with pytest.raises(DecisionError):
        asyncio.run(decision.product_interest("x", products))


# ---------- product tags ----------

def test_product_crud(client, shop):
    headers, say = shop
    sunscreen = _product(client, headers, "Sunscreen", ["sunscreen", "spf"], description="SPF 50 gel", color="#f59e0b")
    assert (sunscreen["interested_count"], sunscreen["color"], sunscreen["keywords"]) == (0, "#f59e0b", ["sunscreen", "spf"])
    assert client.post(f"{API}/products", headers=headers, json={"name": " sunscreen "}).status_code == 409
    assert client.post(f"{API}/products", headers=headers, json={"name": "Bad", "color": "red"}).status_code == 422
    assert client.post(f"{API}/products", headers=headers, json={"name": "Many", "keywords": [f"k{i}" for i in range(21)]}).status_code == 422
    assert client.post(f"{API}/products", headers=headers, json={"name": ""}).status_code == 422
    face = _product(client, headers, "Face wash")
    assert face["color"].startswith("#")  # picked from the palette

    assert [p["name"] for p in client.get(f"{API}/products", headers=headers).json()] == ["Face wash", "Sunscreen"]
    renamed = client.patch(f"{API}/products/{face['id']}", headers=headers, json={"name": "Face Wash Gel", "keywords": ["cleanser"]}).json()
    assert (renamed["name"], renamed["keywords"]) == ("Face Wash Gel", ["cleanser"])
    assert client.patch(f"{API}/products/{face['id']}", headers=headers, json={"name": "SUNSCREEN"}).status_code == 409

    contact_id = say("whatsapp", "+911", "Hi, do you have sunscreen?")
    _wait_status(client, headers, contact_id, "determined")
    counts = {p["name"]: p["interested_count"] for p in client.get(f"{API}/products", headers=headers).json()}
    assert counts == {"Face Wash Gel": 0, "Sunscreen": 1}

    assert client.delete(f"{API}/products/{sunscreen['id']}", headers=headers).status_code == 204
    assert _contact(client, headers, contact_id)["product_interests"] == []
    assert client.delete(f"{API}/products/{sunscreen['id']}", headers=headers).status_code == 404


def test_products_are_workspace_scoped(client, shop, register):
    headers, _ = shop
    product = _product(client, headers, "Sunscreen")
    other = register("Other")
    assert client.get(f"{API}/products", headers=other).json() == []
    assert client.patch(f"{API}/products/{product['id']}", headers=other, json={"name": "x"}).status_code == 404
    assert client.delete(f"{API}/products/{product['id']}", headers=other).status_code == 404


# ---------- per-contact classification ----------

def test_customer_message_tags_the_contact(client, shop, monkeypatch):
    from app.services.event_service import EventService
    headers, say = shop
    _product(client, headers, "Sunscreen", ["spf"])
    _product(client, headers, "Face wash")
    events = []
    original = EventService.publish.__func__
    monkeypatch.setattr(EventService, "publish", classmethod(lambda cls, k, e, d: (events.append((e, d)), original(cls, k, e, d))))

    contact_id = say("whatsapp", "+912", "Do you have sunscreen for oily skin?")
    contact = _wait_status(client, headers, contact_id, "determined")
    assert contact, "contact was not classified"
    [interest] = contact["product_interests"]
    assert (interest["name"], interest["source"], interest["confidence"]) == ("Sunscreen", "ai", decision.FAKE_YES)
    assert contact["product_classified_at"]
    live = [d for e, d in events if e == "conversation.updated" and d.contact.product_status == "determined"]
    assert live and live[-1].contact.product_interests[0].name == "Sunscreen"


def test_unrelated_chat_and_no_products(client, shop):
    headers, say = shop
    lonely = say("whatsapp", "+913", "Do you have sunscreen?")
    time.sleep(0.3)
    assert _contact(client, headers, lonely)["product_status"] == "pending"  # no products yet

    _product(client, headers, "Sunscreen")
    parking = say("whatsapp", "+914", "Is there parking near the shop?")
    assert _wait_status(client, headers, parking, "not_determined")


def test_interests_accumulate(client, shop):
    headers, say = shop
    _product(client, headers, "Sunscreen")
    _product(client, headers, "Face wash")
    contact_id = say("whatsapp", "+915", "Any sunscreen in stock?")
    _wait_status(client, headers, contact_id, "determined")
    say("whatsapp", "+915", "Thanks! And a face wash for dry skin?")
    assert _wait(lambda: _interests(_contact(client, headers, contact_id)) == ["Face wash", "Sunscreen"])


def test_interests_across_channels_after_merge(client, shop):
    headers, say = shop
    _product(client, headers, "Sunscreen")
    _product(client, headers, "Face wash")
    whatsapp = say("whatsapp", "+916", "sunscreen please", name="Meera")
    gmail = say("gmail", "meera@example.com", "Do you sell face wash?", name="Meera N")
    _wait_status(client, headers, whatsapp, "determined")
    _wait_status(client, headers, gmail, "determined")
    assert client.post(f"{API}/contacts/{whatsapp}/merge", headers=headers, json={"source_contact_id": gmail}).status_code == 200
    assert _interests(_contact(client, headers, whatsapp)) == ["Face wash", "Sunscreen"]


def test_staff_overrides_stick(client, shop):
    headers, say = shop
    sunscreen = _product(client, headers, "Sunscreen")
    face = _product(client, headers, "Face wash")
    contact_id = say("whatsapp", "+917", "sunscreen?")
    _wait_status(client, headers, contact_id, "determined")

    removed = client.delete(f"{API}/contacts/{contact_id}/product-interests/{sunscreen['id']}", headers=headers)
    assert removed.status_code == 200 and removed.json()["product_interests"] == []
    added = client.post(f"{API}/contacts/{contact_id}/product-interests/{face['id']}", headers=headers)
    assert added.status_code == 200
    assert [(i["name"], i["source"], i["confidence"]) for i in added.json()["product_interests"]] == [("Face wash", "staff", None)]
    assert client.post(f"{API}/contacts/{contact_id}/product-interests/{face['id']}", headers=headers).status_code == 200  # idempotent

    say("whatsapp", "+917", "I really want the sunscreen")  # the AI must not re-add a removed interest
    detected = client.post(f"{API}/contacts/{contact_id}/product-interests/classify", headers=headers)
    assert detected.status_code == 200
    assert [(i["name"], i["source"]) for i in detected.json()["product_interests"]] == [("Face wash", "staff")]

    assert client.post(f"{API}/contacts/{contact_id}/product-interests/{sunscreen['id']}", headers=headers).json()["product_interests"][1]["name"] == "Sunscreen"  # staff can add it back
    assert client.delete(f"{API}/contacts/{contact_id}/product-interests/00000000-0000-0000-0000-000000000000", headers=headers).status_code == 404


def test_redetect_reports_model_failure(client, shop, monkeypatch):
    headers, say = shop
    _product(client, headers, "Sunscreen")
    contact_id = say("whatsapp", "+918", "sunscreen?")
    _wait_status(client, headers, contact_id, "determined")
    before = _contact(client, headers, contact_id)

    async def down(text, products):
        raise DecisionError("model unavailable")
    monkeypatch.setattr(decision, "product_interest", down)
    response = client.post(f"{API}/contacts/{contact_id}/product-interests/classify", headers=headers)
    assert response.status_code == 502
    assert _contact(client, headers, contact_id)["product_classified_at"] == before["product_classified_at"]


def test_new_product_tags_existing_chats(client, shop):
    headers, say = shop
    contact_id = say("whatsapp", "+919", "Do you have sunscreen?")
    time.sleep(0.2)
    assert _contact(client, headers, contact_id)["product_status"] == "pending"
    _product(client, headers, "Sunscreen")
    assert _wait_status(client, headers, contact_id, "determined")


# ---------- filters and segments ----------

def test_contact_filters_and_segments(client, shop):
    headers, say = shop
    sunscreen = _product(client, headers, "Sunscreen")
    face = _product(client, headers, "Face wash")
    both = say("whatsapp", "+9110", "sunscreen and face wash please", name="Both")
    sun = say("whatsapp", "+9111", "sunscreen please", name="Sun")
    none = say("whatsapp", "+9112", "where are you located?", name="None")
    for contact_id, status in [(both, "determined"), (sun, "determined"), (none, "not_determined")]:
        assert _wait_status(client, headers, contact_id, status)
    _wait(lambda: len(_interests(_contact(client, headers, both))) == 2)

    names = lambda **params: sorted(c["name"] for c in client.get(f"{API}/contacts", headers=headers, params=params).json())
    assert names(product_ids=[sunscreen["id"]]) == ["Both", "Sun"]
    assert names(product_ids=[face["id"]]) == ["Both"]
    assert names(product_status="not_determined") == ["None"]
    assert client.get(f"{API}/contacts", headers=headers, params={"product_status": "maybe"}).status_code == 422

    preview = lambda **rules: sorted(m["name"] for m in client.post(f"{API}/segments/preview", headers=headers, json={"rules": rules}).json()["members"])
    assert preview(products=[sunscreen["id"], face["id"]]) == ["Both", "Sun"]
    assert preview(products=[sunscreen["id"], face["id"]], products_match="all") == ["Both"]


# ---------- demo ----------

def test_demo_products_and_reset(client, demo_headers):
    products = {p["name"]: p for p in client.get(f"{API}/products", headers=demo_headers).json()}
    assert {"Haircut", "Bridal makeup", "Facial"} <= set(products)
    contacts = {c["name"]: c for c in client.get(f"{API}/contacts", headers=demo_headers).json()}
    assert "Bridal makeup" in _interests(contacts["Ananya Rao"])
    assert contacts["Mark Smith"]["product_status"] == "not_determined"

    client.post(f"{API}/products", headers=demo_headers, json={"name": "Nail art"})
    client.delete(f"{API}/products/{products['Facial']['id']}", headers=demo_headers)
    assert client.post(f"{API}/demo/reset", headers=demo_headers).status_code == 204
    after = {p["name"] for p in client.get(f"{API}/products", headers=demo_headers).json()}
    assert after == set(products)
