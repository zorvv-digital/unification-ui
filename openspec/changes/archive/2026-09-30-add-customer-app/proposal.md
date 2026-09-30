# Proposal

## Why

Demos of the inbox look staged. On WhatsApp, Instagram, Messenger and Gmail, customer messages come only from a staff-side
"Simulate customer message" prompt or from canned replies, so the presenter appears to talk to themselves. Website chat
is the only channel with a real customer side, and it is the part of the demo that convinces people. Prospects need to
see a message typed on a phone, in an app that looks like WhatsApp, land in the inbox live, and get answered back on
that phone.

## What Changes

- New public **customer app** at `/phone` in `saas inbox`. It has a phone-style screen that looks like WhatsApp,
  Instagram DM, Messenger, or Gmail from the customer's side, plus a link to the existing website chat demo page. The
  visitor enters a name and chats with the demo business. It works in a second browser window or on a real phone.
- Messages from the app enter the demo workspace's simulated channels through the normal inbound path. They appear in
  the inbox live, count as unread, and trigger AI auto-reply exactly like a real customer message.
- Replies from staff and from the AI reach the open customer app live. The app shows the customer's own messages as
  read once staff open the conversation.
- New public, demo-only **customer API**, modeled on the website widget's visitor API: start a session, read history,
  send a message, and stream live events. It includes the same length and rate limits.
- Conversations started from the customer app do not get the demo's canned customer replies, because a person is
  replying.
- Staff side: a demo-only **Customer app** link in the inbox sidebar opens the app in a new tab.
- Demo reset removes customer-app conversations like any other. An open app keeps working and starts an empty thread.
- `demo-unified-inbox` is not touched. It is a business-side prototype that is being retired, and the customer app
  replaces the reason to keep it.

## Capabilities

### New Capabilities
- `demo-customer-app`: the customer-side demo app and its public API (sessions, history, sending, live replies and
  read state, limits, and demo-only access).

### Modified Capabilities
- `demo-workspace`: simulated canned customer replies no longer follow staff messages in conversations started from
  the customer app.

## Impact

- Backend: new `app/api/customer_app.py` router and `app/services/customer_app_service.py`. `InboxService._publish`
  and mark-as-read also notify the customer app. `api/conversations.py` skips the canned reply for customer-app
  conversations. New schemas in `app/models/schemas.py`. There is no DB schema change: customer-app conversations are
  recognized by their external id.
- Frontend: new `/phone` route rendered outside the logged-in `MessagingProvider`, `src/pages/CustomerApp.tsx` with
  the four platform skins, `src/services/customerApi.ts`, and a sidebar link.
- Docs: both walkthroughs gain a customer-app section. The E2E adds a customer-app flow.
- No new dependencies.
