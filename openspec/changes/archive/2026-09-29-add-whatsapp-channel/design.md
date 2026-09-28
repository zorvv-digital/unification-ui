# Design

## Context

- Channel adapters live in `ADAPTERS` (`channel_service.py`). The contract is `send(channel, conversation, message) -> external_id` and `parse_webhook(channel, headers, body) -> list[InboundMessage]`.
- There is only a `simulated` adapter. Channels are seeded (demo) or created in tests, and there is no channel creation API yet.
- `POST /webhooks/{channel_id}` is public and routes each event to the channel's adapter.
- Zeryva-backend has only WhatsApp settings (token, phone number id, API version `v20.0`) and no adapter code to port. This change therefore follows Meta's Cloud API directly.
- The `saas inbox` WhatsApp page already shows read ticks from `message.status`, and it has an unused ⋮ button in the chat list header.

## Goals / Non-Goals

**Goals:**
- A business connects its own WhatsApp number and chats with customers from the inbox, including AI replies (the adapter plugs into `add-ai-replies` unchanged).
- Everything is testable without Meta, using a mocked Graph API in unit tests and a local mock Graph server in the E2E run.

**Non-Goals:**
- Embedded Signup (Meta's OAuth onboarding).
- Downloading inbound media files. Inbound media is stored as its type plus caption.
- Template creation. Templates are created in Meta's WhatsApp Manager.

## Decisions

### 1. Adapter contract grows (small, backwards compatible)
- `parse_webhook(channel, headers, raw_body: bytes)` receives the **raw bytes**, because an HMAC must be computed over the exact body. The simulated adapter parses JSON itself. The route still declares a JSON body so Swagger keeps its example.
- `parse_webhook` may now return `StatusUpdate(external_id, status)` items besides `InboundMessage`s.
- Optional adapter members, used only when present:
  - `verify_subscription(channel, mode, token, challenge)` answers the `GET` handshake;
  - `session_window: timedelta` sets the 24-hour rule;
  - `list_templates(channel)` and `send_template(channel, conversation, template, parameters)`.

  These are duck-typed with `getattr` rather than a base-class hierarchy, which stays simple while there are two adapters. Messenger and Instagram (`add-meta-channels`) reuse the same hooks.
- The contract types (`ChannelError`, `WebhookAuthError`, `InboundMessage`, `StatusUpdate`) move to `app/providers/base.py` so that `app/providers/whatsapp.py` can use them without a circular import. `channel_service` re-exports them.

### 2. Graph API access
`app/providers/whatsapp.py` holds `WhatsAppAdapter` and a small `_graph()` helper: one `httpx.AsyncClient` per call, with a `META_GRAPH_URL` setting (default `https://graph.facebook.com/v20.0`). A module-level `_transport` lets tests use `httpx.MockTransport`, as in `llm.py`. Any HTTP or Meta error raises `ChannelError` with Meta's message.

| Purpose | Call |
|---|---|
| Verify credentials | `GET /{phone_number_id}?fields=display_phone_number,verified_name` |
| Send | `POST /{phone_number_id}/messages` (`text`, `image`/`video`/`audio` `{link}`, `document {link}` for `file`, `template`) |
| Templates | `GET /{waba_id}/message_templates?status=APPROVED` → name, language, body text, and the number of `{{n}}` placeholders |

### 3. Secrets
- `app/services/crypto.py` provides `encrypt_secret` and `decrypt_secret` using Fernet (`cryptography`). The key is derived from `SECRET_KEY` with SHA-256.
- `config` stores `access_token` and `app_secret` encrypted, next to the plain `phone_number_id`, `waba_id`, `display_phone_number`, and a random `verify_token`.
- `config` is never returned by the API. The connect response shows the webhook URL and verify token once, and `GET /channels/{id}/webhook` shows them again.
- *Ceiling:* rotating `SECRET_KEY` makes stored secrets unreadable, so affected channels must reconnect. A dedicated `ENCRYPTION_KEY` and key rotation can come with deployment work.

### 4. Endpoints
| Endpoint | Behavior |
|---|---|
| `POST /channels/whatsapp` | Verify credentials with Meta (400 and nothing saved on failure). Save the channel with `adapter_type='whatsapp'` and return the channel plus `webhook_url` and `verify_token`. `webhook_url` uses the `PUBLIC_BASE_URL` setting. |
| `GET /channels/{id}/webhook` | Return `webhook_url` and `verify_token` again. |
| `DELETE /channels/{id}` | Disconnect: `config` is cleared, `status='disconnected'`, AI auto-reply off. Conversations stay. Works for any channel. |
| `GET /webhooks/{id}` | Meta handshake: answer `hub.challenge` as plain text when `hub.verify_token` matches, otherwise 403. |
| `POST /webhooks/{id}` | A disconnected channel returns 410. A bad or missing `X-Hub-Signature-256` returns 401. Messages go to the inbox and statuses update messages. |
| `GET /channels/{id}/templates` | List approved templates. A channel without templates returns 400. |
| `POST /conversations/{id}/template` | `{name, language, parameters}`. An unknown template returns 404. Fewer parameters than placeholders returns 422. The template is sent even outside the window, and stored with `type: 'template'` and the rendered body as content. |

### 5. The 24-hour window lives in `InboxService.send_message`
- If the adapter has a `session_window` and the conversation's latest inbound message is older than that window (or there is none), the call returns **409** *"The 24-hour WhatsApp window is closed. Send an approved template instead."* Nothing is stored or sent.
- The check runs before storing, so it applies equally to staff messages and AI replies. AI replies are always inside the window in practice.
- Sending on a disconnected channel returns 409 as well.

### 6. Delivery statuses
- `InboxService.apply_status(channel, update)` finds the message by `external_id` within the channel's conversations.
- Statuses only move forward (`sent < delivered < read`), except `failed`, which always applies. This handles Meta delivering statuses out of order.
- Each change publishes `message.updated`. The frontend reducer replaces the message, and the WhatsApp page's ticks turn blue on `read`.

### 7. Inbound mapping
| Meta message type | Stored as | Content |
|---|---|---|
| `text` | `text` | the text |
| `image`, `video`, `audio` | same type | caption, or `[image]` / `[video]` / `[audio]` |
| `document` | `file` | caption, or `[document]` |
| other | skipped | none |

- The customer id is `from` (the wa_id).
- The name comes from `contacts[].profile.name`.
- `message_id` is Meta's `wamid`, so existing dedup covers retries.

### 8. Frontend (WhatsApp page, existing WhatsApp-style theme)
- **⋮ menu → WhatsApp numbers** opens a modal:
  - It lists WhatsApp channels with their status, and real ones have **Disconnect**.
  - The form asks for Phone number ID, WhatsApp Business Account ID, Access token and App secret → **Connect**.
  - On success it shows the webhook URL and verify token, with copy fields.
- **Send errors** (such as the 409) appear in a bar above the composer.
- **Templates:** a template button appears in the composer for conversations on a real WhatsApp channel. It opens a picker where you choose a template and fill its parameters, then **Send template**.
- **Live status:** `message.updated` events update ticks live.

### 9. E2E
`e2e/inbox-flow.mjs` starts a tiny mock Graph server on `:8765`, and the backend runs with `META_GRAPH_URL=http://127.0.0.1:8765` for E2E. The steps cover:
- a bad token, then a successful connect;
- the handshake;
- a signed inbound message;
- a reply that reaches the mock, followed by a `read` status;
- sending a template;
- disconnecting, after which inbound events are rejected.

## Risks / Trade-offs

- **Raw-body HMAC** depends on reading `request.body()` after FastAPI has parsed the JSON. Starlette caches the body, and tests cover this.
- **The template list is fetched from Meta on every send** to validate parameters. This is simple and always current; add caching if Meta rate limits become an issue.
- **Multiple WhatsApp channels per workspace are allowed.** For example, the demo keeps its simulated one next to a real one.
