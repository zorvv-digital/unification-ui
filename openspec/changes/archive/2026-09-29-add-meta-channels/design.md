# Design

## Context

- `add-whatsapp-channel` set up the pieces this change reuses:
  - the adapter contract in `app/providers/base.py`, including the optional `verify_subscription` and `session_window`;
  - `graph()` in `app/providers/whatsapp.py`, a Graph API helper with a swappable `_transport`;
  - Fernet secrets in `app/services/crypto.py`;
  - `webhook_info` and `disconnect` in `ChannelService`;
  - the 24-hour window check in `InboxService._check_can_send`.
- Messenger and Instagram direct messages both run on the Messenger Platform:
  - The same Page access token sends replies with `POST /{page_id}/messages`.
  - Webhooks carry `entry[].messaging[]` events signed with the app secret (`X-Hub-Signature-256`).
  - The only differences are `object` (`page` or `instagram`), the account id that owns the conversation, and the profile fields for a sender's name.
- The `saas inbox` Messenger and Instagram pages already render conversations from `getConversations('messenger' | 'instagram')`. Their header menu buttons (⋯) do nothing.

## Goals / Non-Goals

**Goals:**
- A business connects its Facebook Page, plus the linked Instagram professional account, and chats with Messenger and Instagram DM customers from the inbox, including AI replies.
- A revoked or expired Page token is noticed on send: the channel becomes `disconnected` and the workspace is told.
- Everything is testable without Meta, using an httpx mock in unit tests and the E2E mock Graph server.

**Non-Goals:**
- Facebook Login / OAuth onboarding. As with WhatsApp's Embedded Signup, the user pastes a Page access token for now, and the spec's "through Meta login" is narrowed to that. OAuth can come with a real Meta app.
- Downloading inbound attachments. They are stored as their type and a `[image]` placeholder, as WhatsApp does.
- Delivery and read receipts, comments, story mentions, and message tags.

## Decisions

### 1. One adapter for both platforms
- `app/providers/messenger.py` has `MessengerAdapter`, registered in `ADAPTERS` as both `messenger` and `instagram`.
- It branches on `channel.platform` where the two differ. There is no subclass per platform.
- It reuses `graph()` from `whatsapp.py`, so the tests' `whatsapp._transport` mock covers both.
- `session_window = 24h`, which means the existing window check applies unchanged. The 409 text only suggests templates when the adapter has them.

### 2. Connect
`POST /channels/meta` with `{page_id, page_access_token, app_secret}`:
1. Call `GET /{page_id}?fields=name,instagram_business_account{id,username}` with the Page token. If Meta rejects it, return 400 and save nothing.
2. Upsert a `messenger` channel named after the Page. If the Page has a linked `instagram_business_account`, also upsert an `instagram` channel named `@username`.
3. Both channels' `config` holds `page_id`, the encrypted `access_token` and `app_secret`, and their own `verify_token`. The Instagram channel also holds `ig_id`.
4. **Upsert:** an existing channel in the workspace with the same `page_id` (for Messenger) or `ig_id` (for Instagram) gets the new token and returns to `connected`. It keeps its id, and therefore its webhook URL, and its verify token. Reconnecting after a token expires therefore doesn't require re-registering webhooks in Meta.
5. The response is a list of channels, each with its `webhook_url` and `verify_token`:
   - The Messenger URL is registered under the Meta app's **Messenger** webhooks (object `page`).
   - The Instagram URL is registered under **Instagram** webhooks.
   - Both subscribe to `messages`.

### 3. Inbound mapping
- The signature check is the same as WhatsApp's, using HMAC-SHA256 of the raw body with the app secret.
- For each `entry[].messaging[]` item with a `message`:
  - **Skipped:** echoes (`message.is_echo`), anything sent by our own account, and items without a message, such as reads, deliveries and postbacks.
  - **Customer id:** `sender.id`, which is the Page-scoped id (PSID) for Messenger and the Instagram-scoped id (IGSID) for Instagram.
  - **Message id:** `message.mid`, so the existing duplicate check handles Meta's retries.
  - **Text:** a message with `text` becomes a `text` message.
  - **Attachments:** otherwise the first attachment's type `image`, `video`, `audio` or `file` is kept as the type, with `[image]`, `[video]` and so on as the content. Other attachment types are skipped.

### 4. Customer names
- Messenger webhooks carry no names, so the contract gains an optional async `lookup_name(channel, customer_id)`.
- `InboxService.receive_message` calls it only when it creates a new contact without a name.
- The lookup is `GET /{id}?fields=name` for both platforms. Any failure falls back to the id.

### 5. Token health
- `graph()` raises `TokenError(ChannelError)` when Meta answers with error code 190 (invalid or expired OAuth token). This also covers WhatsApp.
- When `_store_outbound` gets a `TokenError`:
  - the message is stored as `failed`;
  - the channel's `status` becomes `disconnected`, and its config is kept for the upsert;
  - `channel.updated` is published with the `ChannelResponse`.
- A disconnected channel already rejects sends (409) and inbound events (410) until it reconnects.

### 6. Frontend (keeps each page's existing look)
- `WhatsAppNumbersModal` becomes a generic `ChannelsModal`, configured with a title, icon, platforms, form fields, connect call, and accent color.
  - WhatsApp keeps its current green look and labels.
  - The Messenger ⋯ button and the Instagram ⋯ button open it as **Facebook Page & Instagram**, in Messenger blue, with the fields Page ID, Page access token and App secret.
  - After connecting, it shows the webhook URL and verify token for each new channel.
  - Rows show the platform and status (for example "Instagram · Disconnected"), and the form is titled "Connect or reconnect a Facebook Page".
- **Error bar:** the Messenger and Instagram pages get the same send error bar as WhatsApp. A send that comes back `failed` reloads the channels. If the channel turned `disconnected`, the bar says the Page needs reconnecting.
- **Simulate button:** "Simulate" stays only for simulated channels.
- **Live updates:** `channel.updated` is not consumed live. The pages reload channels on a failed send, which covers the user-facing case.

### 7. E2E
The mock Graph server in `e2e/inbox-flow.mjs` gains:
- the Page lookup, including a linked Instagram account;
- the profile lookup;
- `/{page_id}/messages`, which returns error 190 for a "revoked" token.

The flow covers:
- connecting a Page (Messenger and Instagram channels appear);
- a signed Instagram DM that shows up with the customer's name;
- a reply that reaches the mock;
- revoking the token, after which the send fails and the channel shows as disconnected;
- reconnecting, which reuses the same webhook URL.

## Risks / Trade-offs

- **Upsert matching by `page_id` or `ig_id` scans the workspace's channels in Python** rather than querying the JSON column. A workspace has only a handful of channels.
- **Only the first attachment of a multi-attachment message is kept.** This is enough while media is only a placeholder. Revisit when media downloading lands.
- **A `failed` send on a real network error doesn't disconnect the channel.** Only Meta's code 190 does.
