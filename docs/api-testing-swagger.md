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
> New columns are not migrated: after pulling a change that adds database fields, delete `backend/unification.db*` once.

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
Expect five channels: `whatsapp`, `instagram`, `messenger`, `gmail` with `adapter_type: "simulated"`, and the real `website` chat widget (§14), all `status: "connected"`, and **no `config` field**.
WhatsApp has `ai_enabled: true` with the demo agent as `ai_agent_id`; the others have `ai_enabled: false` (see §10).
**Copy the `id` of the WhatsApp channel** (CHANNEL_ID).

---

## 4. Inbox

### 4.1 List conversations
`GET /api/v1/conversations` → Execute (no parameters).
Expect 10 conversations, newest `last_message_at` first, each with `contact`, `unread_count`, `last_message_preview`. Timestamps end with `+00:00`.
The three `gmail` ones are email threads and also have a `subject` (other channels have `subject: null`).
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
`GET /conversations`: back to the 10 seeded conversations; Meera and all messages you sent are gone, and unread counts are restored.

---

## 9. AI agents, knowledge, and playground

These endpoints are under the **AI Agents** and **Knowledge** tags. Stay authorized as the demo user.

> **AI provider.** By default the backend uses `LLM_PROVIDER=fake`: an offline, deterministic model. It answers with the
> matching knowledge item (e.g. asking about "pricing" returns the Pricing item) and otherwise with a generic reply.
> For real AI answers set in `backend/.env`:
> `LLM_PROVIDER=openai`, `LLM_API_KEY=...`, and optionally `LLM_MODEL` / `LLM_BASE_URL` (any OpenAI-compatible API:
> OpenAI, Gemini's OpenAI endpoint (the default URL), NVIDIA NIM). Restart the server after changing it.

### 9.1 Knowledge items
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| List | `GET /knowledge` | none | 4 demo items: About Us, Brand Tone, Pricing, Booking Policy |
| Create | `POST /knowledge` | `{"title": "Gift Vouchers", "category": "Sales", "content": "Vouchers from 1,000 INR, valid 1 year."}` | `201`, `enabled: true`. Copy its `id` (ITEM_ID) |
| Update | `PATCH /knowledge/{ITEM_ID}` | `{"content": "Vouchers from 1,500 INR."}` | `200`, only content changed |
| Too long | `POST /knowledge` | `content` longer than 20,000 characters | `422` |
| Disable | `PATCH /knowledge/{ITEM_ID}` | `{"enabled": false}` | `enabled: false` |

### 9.2 The demo agent
1. `GET /agents` → one agent, **Glow Assistant**, `active_version_number: 1`. Copy its `id` (AGENT_ID).
2. `GET /agents/{AGENT_ID}` → the full active version (system prompt, greeting, rules) and `knowledge_ids` (the 4 demo items).

### 9.3 Playground chat
1. `POST /agents/{AGENT_ID}/playground/chat` with `{"message": "What is your pricing for a haircut?"}`.
   Expect `200` with a `reply`, a new `session_id`, and `version_number: 1`. Copy the `session_id`.
2. Continue the conversation: `{"message": "And a beard trim?", "session_id": "<SESSION_ID>"}`. The reply uses the earlier turns.
3. New session: omit `session_id`. You get a different `session_id` and no memory of the earlier chat.
4. Attach the voucher item: `POST /agents/{AGENT_ID}/knowledge/{ITEM_ID}` → `204`. Re-enable it (9.1 PATCH `enabled: true`).
   Ask `{"message": "Do you sell gift vouchers?"}`: the reply uses the voucher text **without creating a new version**.
5. `GET /conversations` afterwards: nothing new. Playground chats never reach the inbox or customers.

### 9.4 Improve the agent ("retraining")
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| Feedback | `POST /agents/{AGENT_ID}/refine` | `{"feedback": "Always mention free parking"}` | `201`, `version_number: 2`, `source: "feedback"`, `is_active: false` |
| Test draft | `POST /agents/{AGENT_ID}/playground/chat` | `{"message": "Hi", "version_number": 2}` | answered with the draft (`version_number: 2`) |
| Activate | `POST /agents/{AGENT_ID}/versions/2/activate` | none | `active_version_number: 2` |
| Manual edit | `POST /agents/{AGENT_ID}/versions` | `{"greeting_message": "Hello from Glow!"}` | `201`, `version_number: 3`, active; other fields copied from v2 |
| History | `GET /agents/{AGENT_ID}/versions` | none | versions 3, 2, 1 (newest first), only v3 `is_active` |
| Roll back | `POST /agents/{AGENT_ID}/versions/1/activate` | none | `active_version_number: 1` |
| Unknown version | `POST /agents/{AGENT_ID}/versions/99/activate` | none | `404` |

### 9.5 Build a new agent
1. `POST /agents/profiler/questions` with
   `{"business_name": "Bright Smile", "business_type": "Dental Clinic", "location": "Kochi"}`
   → a list of `fields` (question text, `ui_type`, options).
2. `POST /agents/generate` with
   ```json
   {
     "business_profile": {"business_name": "Bright Smile", "business_type": "Dental Clinic", "location": "Kochi",
                          "offerings": ["Cleaning", "Braces"], "working_hours": "Mon-Sat 9-6"},
     "collected_answers": {"top_services": "Cleaning and braces", "booking_method": "Phone"},
     "agent_setup": {"agent_name": "Smiley", "personality": "calm and reassuring", "rules": ["Never quote surgery prices"]}
   }
   ```
   → `201`, agent **Smiley** with version 1 (`source: "generated"`).
3. `PATCH /agents/{id}` `{"name": "Front Desk"}` renames it; `DELETE /agents/{id}` → `204`, and it disappears from `GET /agents`.

### 9.6 Error cases
| Case | Expect |
|---|---|
| AI provider down or misconfigured (`LLM_PROVIDER=openai` with a bad key) on generate / questions / refine / chat | `502`, nothing stored; the next chat in the same session still works |
| Another workspace's agent or knowledge id (use TOKEN_B) | `404` |
| Attaching another workspace's knowledge item | `404` |

### 9.7 Demo reset restores the AI setup
`POST /demo/reset` restores the seeded agent (version 1 only) and the 4 knowledge items; agents and items you created are removed.
The agent gets a **new id** after a reset, so run `GET /agents` again.

---

## 10. AI replies in the inbox

Stay authorized as the demo user. The demo WhatsApp channel has AI auto-reply on with **Glow Assistant**, and
**Priya Singh**'s conversation is in `ai` mode. Conversations now show `mode` (`ai` or `human`) and `needs_human`;
messages show `author` (`customer`, `staff`, or `agent`). Start from a fresh `POST /demo/reset`.

### 10.1 Auto-reply settings per channel
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| See settings | `GET /channels` | none | WhatsApp `ai_enabled: true`, `ai_agent_id` = AGENT_ID (from `GET /agents`) |
| Turn off | `PATCH /channels/{CHANNEL_ID}` | `{"ai_enabled": false}` | `200`, `ai_enabled: false` |
| Turn on | `PATCH /channels/{CHANNEL_ID}` | `{"ai_enabled": true, "ai_agent_id": "<AGENT_ID>"}` | `200`, `ai_enabled: true` |
| Instagram without agent | `PATCH /channels/{INSTAGRAM_ID}` | `{"ai_enabled": true}` | `400` "Choose an agent to enable AI auto-reply" |
| Another workspace's agent | `PATCH /channels/{CHANNEL_ID}` | `{"ai_agent_id": "<agent id from TOKEN_B>"}` | `404` |

### 10.2 The AI answers a new customer
1. `POST /webhooks/{CHANNEL_ID}` (no token) with
   `{"customer_id": "+919900055566", "name": "Kavya", "content": "What is your pricing for a haircut?"}` → `200`.
2. `GET /conversations`: **Kavya** is at the top with `mode: "ai"`.
3. `GET /conversations/{id}/messages`: her question (`author: "customer"`) followed by the agent's answer
   (`direction: "outbound"`, `author: "agent"`) containing the Pricing knowledge.
4. Send another webhook message from the same `customer_id`: it is answered too, using the earlier messages as context.

### 10.3 Staff take over, then hand back
1. `POST /conversations/{id}/messages` `{"content": "Hi Kavya, this is Anu from Glow!"}` → `author: "staff"`.
   The conversation is now `mode: "human"`.
2. Another webhook message from Kavya → stored, **no AI reply**.
3. `PATCH /conversations/{id}` `{"mode": "ai"}` → `200`, `mode: "ai"`. The next webhook message gets an AI reply again.
4. `PATCH /conversations/{id}` `{"mode": "ai"}` on an **Instagram** conversation (channel without auto-reply) → `400`.

### 10.4 Escalation
| Customer writes (webhook, `ai` mode) | Expect |
|---|---|
| `I want to talk to a real person` | no reply; conversation `mode: "human"`, `needs_human: true` |
| anything while the AI provider is down (`LLM_PROVIDER=openai` with a bad key) | same: no reply, flagged `needs_human` |

- `GET /conversations?needs_human=true` lists only flagged conversations.
- A staff reply, or `PATCH` with any `mode`, clears `needs_human`.

### 10.5 Suggested reply
- `POST /conversations/{id}/suggest-reply` → `200` `{"suggestion": "..."}`. `GET .../messages` is unchanged: nothing is sent or stored.
- Works in any mode. It uses the channel's agent, or the workspace's first agent.
- A workspace with no agents (TOKEN_B) → `400` "Create an AI agent first". Provider down → `502`.

### 10.6 Demo: simulate a customer
- `POST /demo/conversations/{PRIYA_ID}/simulate` `{"content": "Do you open on Sunday?"}` → `201`, the inbound message
  (`author: "customer"`). Priya is in `ai` mode, so the agent's answer follows right away.
  AI answers never trigger the demo's simulated customer replies, so there is no AI ↔ customer loop.
- Same call with TOKEN_B → `403`.
- `POST /demo/reset` restores WhatsApp auto-reply (with the recreated agent) and Priya's `ai` mode.

---

## 11. WhatsApp Cloud API

Connect a real WhatsApp Business number. You need an app in **Meta for Developers** with the WhatsApp product:
- **WhatsApp → API Setup** gives the *Phone number ID*, the *WhatsApp Business Account ID* and a (temporary or system-user) *access token*.
- **App settings → Basic** gives the *App secret*.

Meta must reach your server for webhooks. In development, expose port 8000 (e.g. `ngrok http 8000`) and set
`PUBLIC_BASE_URL=https://<your-ngrok-host>` in `backend/.env`, then restart.

> **No Meta account?** Every call below can be tried against a stand-in. `npm run e2e` starts a mock Graph API on
> port 8765 that accepts the access token `e2e-good-token`. Start the backend with
> `META_GRAPH_URL=http://127.0.0.1:8765` and keep the E2E mock running, or use the automated tests (`tests/test_whatsapp.py`).

### 11.1 Connect
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| Connect | `POST /channels/whatsapp` | `{"phone_number_id": "...", "waba_id": "...", "access_token": "...", "app_secret": "..."}` | `201`, `adapter_type: "whatsapp"`, `status: "connected"`, a `webhook_url` and a `verify_token`. Copy the `id` (WA_ID) |
| Wrong token | same with a bad `access_token` | | `400` "Meta rejected these credentials: ...", nothing saved |
| Webhook values again | `GET /channels/{WA_ID}/webhook` | none | same `webhook_url` and `verify_token` |
| Channel list | `GET /channels` | none | the new channel; no token or secret anywhere in the response |

Then in the Meta App Dashboard: **WhatsApp → Configuration → Webhook → Edit**, paste the webhook URL and verify token,
**Verify and save**, and subscribe to the **messages** field. Meta calls `GET /webhooks/{WA_ID}` to verify:

| Request | Expect |
|---|---|
| `GET /webhooks/{WA_ID}?hub.mode=subscribe&hub.verify_token=<verify_token>&hub.challenge=123` | `200`, body `123` |
| same with a wrong `hub.verify_token` | `403` |

### 11.2 Receive
Send a WhatsApp message to your business number from your phone. It appears in `GET /conversations` with
`platform: "whatsapp"`, `external_id` = your number, and your WhatsApp profile name. Photos, audio, video and documents
arrive with their type and caption (e.g. `[document]` without one).

Posting to `POST /webhooks/{WA_ID}` from Swagger returns `401`: real WhatsApp events must carry Meta's
`X-Hub-Signature-256` signature, computed with the app secret.

### 11.3 Send and delivery status
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| Reply | `POST /conversations/{id}/messages` | `{"content": "Hello from the inbox!"}` | `201`, `status: "sent"`, `external_id` starting with `wamid.`; the message arrives on your phone |
| Media | same | `{"content": "https://.../menu.jpg", "type": "image"}` | sent as an image (`file` is sent as a document) |
| Read it | read the message on your phone | | Meta reports statuses; `GET .../messages` shows `delivered`, then `read` (live `message.updated` events) |
| Meta refuses | e.g. a number outside the test app's allowed list | | `201` with `status: "failed"` |

### 11.4 The 24-hour window and templates
WhatsApp only allows free-form replies within 24 hours of the customer's last message.
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| Window closed | `POST /conversations/{id}/messages` 24 h+ after the customer's last message | `{"content": "Hi"}` | `409` "The 24-hour customer service window is closed. Send an approved template instead." Nothing sent or stored |
| Templates | `GET /channels/{WA_ID}/templates` | none | approved templates with `body` and `parameter_count` (new Meta test apps have `hello_world`) |
| Send one | `POST /conversations/{id}/template` | `{"name": "hello_world", "language": "en_US", "parameters": []}` | `201`, `type: "template"`, content = the template body; works with the window closed |
| Missing parameter | same, fewer `parameters` than `parameter_count` | | `422` |
| Unknown template | `{"name": "nope", ...}` | | `404` |
| Demo channel | `GET /channels/{demo whatsapp id}/templates` | | `400` (simulated channels have no templates) |

### 11.5 Disconnect
`DELETE /channels/{WA_ID}` → `204`. The channel shows `status: "disconnected"` and AI auto-reply off. Its stored
credentials are deleted, the conversations stay readable, new webhook events get `410`, and sending gets `409`.
In the demo workspace, `POST /demo/reset` removes connected numbers entirely.


## 12. Messenger and Instagram (Messenger Platform)

Connect a Facebook Page, plus the Instagram professional account linked to it. You need an app in **Meta for Developers**
with the **Messenger** and **Instagram** products and messaging permissions (`pages_messaging`, `instagram_manage_messages`):
- **Messenger → Settings → Access tokens** gives the *Page ID* and a *Page access token*.
- **App settings → Basic** gives the *App secret*.

As for WhatsApp, Meta must reach your server (`PUBLIC_BASE_URL`, e.g. via ngrok). Without a Meta account, run the E2E mock
(port 8765, Page token `e2e-page-token`, Page ID `112233445566`) with the backend on `META_GRAPH_URL=http://127.0.0.1:8765`,
or the automated tests (`tests/test_meta_channels.py`).

### 12.1 Connect
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| Connect | `POST /channels/meta` | `{"page_id": "...", "page_access_token": "...", "app_secret": "..."}` | `201`, a list: a `messenger` channel named after the Page and, if the Page has a linked Instagram account, an `instagram` channel named `@username`. Each has its own `webhook_url` and `verify_token`. Copy the ids (MS_ID, IG_ID) |
| Page without Instagram | same | | only the `messenger` channel |
| Wrong token | a bad `page_access_token` | | `400` "Meta rejected this Page token: ...", nothing saved |
| Reconnect | the same request again | | the same channel ids and verify tokens, `status: "connected"` (no duplicates) |

In the Meta App Dashboard register **both** webhooks and subscribe each to **messages**:
- **Messenger → Settings → Webhooks** (object *Page*): the Messenger `webhook_url` and `verify_token`; then subscribe the Page.
- **Instagram → Settings → Webhooks**: the Instagram `webhook_url` and `verify_token`.

The handshake works as in §11.1: `GET /webhooks/{MS_ID}?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=123` → `123`, a wrong token → `403`.

### 12.2 Receive
Message the Page on Messenger, or the Instagram account by DM. The conversation appears in `GET /conversations` with
`platform: "messenger"` / `"instagram"`, `external_id` = the Page- or Instagram-scoped id, and the sender's name
looked up from Meta (the id when Meta won't share it). Photos, video, audio and files arrive as `[image]`, `[video]`, ...
Replies you send from Meta Business Suite (echoes), read receipts, and stickers are ignored.
Unsigned posts from Swagger get `401`.

### 12.3 Reply and the 24-hour window
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| Reply | `POST /conversations/{id}/messages` | `{"content": "Hi! How can we help?"}` | `201`, `status: "sent"`, `external_id` = Meta's `mid`; the reply arrives in Messenger / Instagram |
| Media | same | `{"content": "https://.../menu.pdf", "type": "file"}` | sent as an attachment |
| Window closed | reply 24 h+ after the customer's last message | | `409` "The 24-hour customer service window is closed. Wait for the customer to write again." Nothing sent |
| Meta refuses | e.g. a user who blocked the Page | | `201` with `status: "failed"`; the channel stays connected |

### 12.4 Expired or revoked token
Revoke the app's access (Facebook → Settings → Business integrations) or let a short-lived token expire, then reply:
`201` with `status: "failed"`, the channel shows `status: "disconnected"` in `GET /channels`, and a live
`channel.updated` event is sent. Further replies get `409` and inbound events `410`. Repeat **Connect** (§12.1) with a
fresh token: the same channels come back as `connected` with unchanged webhook URLs. The same applies to WhatsApp numbers
whose token expires. `DELETE /channels/{id}` disconnects deliberately, as in §11.5.

## 13. Gmail

Connect a Gmail account with Google sign-in. One-time setup in **Google Cloud Console**:
1. Create a project, enable the **Gmail API**.
2. **OAuth consent screen**: External, add the scopes `gmail.readonly` and `gmail.send`, and add your Gmail address as a
   **test user** (these are restricted scopes; public use needs Google verification).
3. **Credentials → Create OAuth client ID → Web application**, with the authorized redirect URI
   `http://localhost:8000/api/v1/channels/gmail/callback` (or `{PUBLIC_BASE_URL}/api/v1/channels/gmail/callback`).
4. Put the client id and secret in `backend/.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and restart.
   `FRONTEND_URL` (default `http://localhost:5173`) is where the browser returns afterwards.

Unlike Meta, Google does not call your server: the backend polls Gmail every `GMAIL_SYNC_SECONDS` (default 60), so no
public URL is needed. Without a Google account, use the automated tests (`tests/test_gmail.py`) or the E2E mock
(`docs/ui-user-flow.md` §13).

### 13.1 Connect
| Step | Do | Expect |
|---|---|---|
| Sign-in URL | `POST /channels/gmail/authorize` | `200` with `authorize_url` (Google, with `access_type=offline` and a signed `state`) |
| Not configured | same without `GOOGLE_CLIENT_ID` | `400` "Gmail is not configured on this server" |
| Sign in | open `authorize_url` in the browser (same session as the app), choose the account, **Allow** | the browser lands on `http://localhost:5173/inbox?gmail=connected` |
| Check | `GET /channels` | a `gmail` channel named after the address, `adapter_type: "gmail"`, `status: "connected"`; no tokens in the response |
| Cancel | open a new `authorize_url`, click **Cancel** on Google's page | lands on `...?gmail=denied`; no new channel |
| Reconnect | sign in again with the same account | the same channel id, `connected` |

The callback (`GET /channels/gmail/callback`) is called by Google, not from Swagger; with a missing, forged or expired
`state` it redirects to `...?gmail=error`.

### 13.2 Receive
Send an email to the connected address from another account, e.g. subject *Booking for Saturday*. Within a minute
(or right away with `POST /channels/{GMAIL_ID}/sync` → `{"received": 1}`), `GET /conversations` shows a `gmail`
conversation with `subject: "Booking for Saturday"`, `external_id` = the Gmail thread id, and the sender's name and
`email` on the contact. Reply to that email from the customer account: the message joins the same conversation, without
the quoted previous email. A second thread from the same sender is a new conversation with the same contact.
`POST /channels/{id}/sync` on a non-Gmail channel returns `400`.

### 13.3 Reply
`POST /conversations/{id}/messages` with `{"content": "Your table is booked!"}` → `201`, `status: "sent"`, `external_id`
= the Gmail message id. The customer receives it as a reply in the same thread (subject `Re: Booking for Saturday`).
There is no 24-hour window for email.

### 13.4 Revoked access
Remove the app in the Google account (**Security → Third-party apps with account access**). The next sync
(or `POST /channels/{GMAIL_ID}/sync`) sets the channel to `status: "disconnected"` and emits `channel.updated`; a reply
is stored as `failed` and also disconnects it. Sign in again (§13.1) to reconnect the same channel.

## 14. Website chat

A chat button for the business's own website. Visitors' messages become `website` conversations in the inbox and staff
replies reach them live. The demo workspace already has a widget; its demo page is
**http://localhost:8000/api/v1/widget/demo**.

### 14.1 Widget settings (staff, authorized)
| Step | Endpoint | Body | Expect |
|---|---|---|---|
| Create | `POST /channels/website` (as the second business) | `{"allowed_domains": ["cornercafe.example"]}` | `201`, `platform: "website"`. Copy the `id` (WEB_ID) |
| Again | same | | `409`: one widget per workspace |
| Settings | `GET /channels/{WEB_ID}/widget` | none | `widget_key`, `allowed_domains`, `greeting`, `lead_fields: ["name","email","phone"]`, and `embed_snippet` (`<script src=".../widget.js" data-widget-key="..." async>`) |
| Update | `PATCH /channels/{WEB_ID}/widget` | `{"greeting": "Hi! Ask us anything.", "lead_fields": ["phone"]}` | updated settings |
| Bad values | same | `{"lead_fields": ["age"]}` or `{"allowed_domains": ["https://x.com/page"]}` | `422` (domains are bare hostnames) |

### 14.2 Visitor API (public, no Authorize)
These are called by the widget on the customer's site. Swagger sends no `Origin`, so every call here returns `403`
("not allowed"): that is the allowed-domains check. Try them with curl, sending an allowed origin (the demo widget allows
`localhost`; get its key from `GET /channels/{demo website id}/widget`):

```bash
KEY=<widget_key>; O="Origin: http://localhost:3000"
curl -H "$O" http://localhost:8000/api/v1/widget/$KEY/config            # business_name, greeting, lead_fields
TOKEN=$(curl -s -X POST -H "$O" http://localhost:8000/api/v1/widget/$KEY/sessions | python -c "import sys,json;print(json.load(sys.stdin)['visitor_token'])")
curl -X POST -H "$O" -H "X-Visitor-Token: $TOKEN" -H "Content-Type: application/json" \
     -d '{"content": "Hi, are you open today?"}' http://localhost:8000/api/v1/widget/$KEY/messages   # 201
curl -H "$O" -H "X-Visitor-Token: $TOKEN" http://localhost:8000/api/v1/widget/$KEY/messages        # history
curl -X POST -H "$O" -H "X-Visitor-Token: $TOKEN" -H "Content-Type: application/json" \
     -d '{"name": "Priya", "phone": "+91 98765 43210"}' http://localhost:8000/api/v1/widget/$KEY/lead # saved
```

| Check | Expect |
|---|---|
| First message | `GET /conversations` (staff) shows a `website` conversation "Website visitor xxxx" with the message |
| Staff reply | `POST /conversations/{id}/messages`: the visitor's `GET .../messages` includes it (`direction: "outbound"`); an open widget gets it live from `GET /widget/{key}/events?token=...` |
| Lead | the conversation's contact now has name "Priya" and the phone; a malformed `email` gives `422` and changes nothing; before the first message `404` |
| Other origin | `Origin: https://evil.example` → `403`; no `Origin` → `403` |
| Bad token | a missing or made-up `X-Visitor-Token` → `401` |
| Limits | content over 2,000 characters → `422`; the 21st message within a minute from one visitor → `429` |
| Webhook | `POST /webhooks/{WEB_ID}` → `401` (visitors only use the widget API) |

