# Proposal

## Why

Businesses want to know what each customer is interested in, so they can follow up and target campaigns (for example
"everyone who asked about Sunscreen"). Today staff tag contacts by hand. The customer's own chats already say what
they want, so the platform should read them and tag the customer automatically, with an open-source decision model
(Laya) rather than the chat LLM.

## What Changes

- **Product tags:** workspace products or services with a name, a description, keywords and a color, for the
  classifier to recognize.
- **Per-contact product interest:** after each customer message on any channel, the contact's recent messages across
  all their chats are classified against the workspace's products.
  - Products at or above a configurable confidence threshold (default 0.5) become interests; they accumulate over time.
  - The contact's status is `pending`, `determined` or `not_determined`.
- **Staff overrides:** staff can add or remove interests. Staff-added interests are never removed by the AI, and
  staff-removed ones are never re-added. Staff can also re-run the analysis.
- **Filters:** contacts can be filtered by product and status, and segments gain a `products` rule.
- Creating or editing a product re-analyses the workspace's contacts in the background.
- **Decision provider seam:** `DECISION_PROVIDER=fake` (offline keyword matching, the default and used in tests) or
  `laya` (the Laya Python package, run locally with one yes/no question per product).
- **Demo:** seeded salon products with seeded interests; reset restores them.
- The API follows `docs/api-product-interest.md`, already shared with the frontend.

## Capabilities

### New Capabilities
- `product-interest`: product tags, per-contact AI product interest with statuses and staff overrides, filters, and
  the decision provider.

### Modified Capabilities
- `crm-segments`: segment rules gain interested-in-products.

## Impact

- **Backend:**
  - New `products` and `contact_products` tables, plus a `contacts.product_classified_at` column. There are no
    migrations, so delete `unification.db`.
  - New `providers/decision.py`, `services/product_service.py`, `api/products.py`, contact endpoints, and a trigger
    in `InboxService.receive_message`.
- **Dependencies:** `laya` as an optional extra (`uv sync --extra laya`). It pulls in torch and transformers, and a
  model of about 1.5GB is downloaded on first use. The core install and the tests don't need it.
