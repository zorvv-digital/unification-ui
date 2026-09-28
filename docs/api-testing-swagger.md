# Manual API Testing with Swagger

This guide walks through every backend endpoint using the Swagger UI, including the error cases.
You need no other tools. Each step lists what to click, what to send, and what you should see.

## 0. Start the backend

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Open **http://localhost:8000/docs**.

> To start from a clean database, stop the server, delete `backend/unification.db*`, and start it again.
> The demo workspace is created automatically on startup.

---

## 1. System

| Step | Endpoint | Do | Expect |
|---|---|---|---|
| 1.1 | `GET /api/v1/health` | Try it out → Execute | `200` `{"status": "ok"}` |

---

## 2. Auth

### 2.1 Log in as the demo user
`POST /api/v1/auth/login` → Try it out, body:
```json
{ "email": "demo@unification.app", "password": "demo12345" }
```
Expect `200` with `access_token`. **Copy the token value.**

### 2.2 Authorize Swagger
Click **Authorize** (top right, padlock). Paste the token (without the word `Bearer`) → Authorize → Close.
All padlocked endpoints now send the token.

### 2.3 Who am I
`GET /api/v1/auth/me` → Execute.
Expect `200`, workspace `"Glow Salon & Spa (Demo)"` with `"is_demo": true`, and **no password field**.

### 2.4 Register a second business (used later for isolation checks)
`POST /api/v1/auth/register`:
```json
{ "workspace_name": "Sunrise Bakery", "name": "Asha", "email": "asha@example.com", "password": "password123" }
```
Expect `201` with a token. Copy it somewhere as **TOKEN_B**; stay authorized as the demo user for now.

### 2.5 Error cases

| Case | Request | Expect |
|---|---|---|
| Same email again | repeat 2.4 | `409` "Email already registered" |
| Short password | 2.4 with `"password": "short"` and a new email | `422` |
| Wrong password | 2.1 with `"password": "wrong"` | `401` "Invalid email or password" |
| Unknown email | 2.1 with `"email": "nobody@example.com"` | `401`, same message as above |
| No token | Authorize → Logout, then `GET /auth/me` | `401` "Not authenticated" |
| Bad token | Authorize with `abc`, then `GET /auth/me` | `401` "Invalid or expired token" |

Re-authorize with the demo token before continuing.

---

## 3. Channels

`GET /api/v1/channels` → Execute.
Expect three channels, `whatsapp`, `instagram`, `messenger`, all `adapter_type: "simulated"`, `status: "connected"`, and **no `config` field**.
**Copy the `id` of the WhatsApp channel** (CHANNEL_ID).

---

## 4. Inbox

### 4.1 List conversations
`GET /api/v1/conversations` → Execute (no parameters).
Expect 6 conversations, newest `last_message_at` first, each with `contact`, `unread_count`, `last_message_preview`. Timestamps end with `+00:00`.
**Copy the first conversation's `id`** (CONV_ID) and its `contact.id` (CONTACT_ID).

### 4.2 Filters

| Parameters | Expect |
|---|---|
| `platform=instagram` | only `instagram` conversations |
| `platform=messenger`, `status=closed` | only Diana's closed conversation |
| `platform=myspace` | `422` |

### 4.3 Read messages
`GET /api/v1/conversations/{conversation_id}/messages` with CONV_ID.
Expect messages oldest first, each with `direction`, `status`, `timestamp`.

### 4.4 Send a message
`POST /api/v1/conversations/{conversation_id}/messages` with CONV_ID:
```json
{ "content": "Yes, 7:30 is booked for you!", "type": "text" }
```
Expect `201`, `direction: "outbound"`, `status: "sent"`, `external_id` starting with `sim-`.

Wait ~3 seconds, then repeat **4.3**: a new **inbound** message (the simulated customer reply) is at the end.

| Error case | Body | Expect |
|---|---|---|
| Empty message | `{ "content": "   " }` | `422` |
| Unknown conversation | any body, random UUID as id | `404` |

### 4.5 Mark as read
`POST /api/v1/conversations/{conversation_id}/read` with CONV_ID.
Expect `unread_count: 0`. Repeat 4.3: every inbound message has `status: "read"`.

### 4.6 Close and reopen
`PATCH /api/v1/conversations/{conversation_id}` with CONV_ID, body `{ "status": "closed" }` → `status: "closed"`.
Then `GET /conversations?status=open`: the conversation is gone from the list.
Send a message to it (4.4): it comes back as `open`.

### 4.7 Contact details
`GET /api/v1/contacts/{contact_id}` with CONTACT_ID.
Expect name, phone, email, avatar and `conversation_ids` containing CONV_ID.

---

## 5. Webhooks (simulating a customer)

`POST /api/v1/webhooks/{channel_id}` needs **no token**; it is what a channel calls.

### 5.1 New customer
With CHANNEL_ID (WhatsApp):
```json
{ "customer_id": "+919900011122", "name": "Meera", "message_id": "wamid-001", "type": "text", "content": "Hi, do you do nail art?" }
```
Expect `{"received": 1}`. Then `GET /conversations`: Meera is at the top with `unread_count: 1` and a new contact.

### 5.2 Duplicate delivery
Send exactly the same body again. Expect `{"received": 0}`; Meera's `unread_count` stays `1`.

### 5.3 Same customer, new message
Change `message_id` to `wamid-002` and `content` to `"Tomorrow 5pm?"`. Expect `{"received": 1}`, unread becomes `2`, same conversation.

### 5.4 Error cases

| Case | Expect |
|---|---|
| Random UUID as `channel_id` | `404` "Channel not found" |
| `"content": ""` | `422` |
| Missing `customer_id` | `422` |

---

## 6. Live events (SSE)

Swagger cannot display a stream, so use a second browser tab:

1. Copy your demo token.
2. Open `http://localhost:8000/api/v1/events?token=<TOKEN>` in a new tab. It stays loading, which is expected.
3. In Swagger, send a message (4.4) or post a webhook (5.1).
4. The events tab shows `event: message.created` and `event: conversation.updated` lines, and a `: keepalive` line every 15 seconds.

With `curl`: `curl -N "http://localhost:8000/api/v1/events?token=<TOKEN>"`.

An invalid `token` returns `401` immediately.

---

## 7. Workspace isolation

Authorize with **TOKEN_B** (Sunrise Bakery):

| Request | Expect |
|---|---|
| `GET /conversations` | `[]` |
| `GET /channels` | `[]` |
| `GET /conversations/{CONV_ID}/messages` | `404` |
| `POST /conversations/{CONV_ID}/messages` | `404` |
| `POST /conversations/{CONV_ID}/read` | `404` |
| `GET /contacts/{CONTACT_ID}` | `404` |
| `POST /demo/reset` | `403` "Only the demo workspace can be reset" |

A real business's messages never get simulated replies; it has no channels until real channel integrations are added.

---

## 8. Demo reset

Authorize with the demo token again.
`POST /api/v1/demo/reset` → `204`.
`GET /conversations`: back to the 6 seeded conversations; Meera and all messages you sent are gone, and unread counts are restored.
