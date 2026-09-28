# Proposal

## Why

The promise is 24/7 customer engagement: customers get answers at night and on weekends without staff online. With agents built in `add-ai-agents`, the inbox can hand incoming conversations to an agent and let staff take over whenever needed.

## What Changes

- A workspace can switch AI auto-reply on per channel and pick which agent answers.
- Each conversation is in `ai` or `human` mode. AI answers only in `ai` mode; a staff reply switches to `human`; staff can hand back to AI.
- The agent escalates to a human when it cannot help or the customer asks for a person, flagging the conversation.
- Staff can ask the AI for a suggested reply without sending it.
- The demo workspace gains a "simulate customer message" action, and simulated customer replies no longer trigger off AI replies (prevents an endless AI ↔ simulated-customer loop).

## Capabilities

### New Capabilities
- `ai-replies`: Auto-reply per channel, conversation mode, human takeover, escalation, and suggested replies.

### Modified Capabilities
- `demo-workspace`: Simulated customer replies only follow human-sent messages; add a simulate-customer-message action.

## Impact

- **Depends on:** `add-inbox-backend`, `add-ai-agents`.
- **Backend:** conversation gains mode and needs-human flag; message gains author (user or agent); channel gains auto-reply settings.
- **Frontend:** mode toggle, AI badge on messages, "needs human" filter, suggest-reply button in `saas inbox`. The existing `AiScheduleModal` component is a candidate home for auto-reply settings.
