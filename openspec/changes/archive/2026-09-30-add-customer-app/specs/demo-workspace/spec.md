# Spec Delta

## MODIFIED Requirements

### Requirement: Simulated customer replies
In the demo workspace, the system SHALL generate a customer reply shortly after each outbound message sent by a staff member, delivered as a normal inbound message including live events. Outbound messages authored by an AI agent SHALL NOT trigger a simulated customer reply. Conversations started from the customer app SHALL NOT receive simulated customer replies, because a person answers there.

#### Scenario: Reply after sending
- **WHEN** a demo user sends a message in a demo conversation
- **THEN** within a configurable delay an inbound reply from that conversation's contact appears and is pushed on the live event stream

#### Scenario: Non-demo workspaces
- **WHEN** a user in a non-demo workspace sends a message
- **THEN** no simulated reply is generated

#### Scenario: AI reply does not trigger simulation
- **WHEN** an AI agent replies in a demo conversation
- **THEN** no simulated customer reply is generated

#### Scenario: Customer-app conversation
- **WHEN** a demo user replies in a conversation started from the customer app
- **THEN** no simulated customer reply is generated
