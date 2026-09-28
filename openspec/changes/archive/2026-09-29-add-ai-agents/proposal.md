# Proposal

## Why

Businesses need an AI assistant that speaks for their brand, and they need to keep improving it without technical help. The AI Playground in `saas inbox` is only a mock today; Zeryva-backend already proves out the profiler → builder flow, so we port that flow into this platform as a workspace-scoped, versioned agent the business can refine.

## What Changes

- Port Zeryva's profiling questions and agent builder into the backend, scoped to a workspace instead of a project.
- Agents are versioned: every edit to prompt, greeting, personality, rules, or skills creates a new version; any version can be activated again.
- "Retraining" means refining the agent's prompt, skills, and knowledge — including by plain-language feedback the AI turns into a revised prompt. No model fine-tuning.
- Knowledge items (e.g. About Us, Brand Tone, Pricing — the items already shown in the Playground UI) become stored, editable text the agent uses when answering.
- A playground chat lets the business test any agent version without touching real customers.
- Wire the `saas inbox` AI Playground page to these endpoints.

## Capabilities

### New Capabilities
- `ai-agent-builder`: Profiling questions, agent generation, editing, feedback-driven refinement, versions, and activation.
- `ai-knowledge`: Workspace knowledge items that agents use when answering.
- `ai-playground`: Private multi-turn test chat against any agent version.

### Modified Capabilities

None.

## Impact

- **Depends on:** `add-inbox-backend` (workspaces, auth).
- **Backend:** new agent, agent version, and knowledge tables; LLM provider settings copied from Zeryva (`llm_provider`, `llm_api_key`, `llm_model`, `llm_base_url`); `agno` dependency.
- **Frontend:** `saas inbox/src/pages/AIPlayground.tsx` switches from hardcoded data to the API.
- **Out of scope:** document upload / vector search (text knowledge only), third-party connectors shown in the Playground marketplace (Shopify, Drive, etc.), agents replying to customers (`add-ai-replies`).
