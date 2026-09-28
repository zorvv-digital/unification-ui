# Design

## Context

- Backend from `add-inbox-backend` (workspaces, auth, demo seeding) is in place.
- Zeryva-backend has the profiler and builder prompts (`profiling_agent/`, `builder_agent/`) that this change ports. Zeryva runs them through `agno` agents with structured output.
- `saas inbox/src/pages/AIPlayground.tsx` already has the right layout: a phone-style chat, an "Instructions" textarea, and a "Custom Skills" list (About Us, Brand Tone, Pricing Plans). All of it is hardcoded.

## Goals / Non-Goals

**Goals:**
- Real, versioned agents and knowledge that later changes (`add-ai-replies`, `add-reviews`) reuse through one function that builds an agent's instructions.
- Everything testable and demoable without an AI key.

**Non-Goals:**
- Tool calling, vector search, document upload, the connectors marketplace (stays mock).

## Decisions

### 1. LLM access: one small provider module, not agno (yet)
`app/providers/llm.py` exposes `complete(messages, schema=None)`:
- `openai` provider: one `httpx` POST to any OpenAI-compatible `/chat/completions` (OpenAI, Gemini's OpenAI endpoint, NVIDIA NIM — same settings shape as Zeryva: `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL`). With a `schema`, it asks for a JSON object, includes the schema in the system message, and validates with Pydantic.
- `fake` provider (default): deterministic offline output per schema, so tests, e2e, and key-less demos work.
- Any failure (HTTP, timeout, invalid JSON) raises `LLMError` → routes return 502.

*Alternative:* agno as in Zeryva. Nothing here needs an agent framework (no tools, sessions are our own table); a single HTTP call is easier to test and fake. Revisit when tool calling arrives.

### 2. Data model
```
agents              id, workspace_id, name, business_profile(JSON), active_version_number
agent_versions      id, workspace_id, agent_id, version_number, system_prompt, greeting_message,
                    personality, rules(JSON), skills(JSON), source(generated|manual|feedback), feedback
                    UNIQUE(agent_id, version_number)
knowledge_items     id, workspace_id, title, category, description, content, enabled
agent_knowledge     agent_id, knowledge_item_id  (UNIQUE pair)
playground_messages id, workspace_id, agent_id, session_id, role(user|assistant), content, created_at
```
`active_version_number` on the agent (instead of an FK to versions) avoids a circular foreign key.

### 3. Instructions composition
`AgentService.build_instructions(version, knowledge)` = version system prompt + "Business knowledge" section with each enabled, attached item (`## title` + content). Knowledge is read at answer time, so edits apply immediately without a new version.

### 4. Playground sessions
Omitting `session_id` starts a new session (server generates one). History = last 20 messages of the session. User and assistant messages are stored only after a successful reply, so a failed call leaves the session unchanged and retryable.

### 5. Demo agent
`seed.json` gains `knowledge` and `agent` blocks. The seeded agent's version 1 is a template-filled prompt (no LLM call at startup). Reset deletes the workspace's agents, versions, knowledge, and playground messages, then re-seeds.

### 6. Frontend
- `HttpMessageService.request` becomes public; `src/services/aiApi.ts` wraps the AI endpoints and uses the API's snake_case shapes directly (new code, no existing types to adapt).
- AI Playground (API mode): agent picker + version picker above the phone; chat calls the playground endpoint; Instructions textarea shows the active prompt with **Save as new version**; **Improve with feedback** creates a draft; version list with **Activate**; Custom Skills become real knowledge items (create, toggle enabled, attach to agent). No agent yet → "Create your AI agent" builder (profile → questions → generate).
- Mock mode keeps today's behavior.

## Risks / Trade-offs

- [Fake provider left on in production gives canned replies] → `LLM_PROVIDER` is logged at startup; `.env.example` documents switching to `openai`.
- [JSON mode differs across providers] → schema is also spelled out in the prompt and validated; invalid output becomes a clean 502.
- [No token limit on knowledge] → 20,000 characters per item; many items could still exceed model context. Add retrieval when knowledge grows.
