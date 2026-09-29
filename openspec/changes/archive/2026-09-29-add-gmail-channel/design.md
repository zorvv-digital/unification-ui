# Design

## Context

- Channel adapters (`app/providers/*`, registered in `ADAPTERS`) have so far been webhook-driven. Gmail has no simple per-account webhook; Google's push goes through Cloud Pub/Sub. Gmail is therefore the first **polled** channel.
- `add-meta-channels` added `TokenError`. On a send, it disconnects the channel and publishes `channel.updated`, and connecting again upserts the channel.
- Conversations are keyed by `(channel_id, external_id)`, where `external_id` is the customer id. A new contact is created for every new conversation.
- The frontend Gmail view is a separate mock (`InboxContext`, `types/inbox.ts`, `data/inboxMockData.ts`) that `UnifiedInbox` merges into the list by hand, grouping by subject.

## Goals / Non-Goals

**Goals:**
- A business connects Gmail with Google sign-in (OAuth), and new customer emails show up in the inbox within 2 minutes, one conversation per thread, with the subject.
- Replies go out as emails in the same thread.
- A revoked grant disconnects the channel.
- The demo gets a simulated Gmail channel with seeded emails, and the frontend mock is removed.
- Everything is testable without Google: an httpx mock in unit tests, and the E2E mock server for OAuth, token and Gmail endpoints.

**Non-Goals:**
- Pub/Sub push.
- HTML rendering and attachments. Only the `text/plain` body is kept, with the HTML stripped when there is no plain part.
- Importing mail that arrived before the connection.
- Sending new emails that don't reply to an existing thread.

## Decisions

