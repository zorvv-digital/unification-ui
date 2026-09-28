# Proposal

## Why

Reputation is the first pillar of the product: more good Google reviews, fast on-brand replies to every review, and a private route for unhappy customers to be heard and helped. More and fresher reviews also support local "near me" search ranking — that is an outcome of this change, not a separate feature.

## What Changes

- A workspace connects its Google Business Profile locations; reviews sync into the platform.
- Reviews can be filtered, and an AI reply draft in the workspace's brand tone can be edited and posted to Google. Replies can optionally be auto-posted for high ratings; low ratings always need a human.
- Review requests are sent to customers through their channel with a unique feedback link.
- The feedback page shows the Google review link to **every** customer. Customers giving a low rating are additionally offered a private feedback form that reaches the business right away.
- This deliberately replaces the "smart redirect" / "eliminate negative reviews" wording with a flow that does not selectively solicit positive reviews (review gating), which Google's review policy prohibits.
- A rating summary shows average, count, distribution, and monthly trend.

## Capabilities

### New Capabilities
- `review-management`: Google Business Profile connection, review sync, AI reply drafts, posting, auto-reply rules, new-review events, and rating summary.
- `review-requests`: Sending review requests, the public feedback page, private feedback, frequency limits, and request funnel stats.

### Modified Capabilities

None.

## Impact

- **Depends on:** `add-inbox-backend`, `add-ai-agents` (brand tone and knowledge for reply drafts), `add-crm-tags` (segments and consent for bulk requests).
- **External:** Google Business Profile API access must be requested and approved by Google.
- **Backend:** location, review, review request, and private feedback tables; a public feedback page endpoint.
