# Design

## Context

- The demo workspace has simulated `whatsapp`, `instagram`, `messenger` and `gmail` channels. Inbound messages enter
  through `InboxService.receive_message(db, channel, InboundMessage)`, which creates the contact and conversation keyed
  by `(channel, external_id)`, publishes staff events, and is what AI auto-reply runs after.
- Website chat already has a customer side: `WebsiteService` issues a visitor JWT, keeps an in-memory per-visitor rate
  limit, and `InboxService._publish` pushes replies to `EventService` key `("visitor", external_id)`. That key is
  streamed as SSE by the public `/widget/{key}/events` endpoint.
- `api/conversations.send_message` calls `DemoService.schedule_reply` after every staff send in the demo workspace.
- In `saas inbox`, `MessagingProvider` wraps every route and redirects to `/login` without a session. The app uses
  Tailwind and `lucide-react`. There is no router-level auth guard.
- CORS defaults to `*`. There are no migrations, so a new column would force deleting `unification.db`.

## Goals / Non-Goals

**Goals:**
- A customer-side app that feels like the real platform: live in both directions, read ticks, and contacts that look
  real in the inbox.
- Reuse the inbound path, the event bus, and the visitor-API patterns. No new infrastructure.

**Non-Goals:**
- Pixel-perfect copies of the platforms' apps, calls, media or attachments, emoji pickers, and typing indicators.
- Customer app for real (non-demo) workspaces. Real customers use the real apps.
- QR codes or a LAN-address helper. The docs explain how to open it on a phone.
- Retiring `demo-unified-inbox`. That is a separate follow-up.

## Decisions

### 1. Identity: one session, one conversation per platform, marked by external id
- `POST /customer-app/sessions {name}` returns a JWT (`HS256`, `SECRET_KEY`) with claims `{purpose: "customer", sid, ws,
  name}`. `sid` is a random hex id, and `ws` is the demo workspace id. A token whose `ws` is not the current demo
  workspace, for example after the DB was recreated, gives 401, and the app then starts a new session.
- The conversation `external_id` is `app:<sid>` on every platform. The `app:` prefix is how the rest of the system
  recognizes customer-app conversations: no canned reply (decision 4), and push to the app (decision 3).
  - *Alternative:* an `origin` column on `Conversation`. It was rejected because it is a schema change with no
    migrations, for a flag the external id already carries.
- Realistic contact fields are derived from `sid` and the name, passed via `InboundMessage`:
  - WhatsApp: a phone number `+91 9` plus 9 digits derived from `sid`.
  - Instagram: a username slug of the name plus 4 characters of `sid`.
  - Gmail: `<slug>.<sid4>@example.com` as `email`.
  - Messenger: the name only.
- Gmail threads: `thread_id = app:<sid>`, so there is one thread per session. The subject is required when the session
  has no Gmail conversation yet, and ignored afterwards.

### 2. Service and router
- `CustomerAppService(BaseService)` in `app/services/customer_app_service.py` has:
  - `demo_workspace(db)`, which returns 404 when `DEMO_MODE` is off or no demo workspace exists.
  - `new_token` and `session_of(token)`, which return 401 on failure.
  - `history(db, sid)`, which returns messages across the four platforms with their `platform`.
  - `receive(db, sid, name, platform, content, subject)`, which applies the length and rate limits, finds the demo
    workspace's simulated channel for the platform, and calls `InboxService.receive_message`.
- The rate limit copies `WebsiteService`'s in-memory deque: 20 messages per minute per `sid`.
- `app/api/customer_app.py` holds the thin, public router under `/api/v1/customer-app`:
  - `GET /config` returns `business_name` and `platforms`. It also works without a token, so the app can show the
    business before a session exists.
  - `POST /sessions`.
  - `GET /messages` and `POST /messages` take the token in the `X-Customer-Token` header. The POST body is
    `{platform, content, subject?}`, and after a send the router adds `AiReplyService.answer` as a background task,
    as the widget does.
  - `GET /events?token=` streams SSE.
- Schemas in `app/models/schemas.py`: `CustomerSessionCreate`, `CustomerSession`, `CustomerAppConfig`,
  `CustomerMessageCreate` and `CustomerMessage`. `CustomerMessage` has `id`, `platform`, `direction`, `content`,
  `status` and `timestamp`. The subject stays on the conversation; the Gmail screen shows it after sending.

### 3. Live push to the app
- `InboxService._publish` adds a branch: if `external_id` starts with `app:`, publish `message.created` to
  `("customer", sid)` with a `CustomerMessage`. This covers staff sends, AI replies, and echoes of the customer's own
  messages, so a second device with the same session also updates.
- `InboxService.mark_read` publishes `conversation.read {platform}` to `("customer", sid)` for `app:` conversations.
  The app then marks its outbound bubbles as read (blue ticks on the WhatsApp screen, "Seen" on the others).
- *Alternative:* polling from the app. It was rejected because SSE already exists and polling would lag the "live"
  feel this change exists for.

### 4. No canned replies for customer-app conversations
`DemoService.schedule_reply` is the only caller path for canned replies. Its `_reply_later` already loads the
conversation, so it returns early when `DemoService.is_customer_app(conversation.external_id)` is true. That puts the
rule in one place with no extra query in the router. `is_customer_app` is a one-line helper that owns the `app:`
prefix, and `InboxService._publish` uses it too.

### 5. Frontend
- `App.tsx` renders `/phone` outside `MessagingProvider`, so there is no login redirect and no staff SSE.
- `src/pages/CustomerApp.tsx` renders a phone frame at a max width of about 420px, and full screen on a real phone.
  It has:
  - A name step.
  - An app switcher: WhatsApp, Instagram, Messenger, Gmail, plus Website, which links to `${API}/widget/demo`.
  - One chat view per platform, sharing message state and differing only by a small skin object: header color,
    wallpaper, bubble colors, tick style, and the Gmail subject field.
  - Unread dots on the switcher for replies on other platforms.
- The session token lives in `localStorage` (wrapped in try/catch). A 401 clears it and returns to the name step.
- `src/services/customerApi.ts` wraps fetch and `EventSource` against `VITE_API_URL`. Without it, the page explains
  that it needs the backend.
- The staff sidebar gets a demo-only **Customer app** item near **Reset demo data**. It opens `/phone` with
  `target="_blank"`. It keeps the existing theme.

## Risks / Trade-offs

- [Public endpoint spam on a shared demo server] → The API is demo-only, with length and rate limits, and reset wipes
  everything. It is the same exposure as the demo login and the widget, which are already public.
- [In-memory SSE and rate limits need a single process] → This is already a documented constraint of `EventService`.
- [The `app:` prefix is a convention, not a constraint] → One helper owns it, and tests cover both behaviors that
  depend on it.
- [Opening on a real phone needs the LAN address] → The docs cover `npm run dev -- --host` and setting
  `VITE_API_URL=http://<LAN-IP>:8000/api/v1`. CORS is already `*` by default.

## Migration Plan

This is additive only: new endpoints, a new route, and no schema change. To roll back, revert the commit.
