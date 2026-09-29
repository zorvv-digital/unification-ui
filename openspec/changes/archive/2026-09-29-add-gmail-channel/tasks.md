# Tasks

## 1. Threads and subjects

- [x] 1.1 Write tests for `receive_message` with `thread_id`/`subject`/`email` (one conversation per thread, subject kept, contact reused by email); add `Conversation.subject` and the `InboundMessage` fields; implement until they pass

## 2. Connect

- [x] 2.1 Write API tests for `POST /channels/gmail/authorize` (URL with scopes, offline access, signed state; 400 when Google is not configured) and the callback (connected → channel with encrypted tokens and redirect `?gmail=connected`; reconnect upserts; `error` → `denied`, no channel; bad state or failed exchange → `error`); implement until they pass

## 3. Sync and send

- [x] 3.1 Write tests for `POST /channels/{id}/sync` (new inbox email → `gmail` conversation with subject and sender; same thread → same conversation; duplicate ignored; quoted text trimmed; expired access token refreshed; revoked grant → `disconnected` + `channel.updated`); implement `SyncService` and the lifespan loop
- [x] 3.2 Write tests for replies (MIME with To/Subject/In-Reply-To/References, `threadId`, Gmail id stored; Meta-style `failed` on error; revoked → disconnected); implement until they pass

## 4. Demo

- [x] 4.1 Seed a simulated Demo Gmail channel with three email threads; reset adds missing simulated channels; update demo tests

## 5. Frontend

- [x] 5.1 Remove the Gmail mock (`InboxContext`, `types/inbox.ts`, `inboxMockData.ts`, UnifiedInbox branch); sample emails in messaging mock data; show subjects
- [x] 5.2 Gmail modal from the sidebar (Connect with Google, list, disconnect) and the return banner

## 6. Verify and document

- [x] 6.1 Extend the E2E mock server and flow for Gmail; run the full E2E
- [x] 6.2 Update `docs/api-testing-swagger.md` and `docs/ui-user-flow.md` (Google Cloud setup)
- [x] 6.3 Validate, archive, commit, and push `feature/add-gmail-channel`
