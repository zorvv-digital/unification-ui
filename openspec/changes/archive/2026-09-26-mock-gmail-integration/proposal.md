# Proposal

## Why

We need a way to showcase the unified inbox product to potential users and stakeholders without having to wait for a complex, fully functional backend with OAuth and API limits. Building a mock Gmail integration in the UI allows us to demonstrate both read and write capabilities instantly.

## What Changes

- Add a state management solution (React Context or custom hook) to store and manage mock email data locally in the browser.
- Pre-populate the state with a batch of mock Gmail messages on initial load.
- Create a Gmail-specific filter/view in the UI.
- Render the mock emails in the existing email list layout.
- Implement a Compose/Reply feature that fakes the "Send" action by instantly appending the new message to the local state, demonstrating the UI's write capabilities.

## Capabilities

### New Capabilities
- `mock-gmail-integration`: Defines the behavior of the mocked Gmail integration, including initial data loading, reading mock emails, and faking the write (send/reply) functionality using local state.

### Modified Capabilities
- None

## Impact

- **UI/Components:** Adds new views for filtering by integration and composing messages.
- **State:** Introduces global or page-level state to manage the mock messages.
- **Dependencies:** Uses the existing Vite + React 19 + TailwindCSS stack. No new major dependencies required, though a state library could be added if preferred.
