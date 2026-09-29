# Tasks

## 1. Connect

- [x] 1.1 Write API tests for `POST /channels/meta` (Page with Instagram → two connected channels with webhook info, secrets encrypted; Page without Instagram → messenger only; Meta rejects → 400 nothing saved; reconnect same Page → same channel ids and verify tokens, status connected); implement until they pass

## 2. Webhooks

- [x] 2.1 Write API tests for the handshake and signed events (Messenger text → `messenger` conversation named via profile lookup; Instagram DM → `instagram` conversation; attachment mapped; echoes/reads skipped; bad signature → 401 nothing stored; duplicate mid ignored); implement until they pass

## 3. Sending

- [x] 3.1 Write API tests for replies (payload to `/{page_id}/messages`, Meta mid stored, 24-hour window 409 without template hint, Meta error → `failed`); implement until they pass
- [x] 3.2 Write API tests for token health (code 190 → message `failed`, channel `disconnected`, `channel.updated` emitted, config kept; WhatsApp too); implement until they pass

## 4. Frontend

- [x] 4.1 Generalize `WhatsAppNumbersModal` into `ChannelsModal`; WhatsApp page unchanged in behavior
- [x] 4.2 Facebook Page & Instagram modal from the Messenger and Instagram ⋯ buttons; send error bar and disconnected notice on both pages

## 5. Verify and document

- [x] 5.1 Extend the E2E mock Graph server and flow for Messenger/Instagram; run the full E2E
- [x] 5.2 Update `docs/api-testing-swagger.md` and `docs/ui-user-flow.md`
- [x] 5.3 Validate, archive, commit, and push `feature/add-meta-channels`
