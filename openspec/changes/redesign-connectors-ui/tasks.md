# Tasks

## 1. State and Data Setup

- [x] 1.1 Add `searchQuery` and `activeCategory` (defaulting to 'All') states to `AIPlayground`. Verify the states can be updated via their setters.
- [x] 1.2 Add a `category` property to all items in `popularConnectors` and `smallBusinessConnectors` (e.g., 'Storage', 'CRM', 'Chat'). Verify the data arrays include these new fields without breaking existing types.

## 2. Modal Redesign

- [x] 2.1 Build the sticky Search bar at the top of the Connectors & Skills modal body. Verify typing filters the visible list items below.
- [x] 2.2 Implement the Category Pill Tabs (All, CRM, Storage, Chat, etc.) directly below the search bar. Verify clicking a tab updates the `activeCategory` state and filters the list items.

## 3. Micro-animations and Hover States

- [x] 3.1 Update the unconnected integration rows to include a smooth group-hover animation where the standard `+` icon expands horizontally into a `Connect` button. Verify the transition doesn't cause abrupt layout shifts.
- [x] 3.2 Update the connected integration items (the large square icons at the top of the modal) to display quick actions like a `Settings` or `Disconnect` overlay on hover. Verify the overlay works correctly.

## 4. Sidebar Widget Enhancement

- [x] 4.1 Refactor the "Connectors & skills" trigger button in the right sidebar into a distinct glassmorphism/gradient mini-card widget. Verify the styling is applied and the click target still opens the modal.
- [x] 4.2 Add a small, pulsing green indicator dot (using Tailwind's `animate-ping`) to the widget to signal "active" connections. Verify the pulsing effect runs continuously.
