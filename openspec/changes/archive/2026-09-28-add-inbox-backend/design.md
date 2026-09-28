# Design

## Context

- No backend exists. `saas inbox` pages read everything synchronously from `MessagingContext` (`getConversations`, `getMessages`, `contacts`, `sendMessage`, `receiveMessage`, `markAsRead`) with epoch-number timestamps. Every page (WhatsApp, Instagram, Messenger, Unified Inbox) goes through that context, so it is the single integration seam.
- Pages have a "simulate incoming" button that calls `receiveMessage`.
- Gmail uses a separate `InboxContext` and stays mock in this change.
- Code style follows `D:\Zeryva-AI\Zeryva-backend`: `app/{main.py, config/settings.py, db/session.py, db/models.py, models/schemas.py, services/*, api/*}`, classmethod services with docstrings, `create_all` on startup, SQLite by default.

## Goals / Non-Goals

**Goals:**
- One backend where the demo is just a workspace flag, so real and demo behavior share all code.
- Frontend pages unchanged; only the context provider and a login page change.

**Non-Goals:**
- Migrations (Alembic), multiple server workers, pagination, rate limiting.

## Decisions

### 1. Layout: `backend/` next to the frontends, Zeryva structure
`backend/app/...` exactly as Zeryva; `pyproject.toml` managed with `uv`. Tests run against a real temporary SQLite database through the HTTP API rather than mocked sessions, because the specs are HTTP-level contracts.

### 2. Data model
```
workspaces     id, name, is_demo
users          id, workspace_id, name, email (unique, lowercase), password_hash
channels       id, workspace_id, platform, name, adapter_type, config(JSON), status
contacts       id, workspace_id, name, username, avatar, phone, email
conversations  id, workspace_id, channel_id, contact_id, platform, external_id,
               status, unread_count, last_message_at, last_message_preview
               UNIQUE(channel_id, external_id)
messages       id, workspace_id, conversation_id, platform, direction, type,
               content, status, external_id, created_at
               UNIQUE(conversation_id, external_id)
```
- The customer's channel-side id lives on the conversation (`external_id`), so "first message from a new customer" = no conversation for `(channel_id, external_id)`. No separate identity table.
- `workspace_id` is denormalized onto every table so each query filters by one column; cross-workspace ids resolve to "not found" → 404.
- Naive datetimes from SQLite are treated as UTC and serialized with an offset, so the browser never reads them as local time.

### 3. Auth: stdlib PBKDF2 + PyJWT
Passwords are hashed with `hashlib.pbkdf2_hmac` (salted, 200k iterations): no new dependency. Tokens are HS256 JWTs (`pyjwt`, already in Zeryva) carrying `sub` (user id) and `wid` (workspace id), with an expiry from settings. A `current_user` dependency resolves the token on every protected route.
*Alternative:* passlib/bcrypt — extra dependency for no spec-level gain.

### 4. Channel adapters: a dict of adapter objects
`ADAPTERS = {"simulated": SimulatedAdapter()}`. Each adapter provides `send(channel, conversation, message) -> external_id` (raises `ChannelError` on failure) and `parse_webhook(channel, headers, body) -> list[InboundMessage]` (raises `WebhookAuthError`). No abstract base class until a second adapter exists. The supported platform set is a `Literal` in `schemas.py`, extended by later channel changes.

Simulated webhook body (inbox's own format):
```json
{"customer_id": "c1", "name": "Rahul", "message_id": "optional", "type": "text", "content": "Hi"}
```

### 5. Live events: in-process pub/sub + SSE
`events.publish(workspace_id, event, data)` pushes to `asyncio.Queue`s registered per workspace; `GET /events?token=...` streams them as `text/event-stream`. The token is a query parameter because the browser `EventSource` cannot set headers.
*Alternative:* WebSockets — bidirectional, not needed; SSE reconnects automatically.

### 6. Demo workspace
- Seed data lives in `app/demo/seed.json` (ported from `saas inbox` mock data), with message times stored as "minutes ago" so the demo always looks fresh.
- Startup: if `DEMO_MODE` and no `is_demo` workspace exists → create workspace, demo user, three simulated channels, seed data.
- Reset deletes the demo workspace's messages, conversations, and contacts, then re-seeds (user and channels kept).
- Simulated replies: after a staff send in a demo workspace, `asyncio.create_task` sleeps `DEMO_REPLY_DELAY_SECONDS` then delivers a canned reply through the same inbound path as a webhook, in its own DB session.

### 7. Frontend integration
- `VITE_API_URL` set → API mode; unset → existing mock data (offline dev keeps working).
- `HttpMessageService` maps snake_case/ISO responses to the existing camelCase/epoch types, so no page changes.
- On load the provider fetches conversations, then messages for each conversation (pages compute previews from `getMessages`), then opens the SSE stream. SSE `message.created` / `conversation.updated` dispatch into the existing reducer; the reducer ignores a message id it already has (the sender gets both the POST response and the event).
- "Simulate incoming" posts to the conversation's simulated channel webhook.
- New `/login` route stores the token in `localStorage`; a 401 clears it and returns to `/login`.

## Risks / Trade-offs

- [In-process event broker works for one server process only] → acceptable for demo and early customers; swap for Redis pub/sub when running multiple workers.
- [Frontend fetches messages per conversation on load (N requests)] → fine at demo scale; add a last-message preview in the UI and lazy loading when workspaces grow.
- [`create_all` has no migrations] → same as Zeryva; add Alembic before the first production data exists.
- [Token in SSE query string can appear in server logs] → short-lived tokens; move to a one-time stream ticket if logs are shipped externally.

## Migration Plan

New service, nothing to migrate. Rollback = unset `VITE_API_URL` and the frontend returns to mock data.
