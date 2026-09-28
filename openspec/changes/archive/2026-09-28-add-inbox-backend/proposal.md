# Proposal

## Why

Both frontends (`saas inbox` and `demo-unified-inbox`) run purely on in-browser mock data, so nothing persists, nothing is multi-user, and no real channel can ever be connected. We need one backend that serves real businesses and a seeded demo workspace from the same code, so the demo stops being a separate app that drifts from the product.

## What Changes

- Add a new Python backend at `backend/` following the Zeryva-backend conventions (FastAPI, async SQLAlchemy, SQLite by default with `DATABASE_URL` override, single `models.py` / `schemas.py`, classmethod services, per-resource routers under `/api/v1`, seed via `scripts/db_seed_manager.py` + `db_seed.json`).
- Introduce workspaces (one per business) and users with JWT login; every data query is scoped to the caller's workspace.
- Introduce the unified inbox API: contacts, conversations, and messages across platforms, with send, mark-as-read, platform filtering, and a server-sent events stream for live updates.
- Introduce a channel adapter contract (outbound send + inbound webhook parsing) with a single `simulated` adapter in this change; real channel adapters come in later changes.
- Introduce a demo workspace seeded from the existing frontend mock data, with simulated customer replies and a reset endpoint.
- Wire `saas inbox` to the API by adding an HTTP implementation of its existing `MessageService` interface.
- `demo-unified-inbox` is retired once the demo workspace covers its flows (removal happens in a follow-up, not this change).

## Capabilities

### New Capabilities
- `workspaces-auth`: Workspaces, users, JWT login, and workspace scoping of all data access.
- `unified-inbox`: Contacts, conversations, and messages API across platforms, including send, read state, filtering, and live event stream.
- `channel-adapters`: Adapter contract for sending and receiving channel messages, plus the `simulated` adapter.
- `demo-workspace`: Seeded demo workspace, simulated inbound replies, and reset.

### Modified Capabilities

None. `mock-gmail-integration` stays frontend-only in this change; Gmail moves to the backend in its own later change.

## Impact

- **New code:** `backend/` (Python 3.12, FastAPI, SQLAlchemy async, aiosqlite/asyncpg, pydantic-settings, pyjwt, pytest-asyncio).
- **Frontend:** `saas inbox/src/services/messaging/` gains an HTTP service; `MessagingContext` loads from and subscribes to the API. Mock service remains usable offline.
- **Out of scope (later changes):** real WhatsApp / Meta / Google / Gmail channels, AI replies and AI playground agent builder, reviews and reputation, CRM tags, campaigns, push notifications, mobile app.
