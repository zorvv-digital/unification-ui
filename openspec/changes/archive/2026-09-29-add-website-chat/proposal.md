# Proposal

## Why

"Website conversations" are one of the channels promised for the unified inbox, and they are the one channel the platform fully owns: no third-party approval, and it works in the demo with no setup. It also captures leads (name, phone, email) from site visitors.

## What Changes

- Each workspace gets an embeddable chat widget with a public widget key and allowed domains.
- Visitors chat anonymously; their messages create `website` conversations in the unified inbox, and staff replies reach them live.
- The widget can ask for name, email, and phone, which update the contact (lead capture).
- Returning visitors in the same browser see their history.
- The demo workspace gets a real (not simulated) website channel and a demo page.

## Capabilities

### New Capabilities
- `website-chat`: Widget configuration, visitor sessions, live messaging, lead capture, origin checks, rate limits, and the demo website channel.

### Modified Capabilities

None.

## Impact

- **Depends on:** `add-inbox-backend`.
- **Backend:** public (non-user-token) widget endpoints and a visitor event stream.
- **Frontend:** a small standalone widget script, separate from `saas inbox`.
