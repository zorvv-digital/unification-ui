# demo-workspace Specification

## Purpose
Provides a ready-to-show demo workspace, built into the real backend, so the product can be demonstrated end to end without connecting any real channel or maintaining a separate demo app.

## Requirements

### Requirement: Seeded demo workspace
When demo mode is enabled, the system SHALL ensure on startup that a demo workspace exists with a demo user, simulated WhatsApp, Instagram, and Messenger channels, and seeded contacts, conversations, and messages. Seeding SHALL be idempotent.

#### Scenario: First startup
- **WHEN** the system starts with demo mode enabled and no demo workspace exists
- **THEN** the demo workspace, demo user, channels, and seed conversations are created

#### Scenario: Restart
- **WHEN** the system restarts and the demo workspace already exists
- **THEN** no duplicate workspace, users, or seed data are created

#### Scenario: Demo mode disabled
- **WHEN** the system starts with demo mode disabled
- **THEN** no demo workspace is created

### Requirement: Demo login
The demo user's email and password SHALL be configurable, and the demo user SHALL log in through the normal login flow.

#### Scenario: Demo login
- **WHEN** a client logs in with the configured demo credentials
- **THEN** the client receives a token for the demo workspace

### Requirement: Simulated customer replies
In the demo workspace, the system SHALL generate a customer reply shortly after each outbound message, delivered as a normal inbound message including live events.

#### Scenario: Reply after sending
- **WHEN** a demo user sends a message in a demo conversation
- **THEN** within a configurable delay an inbound reply from that conversation's contact appears and is pushed on the live event stream

#### Scenario: Non-demo workspaces
- **WHEN** a user in a non-demo workspace sends a message
- **THEN** no simulated reply is generated

### Requirement: Demo reset
The system SHALL let a user of the demo workspace reset it to its seeded state, discarding all changes made since seeding.

#### Scenario: Reset demo
- **WHEN** a demo workspace user requests a reset
- **THEN** all demo conversations, messages, and contacts are restored to the seed state

#### Scenario: Reset outside demo
- **WHEN** a user of a non-demo workspace requests a demo reset
- **THEN** the system returns a 403 error and changes nothing
