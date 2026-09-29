# Tasks

## 1. Widget channel

- [x] 1.1 Write API tests for `POST /channels/website` (created with key and defaults; second → 409), `GET/PATCH /channels/{id}/widget` (snippet contains key; domains/greeting/lead fields update; validation); implement until they pass

## 2. Public widget API

- [x] 2.1 Write API tests for config/sessions/messages (origin allowed/unlisted/missing; first message creates `website` conversation; returning token sees history and joins the same conversation; bad token 401; 2,000-char limit 422; 21st message in a minute 429 not stored); implement until they pass
- [x] 2.2 Write API tests for lead capture (name + phone update contact and emit `conversation.updated`; malformed email 422 unchanged; before first message 404) and live replies (staff reply published to the visitor stream); implement until they pass

## 3. Script, demo page, demo seed

- [x] 3.1 Serve `widget.js` and the demo page; seed the demo website channel and one website conversation; reset recreates it; update demo tests; permissive CORS for widget paths only

## 4. Inbox app

- [x] 4.1 `website` platform (icon, filter chip) and the Website chat settings modal from the sidebar

## 5. Verify and document

- [x] 5.1 Extend the E2E (settings modal, chat on the demo page ↔ inbox live both ways, lead capture, returning visitor, unlisted origin); run the full E2E
- [x] 5.2 Update `docs/api-testing-swagger.md` and `docs/ui-user-flow.md`
- [x] 5.3 Validate, archive, commit, and push `feature/add-website-chat`
