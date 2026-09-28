# Tasks

## 1. Backend scaffold

- [x] 1.1 Create `backend/` with Zeryva layout (`app/main.py`, `config/settings.py`, `db/session.py`, `db/models.py`, `models/schemas.py`, `services/`, `api/`), `pyproject.toml` (uv), `.env.example`, `.gitignore`, README quickstart; verify `uv sync` succeeds and `GET /api/v1/health` returns `{"status": "ok"}`
- [x] 1.2 Add test harness (`tests/conftest.py` with a temporary SQLite database and an app client); verify `uv run pytest` runs the health check test

## 2. Workspaces and auth

- [x] 2.1 Add `Workspace` and `User` models, PBKDF2 password hashing, JWT issue/verify, and `current_user` dependency; verify via tests
- [x] 2.2 Add `POST /auth/register`, `POST /auth/login`, `GET /auth/me`; verify tests cover success, duplicate email 409, wrong credentials 401 with identical message, missing/invalid/expired token 401, and no password fields in responses

## 3. Channels and unified inbox

- [x] 3.1 Add `Channel`, `Contact`, `Conversation`, `Message` models and schemas with UTC ISO timestamps; verify tables are created on startup
- [x] 3.2 Add channel adapter registry with the `simulated` adapter and `GET /channels` (no secrets); verify test lists channels without config
- [x] 3.3 Add in-process event broker and `GET /events` SSE stream; verify test that events reach only the publishing workspace
- [x] 3.4 Add inbox service and routes: list conversations (platform/status filters, newest first), conversation messages, send (empty 422, closed → reopen, adapter failure → `failed`), mark read, close/reopen, contact details; verify tests for each spec scenario including cross-workspace 404
- [x] 3.5 Add `POST /webhooks/{channel_id}` inbound path (unknown channel 404, auth failure 401, new customer creates contact + conversation, duplicate message id ignored); verify tests

## 4. Demo workspace

- [x] 4.1 Add `app/demo/seed.json` and idempotent startup seeding behind `DEMO_MODE` with configurable demo credentials; verify tests for first start, restart (no duplicates), and demo login
- [x] 4.2 Add simulated customer replies after staff sends in the demo workspace only (configurable delay); verify test that a reply arrives in demo and not in a non-demo workspace
- [x] 4.3 Add `POST /demo/reset` (403 outside demo); verify test that changes are discarded and seed state restored
- [x] 4.4 Write `docs/api-testing-swagger.md`: step-by-step manual testing of every endpoint through Swagger UI (authorize, inbox, webhook simulation, events, demo reset, error cases); verify each step against the running server

## 5. Frontend integration (`saas inbox`)

- [x] 5.1 Add `HttpMessageService` (API client, snake_case/ISO → existing camelCase/epoch types) and `VITE_API_URL` switch with mock fallback; verify `npm run build` passes
- [x] 5.2 Update `MessagingProvider` to load conversations/messages from the API, subscribe to SSE, dedupe message ids, and route "simulate incoming" to the channel webhook; verify `npm run build` passes
- [x] 5.3 Add `/login` page, token storage, 401 → login redirect, and logout / reset-demo actions; verify `npm run build` passes
- [x] 5.4 Write `docs/ui-user-flow.md`: running both apps and the end-to-end demo flow through the UI; verify each step in the browser against the running backend

## 6. Integration check

- [x] 6.1 Run backend tests and frontend build, start both, and walk the UI flow doc end to end (login, list, filter, send, simulated reply arrives live, simulate incoming, mark read, reset)
