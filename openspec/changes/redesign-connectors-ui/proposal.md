# Proposal

## Why

The current Connectors & Skills interface is functional but feels static. As the number of available integrations grows, users need a more premium, structured, and interactive way to browse and manage their connections. Upgrading this UI to a "Marketplace" feel with better interaction design will significantly improve the perceived value and usability of the AI Playground.

## What Changes

- Transform the "Connectors & skills" sidebar row into a distinct glassmorphism "Active Integrations" widget with a live pulsing indicator.
- Redesign the Connectors & Skills modal into an App Store/Marketplace layout.
- Add a sticky search bar to the modal for quick filtering of integrations.
- Add category filter tabs (e.g., All, Storage, CRM, Chat) to organize the growing list of connectors.
- Introduce rich micro-animations (e.g., hovering over an available connector smoothly expands a standard `+` icon into a `Connect` button).
- Add specific hover actions for already connected integrations (e.g., showing a `Settings` or `Disconnect` button).

## Capabilities

### New Capabilities

- None (pure UI/UX redesign)

### Modified Capabilities

- None (pure UI/UX redesign)

## Impact

- **UI/Components**: `AIPlayground.tsx` will undergo significant structural changes to its right-panel widget and the modal overlay.
- **State**: Minor state additions to track search queries and active category filters within the modal.
- **Dependencies**: None. We are already utilizing `lucide-react` and `react-icons` for our rich iconography.
