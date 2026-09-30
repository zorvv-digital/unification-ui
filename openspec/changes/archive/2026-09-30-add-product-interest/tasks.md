# Tasks

## 1. Backend

- [x] 1.1 Decision provider (`providers/decision.py`) with the `fake` and `laya` providers and settings, plus unit
  tests for the fake matching and threshold handling.
- [x] 1.2 Product models, schemas, service and `/products` CRUD. Test first: unique name ignoring case (409),
  validation (422), `interested_count`, and delete removes interests.
- [x] 1.3 Per-contact classification. Test first:
  - An inbound message tags the contact in the background (live `conversation.updated`).
  - An unrelated chat gives `not_determined`, and no products leaves `pending`.
  - Interests accumulate across messages and channels.
  - A staff add or remove sticks.
  - Re-detect returns 502 when the provider fails.
  - Creating a product re-analyses existing chats.
- [x] 1.4 Filters (`product_ids`, `product_status`), the segment `products` rule, and merge moving the links. Test
  first.
- [x] 1.5 Demo: seeded products and interests, and reset restores them. Update the demo tests. Run `uv run pytest` and
  confirm all tests pass.
- [x] 1.6 Install the Laya extra, set `DECISION_PROVIDER=laya` locally, and verify real classification on sample
  chats.
- [x] 1.7 Docs: a Swagger walkthrough section, plus notes in CLAUDE.md-style setup (`uv sync --extra laya`,
  `DECISION_PROVIDER`). Mark `docs/api-product-interest.md` as implemented.

## 2. Release

- [x] 2.1 Validate, archive, commit, and push `feature/add-product-interest`, then merge into `dev`.
