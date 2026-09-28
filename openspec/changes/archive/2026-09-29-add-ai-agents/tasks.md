# Tasks

## 1. LLM provider

- [x] 1.1 Write tests for `app/providers/llm.py` (fake provider returns valid schema output; openai provider parses JSON responses and maps HTTP errors, timeouts, and invalid JSON to `LLMError`) and implement until they pass

## 2. Knowledge

- [x] 2.1 Write API tests for knowledge items (create, list, update, delete, 20,000-char limit 422, workspace isolation) and implement models, schemas, service, and routes until they pass

## 3. Agent builder

- [x] 3.1 Write API tests for profiling questions and agent generation (with and without setup, provider failure → 502 and nothing stored) and implement until they pass
- [x] 3.2 Write API tests for manual edit (new active version), refine by feedback (inactive draft), version list, activation/rollback, rename, delete, attach/detach knowledge, isolation; implement until they pass

## 4. Playground

- [x] 4.1 Write API tests for playground chat (chosen vs active version, multi-turn context, new session, disabled/detached knowledge excluded, knowledge edits apply immediately, no inbox side effects, provider failure → 502 and session still usable) and implement until they pass

## 5. Demo agent

- [x] 5.1 Write tests that the demo workspace has a seeded agent with knowledge and that reset restores them; extend `seed.json` and `DemoService` until they pass
- [x] 5.2 Extend `docs/api-testing-swagger.md` with an AI agents section and verify each step against the running server

## 6. Frontend integration

- [x] 6.1 Add typed `src/services/aiApi.ts` client using the API's own shapes (no mapping layer, so no unit-level logic to test; behavior is covered by the e2e flow in 6.3); verify `npm run build`
- [x] 6.2 Wire AI Playground to the API (agent/version pickers, chat, instructions save, feedback refine, activate, knowledge create/toggle/attach, builder when no agent), keeping mock mode and the existing theme; verify `npm run build`
- [x] 6.3 Extend the e2e script and `docs/ui-user-flow.md` with the AI playground flow; verify `npm run e2e` passes

## 7. Integration check

- [x] 7.1 Run all backend tests, frontend tests, build, and e2e; validate and archive the change
