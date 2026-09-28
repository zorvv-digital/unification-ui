# ai-knowledge Specification

## Purpose
Stores the business facts, policies, and tone guidance an agent must know, so answers are grounded in the business's own information rather than guesses.

## Requirements

### Requirement: Knowledge items
The system SHALL let a user create, list, update, and delete knowledge items for a workspace. Each item SHALL have a title, category, description, text content, and an enabled flag.

#### Scenario: Create item
- **WHEN** a user creates a knowledge item titled "Pricing Plans" with content
- **THEN** the item is stored and listed for the workspace

#### Scenario: Content too long
- **WHEN** a user saves an item with content longer than 20,000 characters
- **THEN** the system returns a 422 error and stores nothing

### Requirement: Attach knowledge to agents
The system SHALL let a user attach and detach knowledge items to an agent. An agent SHALL use only enabled items attached to it when answering.

#### Scenario: Disabled item ignored
- **WHEN** an attached knowledge item is disabled
- **THEN** the agent's answers no longer draw on that item

### Requirement: Immediate effect
Changes to knowledge items SHALL take effect on the agent's next answer without creating a new agent version.

#### Scenario: Update price
- **WHEN** a user changes the price in the "Pricing Plans" item
- **THEN** the next playground or customer answer about pricing uses the new price
