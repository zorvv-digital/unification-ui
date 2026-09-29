# Design

## Context

- Every other channel reaches the inbox through an adapter, either through a webhook (Meta) or through polling (Gmail). Website chat is the first channel whose "other side" is our own code: a script embedded on the business's site.
- Live updates to staff use `EventService`, which is in-process pub/sub keyed by workspace and streamed as SSE. The widget needs the same thing, keyed by visitor.
- The API runs CORS restricted to `CORS_ORIGINS` (the inbox app). The widget runs on arbitrary customer sites.
- The demo reset deletes every channel that isn't `simulated`.

## Goals / Non-Goals

**Goals:**
- A workspace creates one chat widget and gets an embed snippet. Visitors chat from the site, and staff answer in the inbox, live in both directions. Visitors can leave their name, email and phone.
- Allowed domains, per-visitor rate limits and message length limits protect the public endpoints.
- The demo works with no setup, through a demo page served by the backend.

**Non-Goals:**
- Widget theming beyond the greeting.
- File uploads from visitors.
- Typing indicators.
- Several widgets per workspace.
- Offline email notifications to visitors.

## Decisions

### 1. Channel and adapter
- `platform = adapter_type = "website"`.
- `config` holds `widget_key` (random, public), `allowed_domains` (a list of hostnames, where `example.com` also allows its subdomains), `greeting`, and `lead_fields` (a subset of `name`, `email`, `phone`).
- `WebsiteAdapter.send` returns a local id. Delivery to the visitor happens through the visitor stream (see 3), which also covers AI replies.
- `parse_webhook` always raises `WebhookAuthError`, because visitors use the widget endpoints and never `/webhooks`.
- **Staff endpoints (authenticated):**
  - `POST /channels/website` creates the workspace's widget, or returns 409 if one exists;
  - `GET /channels/{id}/widget` returns the settings plus `embed_snippet`;
  - `PATCH /channels/{id}/widget` updates the domains, greeting and lead fields.
- **Embed snippet:** `<script src="{PUBLIC_BASE_URL}/api/v1/widget.js" data-widget-key="…" async></script>`

### 2. Public widget API (`/api/v1/widget/{key}/…`, no user token)
| Endpoint | Behavior |
|---|---|
| `GET /config` | Returns the business name, greeting and lead fields. |
| `POST /sessions` | Returns `{visitor_token}`: a JWT with `purpose: "visitor"`, the `channel_id` and a random `visitor_id`, and no expiry so returning visitors keep their history. Nothing is stored until the first message. |
| `GET /messages` | Returns the visitor's history (`VisitorMessage`: `id`, `direction`, `type`, `content`, `timestamp`). It is empty before the first message. |
| `POST /messages` `{content}` | `InboxService.receive_message` with `customer_id = visitor_id` and the name "Website visitor abcd". Content of 1–2,000 characters (otherwise 422). The 21st message within 60 seconds returns 429 and stores nothing. AI-mode conversations are answered, as with webhooks. |
| `POST /lead` `{name?, email?, phone?}` | Updates the visitor's contact (a regex check on the email gives 422 and leaves the contact unchanged) and publishes `conversation.updated`, so the contact panel updates live. Before the first message it returns 404. |
| `GET /events?token=` | SSE of `message.created` for this visitor. |

- The visitor token goes in the `X-Visitor-Token` header, or in `token` for SSE. A token for another channel returns 401.
- **Origin check:**
  - Every widget endpoint requires the `Origin` host to be one of the channel's `allowed_domains`, otherwise it returns 403. A missing `Origin` also returns 403.
  - The demo page (4) is same-origin, so browsers send `Origin` on its POST and SSE requests. For same-origin GETs the backend falls back to `Referer`.
- **Rate limit:** an in-memory sliding window per visitor. *Ceiling:* it is per process, like SSE. Move it to Redis when there are several workers.
- **CORS:** a small `PathCORS` middleware applies a permissive `CORSMiddleware` (any origin, no credentials) to `/api/v1/widget*`, and the existing restricted one everywhere else. This is safe because the widget endpoints enforce allowed domains themselves and use no cookies.

### 3. Pushing replies to the visitor
`InboxService._publish` also publishes `message.created` to the visitor stream key `("visitor", visitor_id)` for `website` conversations. That covers staff replies, AI replies, and the visitor's own messages when several tabs are open. `EventService` keys become any hashable, not only workspace UUIDs.

### 4. Widget script and demo page
- `app/widget/widget.js` is plain JavaScript with no build step, served at `GET /api/v1/widget.js`. It:
  - shows a floating button that opens a panel with the greeting, the messages and an input;
  - keeps the visitor token in `localStorage` for each widget key, and loads the history;
  - opens the event stream;
  - after the first message, shows a small "Leave your details" form with the configured lead fields.
- `GET /api/v1/widget/demo` serves a small "Glow Salon & Spa" page embedding the demo workspace's widget. The key is looked up at request time.
- **Demo:** seeding creates the demo's `website` channel with the allowed domains `localhost` and `127.0.0.1`, lead fields name and phone, and one seeded website conversation. The reset recreates it, and the demo page picks up the new key.

### 5. Inbox app
- `Platform` adds `website`:
  - the conversation list and the workspace show a Globe icon;
  - the filter bar has a **Website** chip.
- The sidebar's **Website chat** item opens a modal in the inbox's own theme:
  - **Create chat widget** when there is none;
  - otherwise the embed snippet (copyable), allowed domains (comma separated), greeting, and lead-field checkboxes, with **Save**;
  - in the demo, an **Open demo page** link.

## Risks / Trade-offs

- **`Origin` can be forged by non-browser clients.** The domain check stops other sites from embedding the widget, not scripted abuse. The rate limit and length limit cover that.
- **A visitor token with no expiry works like a cookie.** If someone copies it, they can read that visitor's chat. That is acceptable for anonymous website chat.
