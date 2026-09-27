# Tasks

## 1. Sidebar UI Updates

- [x] 1.1 In `src/pages/Instagram.tsx`, update the desktop navigation rail layout to remove text labels and keep it icon-only at all times, making it narrower (e.g., `w-[72px]`). Verify by observing the narrower sidebar without text labels on desktop.
- [x] 1.2 Update the messages list header to include a dropdown chevron next to the username (`zorvv.ai`) and replace the `PlusSquare` icon with an edit/compose icon (e.g., a pencil or similar icon like `Edit` or `SquarePen` from `lucide-react`). Verify by seeing the new header layout.
- [x] 1.3 Add a 3-tab navigation bar ("Primary", "General", "Requests") below the header and above the search bar. Use state to track the active tab. Verify by clicking tabs and seeing active state change.
- [x] 1.4 Add a horizontal "Notes" section below the search bar featuring avatars with text bubbles (e.g., "Weekend plans?", "Your note"). Add hardcoded mock data for notes. Verify by scrolling horizontally through the notes section.

## 2. Empty State Updates

- [x] 2.1 Update the empty state in the main chat area (when no conversation is selected). Change the icon to an outlined airplane/direct message icon (e.g., `Send` from `lucide-react` in a circle). Verify icon appears correctly.
- [x] 2.2 Update the empty state text to "Your messages" and the subtext to "Send a message to start a chat." Verify text is updated.
- [x] 2.3 Style the "Send message" button to have a softer blue background and match the reference image's visual weight. Verify by checking button appearance.
