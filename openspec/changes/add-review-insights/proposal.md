# Proposal

## Why

Once reviews and private feedback flow in, businesses want two more things: to know which staff members customers love (or complain about), and to show off their best reviews on their website and social media.

## What Changes

- Businesses list their staff members (who need not be platform users).
- Review requests and feedback can be attributed to a staff member, either chosen by the sender or picked by the customer on the feedback page; Google reviews that mention a staff member by name are attributed as mentions.
- Per-staff metrics and a leaderboard for a chosen period.
- An embeddable public widget shows selected Google reviews on the business's website.
- High-rated Google reviews can be shared to the connected Facebook Page and Instagram account, either after approval or automatically.

## Capabilities

### New Capabilities
- `employee-feedback`: Staff members, attribution, and per-staff performance metrics.
- `review-sharing`: Website review widget and social sharing of positive reviews.

### Modified Capabilities

None.

## Impact

- **Depends on:** `add-reviews`; `add-meta-channels` for social sharing (Page connection).
- **Backend:** staff table, attribution fields, share records, public widget endpoint, generated review image cards (Instagram posts require an image).
- **External:** Page publishing permissions in the Meta app.
