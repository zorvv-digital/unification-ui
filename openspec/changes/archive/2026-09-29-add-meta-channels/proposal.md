# Proposal

## Why

Facebook Messenger and Instagram Direct are the other two channels the inbox already shows in mock form. Both run on Meta's Messenger Platform with the same login, webhook, and signature model, so they ship together.

## What Changes

- A workspace connects a Facebook Page (and its linked Instagram professional account) through Meta login.
- Signed webhook events deliver Messenger and Instagram direct messages to the unified inbox.
- Replies go out through the Messenger Platform within Meta's 24-hour standard messaging window.
- An expired or revoked Page token marks the channel `disconnected` and notifies the workspace.

## Capabilities

### New Capabilities
- `meta-channels`: Page connection, webhook verification, inbound and outbound Messenger and Instagram direct messages, messaging window, and token health.

### Modified Capabilities

None.

## Impact

- **Depends on:** `add-inbox-backend`.
- **External:** requires a Meta app with Messenger and Instagram messaging permissions and Meta App Review before public use.
- **Out of scope:** Facebook post comments, Instagram comments and story mentions, Meta message tags for sending outside the window.
