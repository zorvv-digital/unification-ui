# Proposal

## Why

WhatsApp is the primary customer channel for the target businesses. The inbox currently only has a simulated adapter; this change connects a real WhatsApp Business number through Meta's official Cloud API, reusing the approach already specified in Zeryva-backend's `whatsapp-channel` spec.

## What Changes

- A workspace connects its WhatsApp Business number with its own Meta credentials; secrets are encrypted at rest.
- Meta webhook verification and signed inbound events feed the unified inbox.
- Outbound text and media are sent through the Cloud API; Meta delivery statuses update message status.
- Free-form messages outside Meta's 24-hour customer service window are rejected with a clear error; approved message templates can be listed and sent instead (also used by `add-campaigns`).

## Capabilities

### New Capabilities
- `whatsapp-channel`: Connect, verify webhook, receive, send, status updates, 24-hour window, and templates for WhatsApp Cloud API.

### Modified Capabilities

None. The adapter plugs into `channel-adapters` without changing its requirements.

## Impact

- **Depends on:** `add-inbox-backend`.
- **Backend:** WhatsApp adapter, encrypted channel secrets (`cryptography`, already a Zeryva dependency), `httpx` for Graph API calls.
- **External:** each business needs a Meta Business account, WhatsApp Business Account, and phone number; template approval is done by Meta.
