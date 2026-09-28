# Proposal

## Why

Businesses want repeat visits: promotions to groups of customers and personal birthday and anniversary greetings, sent automatically. This builds on CRM segments and the real WhatsApp channel.

## What Changes

- Broadcast campaigns send a message to a segment on a chosen channel, now or at a scheduled time, with personalization (e.g. first name).
- Only contacts who opted in and are reachable on that channel receive it; others are counted as skipped.
- Per-recipient delivery tracking and campaign stats (targeted, sent, delivered, read, failed, replied).
- Birthday and anniversary automations send a greeting once per occasion per year at a set local time.
- Opt-out keywords (e.g. STOP) automatically revoke marketing consent.
- Workspaces get a timezone setting used for scheduling.
- "Bulk promotions via push notifications" is delivered as WhatsApp template broadcasts. Push to a customer-facing app or web push is out of scope until such an app exists.

## Capabilities

### New Capabilities
- `campaigns`: Broadcasts, scheduling, consent filtering, personalization, delivery stats, birthday/anniversary automations, opt-out keywords, and workspace timezone.

### Modified Capabilities

None.

## Impact

- **Depends on:** `add-crm-tags`, `add-whatsapp-channel` (template sending outside the 24-hour window).
- **Backend:** campaign, recipient, and automation tables; a background scheduler.
- **External:** WhatsApp marketing templates must be approved by Meta; Meta charges per marketing conversation.
