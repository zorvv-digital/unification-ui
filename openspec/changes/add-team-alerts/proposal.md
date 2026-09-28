# Proposal

## Why

The product promises multi-user access and real-time alerts on mobile. Change 1 lets a workspace register one user; teams need to invite colleagues with limited permissions, share out conversations, and get notified on their phones when something needs attention.

## What Changes

- Owners invite team members by email with a role (`owner` or `agent`); agents cannot manage channels, team, or agents.
- Removing a member immediately revokes their access.
- Conversations can be assigned to a member, with an "assigned to me" filter.
- Mobile devices register for push notifications; each user picks which alerts they want (new message, assignment, AI handoff, negative review, private feedback).
- The mobile app itself is a separate client of the same API and is out of scope for this backend change.

## Capabilities

### New Capabilities
- `team-members`: Invitations, roles, removal, and conversation assignment.
- `staff-alerts`: Device registration, alert preferences, and push delivery.

### Modified Capabilities

None. Users created by `workspaces-auth` registration become owners.

## Impact

- **Depends on:** `add-inbox-backend`; alert types for handoff and reviews activate once `add-ai-replies` and `add-reviews` exist.
- **Backend:** role and invitation data, conversation assignee, device tokens, alert preferences; token revocation.
- **External:** Firebase Cloud Messaging project for push delivery to Android and iOS.
