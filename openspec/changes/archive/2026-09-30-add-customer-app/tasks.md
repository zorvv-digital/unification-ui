# Tasks

## 1. Customer API (backend)

- [x] 1.1 Write `tests/test_customer_app.py` first, then add the schemas, `CustomerAppService` and the
  `/customer-app` router until it passes. The tests cover:
  - `GET /config` returns the business name and platforms.
  - A session is issued for a valid name, and a blank or 61-character name gives 422.
  - A missing, foreign or other-workspace token gives 401.
  - A WhatsApp message creates a conversation with `external_id` `app:<sid>`, a phone number on the contact, and an
    unread count of 1. Instagram gets a username and Gmail gets an email.
  - The first Gmail message without a subject gives 422 and stores nothing.
  - History returns messages with their `platform`.
  - More than 2,000 characters gives 422, and the 21st message in a minute gives 429.
  - With demo mode off, every endpoint gives 404.
- [x] 1.2 Test and then implement live push. The customer stream `("customer", sid)` receives `message.created` for a
  staff reply, an AI reply, and the customer's own message. It receives `conversation.read` when staff mark the
  conversation read. Replies to other customers are not pushed. Verify with the `EventService.publish` monkeypatch
  pattern from `test_crm.py`.
- [x] 1.3 Test and then implement: a staff reply in an `app:` conversation schedules no canned reply, while seeded demo
  conversations still get one. Also verify that a reset removes customer-app conversations and that the same token
  works afterwards with empty history. Run `uv run pytest` and confirm all tests pass.
- [x] 1.4 Add a "Customer app" section to `docs/api-testing-swagger.md`: session, send per platform, history, SSE via
  curl, and the error cases.

## 2. Customer app (frontend)

- [x] 2.1 Add `src/services/customerApi.ts` for config, session, history, send, and `EventSource` with the token in the
  query string. Keep the token in `localStorage` inside try/catch, and clear it on 401. Add a vitest for the
  401-clears-session behavior.
- [x] 2.2 Add `src/pages/CustomerApp.tsx` and render `/phone` outside `MessagingProvider` in `App.tsx`. It has:
  - A name step.
  - An app switcher (WhatsApp, Instagram, Messenger, Gmail, and Website, which links to the widget demo page).
  - A chat view per platform with its skin: WhatsApp green header, wallpaper and ticks; Instagram DM; Messenger blue;
    and a Gmail thread with a subject on the first email.
  - Live replies, read state, and unread dots on the switcher.
  - A notice when `VITE_API_URL` is missing.

  Verify by sending in each skin and confirming that `npm run build` and `npm run lint` show no new errors.
- [x] 2.3 Add a demo-only **Customer app** item to the inbox sidebar that opens `/phone` in a new tab, keeping the
  theme. Verify it is hidden for a registered non-demo workspace.
- [x] 2.4 Add a "Customer app" section to `docs/ui-user-flow.md`, covering the two-window demo and opening the app on
  a real phone (`npm run dev -- --host`, and `VITE_API_URL` pointing at the LAN IP).

## 3. End-to-end and release

- [x] 3.1 Extend `e2e/inbox-flow.mjs` with a second browser page on `/phone`:
  - Enter a name, send on WhatsApp, and see it live in the inbox with an unread badge.
  - The staff reply appears on the phone, then shows read ticks after the conversation is opened.
  - AI auto-reply answers on WhatsApp.
  - A Gmail email with a subject shows in the inbox.
  - No canned reply arrives.

  Run the full E2E and confirm `ALL UI FLOW STEPS PASSED`.
- [x] 3.2 Validate with `openspec validate add-customer-app --strict`, archive, commit, and push
  `feature/add-customer-app`.
