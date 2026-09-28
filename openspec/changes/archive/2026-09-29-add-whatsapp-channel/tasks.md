# Tasks

## 1. Foundations

- [x] 1.1 Write tests for `encrypt_secret`/`decrypt_secret` and implement `app/services/crypto.py` (add `cryptography`)
- [x] 1.2 Move adapter contract types to `app/providers/base.py`, add `StatusUpdate`, pass raw body to `parse_webhook`; existing tests stay green

## 2. Connect and disconnect

- [x] 2.1 Write API tests for `POST /channels/whatsapp` (valid → connected, webhook URL + verify token, secrets encrypted and never returned; Meta rejects → 400, nothing saved), `GET /channels/{id}/webhook`, and `DELETE /channels/{id}` (secrets cleared, status disconnected, conversations kept, inbound 410, send 409); implement until they pass

## 3. Webhooks

- [x] 3.1 Write API tests for the verification handshake (match → challenge, wrong token → 403) and signed events (valid text → inbox, media types mapped, bad/missing signature → 401 nothing stored, duplicate wamid ignored); implement until they pass
- [x] 3.2 Write API tests for delivery statuses (read updates message and emits `message.updated`; out-of-order `delivered` after `read` ignored; `failed` applies); implement until they pass

## 4. Sending

- [x] 4.1 Write API tests for outbound text and media through the Cloud API (payload shape, Meta id stored, Meta error → `failed`) and the 24-hour window (30 h → 409, nothing sent or stored); implement until they pass
- [x] 4.2 Write API tests for templates (list approved; send outside window renders body and is stored; missing parameter 422; unknown 404; simulated channel 400); implement until they pass

## 5. Frontend

- [x] 5.1 Reducer test and handling for `message.updated`; map `message.updated` in `HttpMessageService`
- [x] 5.2 WhatsApp numbers modal (connect, webhook details, disconnect) from the WhatsApp page ⋮ menu
- [x] 5.3 Send error bar and template picker on the WhatsApp page

## 6. Verify and document

- [x] 6.1 Extend the E2E with a mock Graph server and the WhatsApp flow; run the full E2E
- [x] 6.2 Update `docs/api-testing-swagger.md` and `docs/ui-user-flow.md` (including how to register the webhook in Meta)
- [x] 6.3 Validate, archive, commit, and push `feature/add-whatsapp-channel`