### 1. OAuth with Google (authorization code flow)
- The settings are:
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`;
  - `GOOGLE_AUTH_URL`, `GOOGLE_TOKEN_URL` and `GMAIL_API_URL`, which can be overridden for the E2E mock;
  - `FRONTEND_URL`.
- `POST /channels/gmail/authorize` (authenticated) returns `{authorize_url}`. If Google isn't configured it returns 400.
  - The URL requests the scopes `gmail.readonly` and `gmail.send`, with `access_type=offline` and `prompt=consent` so a refresh token is always issued.
  - `redirect_uri` is `{PUBLIC_BASE_URL}/api/v1/channels/gmail/callback`.
  - `state` is a JWT signed with `SECRET_KEY` that contains `workspace_id` and `purpose: "gmail"` and expires after 10 minutes. The callback is a browser redirect with no Bearer header, so the state is what ties it to the workspace.
- `GET /channels/gmail/callback` is public. It always redirects the browser to `{FRONTEND_URL}/inbox?gmail=<result>`:
  - `denied`: Google returned `error`, for example because the user cancelled. No channel is created.
  - `error`: the state is bad or expired, or the code exchange or profile call failed.
  - `connected`: the code was exchanged for tokens, the address was read from `users/me/profile`, and the `gmail` channel was upserted by address (reconnecting reuses it). The address is used as the channel name.
- The channel's `config` holds `email`, the encrypted `refresh_token` and `access_token`, `expires_at`, and `last_sync`.

### 2. Adapter (`app/providers/gmail.py`)
- A `google()` HTTP helper with a swappable `_transport`, as in `whatsapp.graph()`.
  - A 401 response or `invalid_grant` raises `TokenError`.
  - Any other error raises `ChannelError`.
- `access_token(channel)` returns the cached token, or refreshes it when it expires within 60 seconds. The new token is stored in `config`, which is reassigned so SQLAlchemy sees the change.
- `fetch_new(channel) -> list[InboundMessage]` (sync):
  - It lists `users/me/messages?q=in:inbox -from:me after:{last_sync - 300}`. The 5-minute overlap is safe because duplicates are dropped by Gmail message id.
  - It then reads each message in `format=full`.
- `send(channel, conversation, message)`:
  - It reads the thread's metadata to get the latest `Message-ID`.
  - It builds a MIME reply with `email.message.EmailMessage`:
    - `From` is the connected address and `To` is the contact's email;
    - `Subject` is `Re: <subject>`;
    - `In-Reply-To` and `References` point at that latest `Message-ID`.
  - It posts to `users/me/messages/send` with `{raw, threadId}` and returns the Gmail id.
- No `session_window`: email has no 24-hour window.

### 3. Threads, subjects, and contacts
- `InboundMessage` gains the optional fields `thread_id`, `subject`, and `email`.
- `InboxService.receive_message` handles them as follows:
  - **Conversation key:** it uses `thread_id` when present, otherwise `customer_id` as before. A Gmail conversation's `external_id` is therefore the thread id.
  - **Subject:** a new `Conversation.subject` column (nullable) is set on creation and returned in `ConversationResponse`.
  - **Contact:** when `email` is set, an existing workspace contact with that email is reused, so one customer has one contact across threads. Otherwise a new contact is created with `email` filled in.
- **Mapping one Gmail message:**
  - `customer_id` and `email` are the sender's address, and the name is the display name from `From`;
  - the content is the plain-text body with quoted lines (`>`) and the "On … wrote:" tail removed. If that leaves nothing, the full body is kept;
  - `message_id` is the Gmail id.

### 4. Sync loop
- `SyncService` (`app/services/sync_service.py`) has two methods.
- `sync_channel(db, channel)` does the work for one channel:
  - It fetches new messages and passes each one to `receive_message`.
  - It answers AI-mode conversations with `AiReplyService.answer`.
  - It sets `last_sync` to the start time of the run.
  - On `TokenError` it calls `ChannelService.mark_disconnected`, the helper now shared with the send path: status `disconnected` plus a `channel.updated` event.
  - A plain `ChannelError` is logged, and the next run tries again.
- `run_forever()` syncs every connected Gmail channel every `GMAIL_SYNC_SECONDS` (default 60, which meets the 2-minute requirement). The app lifespan starts it and cancels it on shutdown. `0` disables it, which the tests use.
- `POST /channels/{id}/sync` (authenticated) runs one sync now and returns `{received}`. It is used by Swagger, the tests, and the E2E. Channels without sync return 400.
- *Ceiling:* the in-process loop runs once per server process, just like the SSE pub/sub. Move it to a worker or Pub/Sub push when there are several workers.

### 5. Demo
- `DEMO_PLATFORMS` adds `gmail`. The seed gets three Gmail conversations:
  - each has `subject` and a contact `email`;
  - its `customer_id` is a demo thread id;
  - the content is carried over from the old frontend mock.
- Reset creates any missing simulated channel, so older demo databases also gain Demo Gmail.
- *Migration:* `Conversation.subject` is a new column, so delete `backend/unification.db*` once (see the docs).

### 6. Frontend
- **Mock removed:** `InboxContext`, `types/inbox.ts` and `data/inboxMockData.ts` are deleted, along with the Gmail branch in `UnifiedInbox`. Gmail conversations now come from `MessagingContext` like every other channel.
  - Mock mode (no `VITE_API_URL`) gets the same sample emails in `data/messaging/mockData.ts`.
- **Subject:** `Conversation.subject` is shown in the conversation list and in the workspace header for Gmail.
- **Connect:** the sidebar's **Gmail** item opens a `ChannelsModal` with no form fields and a **Connect with Google** button. The button redirects the browser to `authorize_url`. The modal lists Gmail channels with Disconnect.
  - `ChannelsModal` gains `connectLabel` so it can render without fields.
- **Return from Google:** back on `/inbox?gmail=connected|denied|error`, a dismissible banner shows the result and the query is cleared.

### 7. E2E
- The mock server on `:8765` also serves:
  - `/o/oauth2/auth`, which redirects straight back to the callback with a code, or with `error=access_denied` when the login hint is `deny`;
  - `/token` (code and refresh grants; set `revoked` to make the refresh fail);
  - `/gmail/v1/...` (profile, message list and get, thread metadata, send).
- The backend runs with the mock URLs, a test client id and secret, and `GMAIL_SYNC_SECONDS=2`, so the E2E uses the real poll loop.
- The flow covers:
  - connecting through the redirect, after which the banner appears and Gmail is listed;
  - a mock inbox email, which the loop picks up, after which the conversation shows up with its subject;
  - a reply, which reaches the mock with `threadId` and `In-Reply-To`;
  - a revoked grant, after which the channel shows as disconnected.

## Risks / Trade-offs

- **Polling costs quota:** there is one list call per channel per minute, plus one get call per new message. That is fine at this scale.
- **Plain-text extraction is heuristic.** HTML-only emails are reduced to text by stripping tags.
- **Restricted Gmail scopes need Google verification before public use.** Until then, a test project works with listed test users.
