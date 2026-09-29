# Proposal

## Why

`saas inbox` already shows Gmail, but only through the frontend-only mock described by the `mock-gmail-integration` spec, with a separate data model from the rest of the inbox. Businesses need their customer email in the same inbox as chats, backed by their real Gmail account.

## What Changes

- A workspace connects a Gmail account with Google sign-in.
- New incoming emails become `gmail` conversations (one per email thread) in the unified inbox, keeping the subject.
- Replies are sent as emails in the same thread.
- A revoked Google grant marks the channel `disconnected`.
- The demo workspace gets a simulated Gmail channel seeded with the current mock Gmail messages.
- The frontend-only mock seeding and fake sending are removed in favor of the backend.

## Capabilities

### New Capabilities
- `gmail-channel`: Gmail connection, thread sync, replies, disconnect handling, and demo Gmail channel.

### Modified Capabilities
- `mock-gmail-integration`: Remove frontend mock seeding and fake local sending; Gmail data comes from the backend.

## Impact

- **Depends on:** `add-inbox-backend`.
- **External:** Google Cloud project with Gmail API; the Gmail read/send scopes are restricted scopes, which require Google verification before public use.
- **Frontend:** `InboxContext` and `types/inbox.ts` are replaced by the shared messaging model.
