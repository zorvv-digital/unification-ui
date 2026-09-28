# Tasks

## 1. Model and settings

- [x] 1.1 Write API tests for channel auto-reply settings (enable with agent, enable without agent 400, foreign agent 404, response fields) and implement columns, schemas, `PATCH /channels/{id}` until they pass

## 2. Auto-reply

- [x] 2.1 Write API tests: new conversation on an auto-reply channel starts in `ai` mode and gets an agent-authored reply using knowledge and history; disabled channel starts `human` and gets none; channel switched off stops replies; implement `AiReplyService` and the webhook background task until they pass
- [x] 2.2 Write API tests for takeover and hand-back (staff message → `human`, no AI reply; `PATCH mode=ai` → next message answered; `mode=ai` on channel without auto-reply 400) and implement until they pass

## 3. Escalation and suggestions

- [x] 3.1 Write API tests for escalation (asks for a person, model HANDOFF, provider failure → `human` + `needs_human`, no message) and the `needs_human` list filter; implement until they pass
- [x] 3.2 Write API tests for suggested reply (returned, nothing stored; no agent 400; provider failure 502) and implement until they pass

## 4. Demo

- [x] 4.1 Write API tests: AI reply triggers no simulated customer reply; simulate customer message (demo → stored inbound + AI reply; non-demo 403); seed/reset restores WhatsApp auto-reply and Priya in `ai` mode; implement until they pass

## 5. Frontend

- [x] 5.1 Map `mode`, `needs_human`, `author` in `HttpMessageService`; add reducer test for conversation mode updates
- [x] 5.2 Wire Header switch + `AiScheduleModal` (agent select, channel checkboxes) to channel settings
- [x] 5.3 Wire MessageWorkspace switch to conversation mode; Needs human pill, list indicator and filter chip; AI label on agent messages; Suggest reply button; demo Simulate customer message

## 6. Verify and document

- [x] 6.1 Extend `e2e/inbox-flow.mjs` with the AI reply flow and run the full E2E
- [x] 6.2 Update `docs/api-testing-swagger.md` and `docs/ui-user-flow.md`
- [x] 6.3 Validate, archive, commit, and push `feature/add-ai-replies`
