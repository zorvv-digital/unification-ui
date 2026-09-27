# Tasks

## 1. State Management Setup

- [x] 1.1 Create the `Message` TypeScript interface in a types file and verify it imports correctly.
- [x] 1.2 Define a mock dataset of 3-5 realistic-looking Gmail messages and verify the array loads without type errors.
- [x] 1.3 Create an `InboxContext` and `InboxProvider` component using React Context and `useReducer`/`useState` to manage the mock messages. Verify the provider wraps the app correctly without crashing.

## 2. UI Integration (Read)

- [x] 2.1 Add a "Gmail" filter/tab in the Sidebar UI. Verify the UI updates to show the tab is active when clicked.
- [x] 2.2 Update the main Message List view to consume `InboxContext`. Implement filtering so that when "Gmail" is selected, only mock Gmail messages are displayed. Verify the filtered list renders correctly.
- [x] 2.3 Implement the Message Detail view to render the selected mock message content. Verify clicking an item in the Message List updates the Detail view with the correct mock data.

## 3. UI Integration (Write)

- [x] 3.1 Create a simple "Compose" or "Reply" inline form with a text area and a "Send" button in the Message Detail view. Verify the form renders and captures input state.
- [x] 3.2 Wire the "Send" button to a function in `InboxContext` that unshifts the new message into the local state array. Verify that clicking "Send" immediately makes the new message appear in the UI list.
- [x] 3.3 Clear the compose form after sending. Verify the text area is empty after a successful mock send.
