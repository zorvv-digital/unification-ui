# Design

## Context

We are building a mockup of a unified inbox with a fake Gmail integration for product demonstration purposes. The frontend is Vite + React 19 + TailwindCSS v4. There is no backend, so all data and interactions must be mocked in the browser. (See `proposal.md` for full motivation).

## Goals / Non-Goals

**Goals:**
- Provide a responsive, believable UI that demonstrates reading and writing Gmail messages.
- Use a simple, robust state management approach that doesn't overcomplicate the PoC.

**Non-Goals:**
- Real OAuth integration with Google.
- Persistent storage across browser sessions (state can reset on reload).
- Complex offline syncing or service workers.

## Decisions

### Decision 1: State Management Approach
- **Choice**: Use React's built-in Context API combined with `useReducer` or `useState`.
- **Rationale**: Since this is a UI prototype without a backend, introducing Redux or Zustand might be overkill. React Context is built-in and perfectly suited for providing global access to a mock dataset across the Sidebar, List, and Detail views.
- **Alternatives**:
  - *Zustand*: Great, but adds a dependency for a relatively simple need.
  - *Redux*: Too much boilerplate for a PoC.

### Decision 2: Mock Data Structure
- **Choice**: Define a `Message` type with fields like `id`, `provider` (e.g., 'gmail'), `sender`, `subject`, `body`, `timestamp`, and `isRead`.
- **Rationale**: This closely mirrors what a real unified inbox schema might look like, making the eventual backend integration easier.

### Decision 3: Faking the "Send" Action
- **Choice**: When a user submits a reply in the UI, synchronously prepend a new `Message` object to the local state array.
- **Rationale**: Provides instant visual feedback to demonstrate the "write" capability of the app.

## Risks / Trade-offs

- **Risk:** State resets on page reload, which might interrupt a demo.
  - **Mitigation:** We could optionally persist the state to `localStorage`, but for a simple demo, just avoiding reloads during the presentation is acceptable. If `localStorage` is trivial to add (e.g. `useEffect` sync), we will do it.
