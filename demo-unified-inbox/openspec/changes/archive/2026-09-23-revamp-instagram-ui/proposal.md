# Proposal

## Why

The current Instagram messaging interface in `Instagram.tsx` is functional but very basic, not matching the actual Instagram web UI. The user wants to revamp it based on a provided reference image to create a more authentic and immersive experience.

## What Changes

- Add a 3-tab navigation system ("Primary", "General", "Requests") above the search bar in the side panel.
- Add a horizontally scrolling "Notes" section (avatars with text bubbles) below the search bar.
- Update the messages list header to include the username with a dropdown chevron and a specific "compose" icon (pencil in square).
- Revamp the empty state in the main chat area to use the correct airplane/direct message icon, copy ("Your messages", "Send a message to start a chat."), and button styling.
- Adjust the left navigation rail so that when the messages side panel is open, the rail collapses to an icon-only view (like it currently does on mobile, but for all sizes), freeing up space.

## Capabilities

### New Capabilities
- `instagram-messaging-ui`: Define the visual and functional requirements for the Instagram messaging interface (Sidebar, Notes, Tabs, Empty State).

### Modified Capabilities


## Impact

- `src/pages/Instagram.tsx` will undergo a structural and styling overhaul.
- Mock data in `src/data/instagram.ts` might need to be extended if we want to show notes data.
