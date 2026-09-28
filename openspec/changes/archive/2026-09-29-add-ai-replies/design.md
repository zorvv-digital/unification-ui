# Design

## Context

- `add-inbox-backend` stores conversations and messages. Inbound messages arrive through `POST /webhooks/{channel_id}` → `InboxService.receive_message`. Staff replies go through `InboxService.send_message`.
- `add-ai-agents` provides versioned agents and `AgentService.build_instructions(agent, version)`, which composes the prompt plus the agent's enabled knowledge. `llm.complete()` is the only way to reach the model, and the offline `fake` provider answers from matching knowledge.
- In the demo, a staff reply schedules a simulated customer reply (`DemoService.schedule_reply`), which the `send_message` route triggers.
- The UI already has placeholder toggles: a "Global AI Automation" switch in `Header.tsx` that opens `AiScheduleModal`, and a "Contact AI Automation" switch in `MessageWorkspace.tsx`. Neither toggle is wired to anything.

## Goals / Non-Goals

**Goals:**
- An agent answers inbound messages on the channels where auto-reply is enabled, and staff can take over at any time.
- The same flow can be demoed without an AI key or real channels.

**Non-Goals:**
- Business-hours schedules. `AiScheduleModal`'s days and hours stay mock-only and are hidden in API mode.
- Tool calling.
- Per-conversation agent choice.
- Reply batching or debouncing when several customer messages arrive quickly.

## Decisions

### 1. Data model (columns only, no new tables)
```
channels       + ai_enabled BOOL default false, ai_agent_id UUID NULL → agents (SET NULL)
conversations  + mode 'ai'|'human' default 'human', needs_human BOOL default false
messages       + author 'customer'|'staff'|'agent'
```
- `author` separates staff replies from agent replies, which the AI badge needs. `direction` alone cannot tell them apart.
- Tables are still created with `create_all`, so there are no migrations. An existing dev database must be deleted once; the docs say so.

### 2. When the AI answers
`AiReplyService.answer(conversation_id)` opens its own session and runs as a FastAPI background task. The webhook responds immediately, and TestClient runs background tasks before returning, so tests stay deterministic. It only replies when all three hold:
- the conversation's `mode` is `ai`,
- its channel has `ai_enabled`,
- the channel has an agent.

Otherwise it does nothing, so switching a channel off stops replies even on conversations still in `ai` mode.

The task is added by:
- `POST /webhooks/{channel_id}`, once per distinct conversation that received a message;
- `POST /demo/conversations/{id}/simulate`.

It is **not** added for `DemoService`'s simulated replies. Those only follow staff messages, and a staff message has already switched the conversation to `human`, so an AI ↔ simulated-customer loop is impossible.

*Alternative:* `asyncio.create_task`, as the demo replies use. That is harder to test and gives no extra benefit here.

### 3. Prompt
The prompt is built from:
- `build_instructions(agent, active version)`, the same composition the playground uses;
- one appended rule: *"If you cannot help with this request from the information you have, reply with exactly HANDOFF."*;
- the last 20 conversation messages, with inbound mapped to `user` and outbound to `assistant`.

### 4. Escalation
The conversation escalates to a human in three cases:
1. The latest customer message asks for a person. A small regex covers phrases such as *real person, human, talk/speak to someone, manager, representative*. This check runs **before** the LLM call, so it is instant and deterministic.
2. The model replies `HANDOFF`.
3. `llm.complete` raises `LLMError`.

In every case the conversation gets `mode='human'` and `needs_human=true`, the change is committed, `conversation.updated` is published, and no message is sent.

### 5. Takeover and hand-back
- `InboxService.send_message(..., author='staff')` sets `mode='human'` and `needs_human=false`, because staff are now handling the conversation.
- Agent replies call the same function with `author='agent'`. Mode is unchanged, and no demo reply is scheduled because only the route schedules one.
- `PATCH /conversations/{id}` accepts `mode` as well as `status`.
  - Setting `mode` clears `needs_human`.
  - Setting `ai` on a channel without auto-reply returns 400 (`Enable AI auto-reply on this channel first`).
- New conversations start in `ai` mode when their channel has auto-reply enabled with an agent, and in `human` mode otherwise.

### 6. Channel settings
`PATCH /channels/{id}` with `{ai_enabled?, ai_agent_id?}`:
- The agent must belong to the workspace (otherwise 404).
- Enabling without an agent returns 400.
- `ChannelResponse` exposes `ai_enabled` and `ai_agent_id`.

### 7. Suggested reply
`POST /conversations/{id}/suggest-reply` returns `{suggestion}`.
- It uses the channel's agent, or the workspace's first agent if the channel has none.
- If the workspace has no agent at all, it returns 400.
- It builds the same prompt as auto-reply, calls `ask_llm` (a provider failure returns 502), and stores nothing.

### 8. Demo
- `_seed_ai` sets auto-reply on the demo WhatsApp channel with Glow Assistant and switches it off on the other channels. Reset re-applies this, which also repairs `ai_agent_id` after the agent is recreated.
- Priya Singh's WhatsApp conversation is seeded in `ai` mode, so the demo has a conversation the AI is already handling.
- `POST /demo/conversations/{id}/simulate` with `{content}`:
  - returns 403 outside the demo workspace;
  - otherwise stores the message through `receive_message`, exactly like a webhook, then schedules `answer`;
  - returns the stored inbound message.

### 9. Frontend (`saas inbox`, API mode only, existing theme)
- **Header switch:** on when any channel has AI enabled. Clicking it opens `AiScheduleModal`, which in API mode shows:
  - an **Agent** select;
  - one checkbox per channel;
  - the existing **Enable Automation** button, which saves the settings.

  The schedule section is shown only in mock mode.
- **MessageWorkspace switch:** reflects the conversation's `mode`, and toggling it calls `PATCH mode`. A 400 error is shown inline.
- **Needs human:** a red **Needs human** pill in the thread header and on the conversation list item, plus a **Needs human** filter chip.
- **Agent messages:** agent-authored bubbles get a small `Bot · AI` label.
- **Suggest reply:** a ✨ button in the composer fills the textarea with the suggestion; it does not send it.
- **Demo:** the MessageWorkspace ⋮ menu gains **Simulate customer message**, which opens a prompt and calls the demo simulate endpoint.

## Risks / Trade-offs

- **Two quick inbound messages:** two background answers can run at once and both reply. This is acceptable at demo scale; a per-conversation lock or debounce can come later.
- **The HANDOFF sentinel depends on the model following the instruction.** A model that ignores it still gives an answer, which is not unsafe.
- **Keyword escalation is English-only.** A multilingual check can come later.
