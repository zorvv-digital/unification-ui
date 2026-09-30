# Design

## Context

- **CRM** (`crm_service.py`): contacts carry tags through `contact_tags`. `ContactService.list_items` filters in
  Python, `ContactService.publish` pushes `conversation.updated`, and `SegmentService._matches` evaluates rules on
  `ContactListItem`.
- **Inbound path:** every inbound message, from every channel, the customer app and the demo, goes through
  `InboxService.receive_message`.
- **AI provider pattern:** `providers/llm.py`, with `LLM_PROVIDER=fake|openai` and a fake for tests.
- **Laya** (`pip install laya`, Apache 2.0) exposes `Router().predict(state, questions)`.
  - The question types are `choice` (a single label), `score` and `noul` (yes/no probability).
  - It depends on torch and transformers, and downloads its model on first use.

## Goals / Non-Goals

**Goals:** implement `docs/api-product-interest.md` exactly, decide per contact from all their chats, run locally, and
keep tests offline.

**Non-Goals:**
- Classifying staff or AI messages.
- Sentiment and buying-stage scoring (possible later with `score` questions).
- A product catalog with prices or stock.
- Running Laya as a separate service.

## Decisions

### 1. Data
- `Product`: `workspace_id`, `name`, `name_key` (unique per workspace), `description`, `keywords` (JSON list) and
  `color`.
- `ContactProduct`: primary key (`contact_id`, `product_id`), both with cascading deletes. Fields: `source` (`ai` or
  `staff`), `confidence` (nullable), `dismissed` (bool) and `last_detected_at`.
  - A staff removal sets `dismissed=True` instead of deleting the row, which is how the AI knows never to re-add it.
- `Contact.product_classified_at` (nullable).
- `product_status` is derived: any interests that aren't dismissed → `determined`; else classified →
  `not_determined`; else `pending`.
- The contact relationship `product_links` uses `lazy="selectin"`, with `product` joined, so `ContactResponse` can
  serialize `product_interests` and `product_status` everywhere a contact appears, like `tags`.

### 2. Multi-product decisions with Laya
Laya's `choice` returns one label, but a customer can want several products. So each product becomes one `noul`
question: *"Is the customer asking about or interested in {name}? {description} Keywords: {keywords}"*. The yes
probability is the confidence, and products at or above the threshold are added. One `predict` call carries all the questions.

### 3. Provider seam: `providers/decision.py`
- `async product_interest(text, products) -> dict[product_id, probability]`, raising `DecisionError`.
- `fake` gives 0.9 when the product's name or a keyword (lowercase, including a plural or singular form) appears as
  a word in the text, and 0.05 otherwise.
- `laya` lazily builds one `Router(max_loaded=1)` and runs `predict` in `asyncio.to_thread`, so the event loop is
  never blocked. The import happens only when the provider is used, so the core install doesn't need torch.
- Settings: `DECISION_PROVIDER` (default `fake`) and `DECISION_THRESHOLD` (0.5, tuned on real chats). Tests force `fake`.

### 4. `ProductService` (`services/product_service.py`)
- Product CRUD, plus `interested_count` (a grouped count of links that aren't dismissed).
- `classify_contact(db, contact)`:
  - Collects the last 20 inbound messages across the contact's conversations, oldest first, joined as
    `Customer: ...` lines and capped to the last 3,000 characters.
  - With no products or no inbound messages, it leaves the contact `pending`.
  - Otherwise it upserts the AI interests (keeping staff rows and skipping dismissed ones), sets
    `product_classified_at`, commits, and calls `ContactService.publish`.
- `schedule_contact(contact_id)` starts a background task with its own session, one per contact at a time. A contact
  already queued is skipped, and a message arriving mid-run triggers one more run.
- `schedule_workspace(workspace_id)` does the same for every contact with inbound messages.
- `receive_message` calls `schedule_contact` after commit. It's imported lazily, avoiding a circular import.
- *ponytail:* in-process tasks on a single server process. A queue can come later if volume needs it.

### 5. API
- `api/products.py`: `/products` CRUD. Create and update call `schedule_workspace`.
- `api/contacts.py`: `POST /contacts/{id}/product-interests/classify` (synchronous, 502 on `DecisionError`), plus
  `POST` and `DELETE /contacts/{id}/product-interests/{product_id}`.
  - The list endpoint gains `product_ids` (repeatable) and `product_status`.
- `SegmentRules` gains `products` and `products_match`, and `_matches` checks them.
- A contact merge moves product links: the target keeps its own; otherwise the source's rows move over, and dismissed
  rows are preserved.

### 6. Demo
- `seed.json` gets salon products: Haircut, Hair colouring, Bridal makeup, Facial and Massage (with keywords).
- Each seeded contact gets `products: [...]`, stored as AI interests (confidence 0.9) and marked classified. So the
  demo shows determined and not-determined customers without loading the model at startup.
- Reset deletes products and links before re-seeding.

## Risks / Trade-offs

- [torch and a model of about 1.5GB] → It's an optional extra; the default and CI use `fake`. The first Laya call
  downloads and loads the model (tens of seconds). Only the background task waits, and the endpoint's re-detect may
  be slow the first time.
- [CPU latency with many products] → It's one batched call per contact, and around 30ms per question on GPU. On CPU
  it's slower, but background.
- [False positives] → A tuned threshold (0.5; interested customers scored 0.61–0.83, unrelated ones 0.16 or below), plus staff removal that sticks.

## Migration Plan

To deploy, delete `unification.db`, run `uv sync` (and `uv sync --extra laya` for real classification), and set
`DECISION_PROVIDER=laya`. To roll back, revert.
