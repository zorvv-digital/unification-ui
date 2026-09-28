# Spec Delta

## MODIFIED Requirements

### Requirement: Simulated customer replies
In the demo workspace, the system SHALL generate a customer reply shortly after each outbound message sent by a staff member, delivered as a normal inbound message including live events. Outbound messages authored by an AI agent SHALL NOT trigger a simulated customer reply.

#### Scenario: Reply after sending
- **WHEN** a demo user sends a message in a demo conversation
- **THEN** within a configurable delay an inbound reply from that conversation's contact appears and is pushed on the live event stream

#### Scenario: Non-demo workspaces
- **WHEN** a user in a non-demo workspace sends a message
- **THEN** no simulated reply is generated

#### Scenario: AI reply does not trigger simulation
- **WHEN** an AI agent replies in a demo conversation
- **THEN** no simulated customer reply is generated

## ADDED Requirements

### Requirement: Simulate customer message
The system SHALL let a demo workspace user post a message as if it came from a chosen demo contact, so AI replies can be demonstrated.

#### Scenario: Simulate inbound
- **WHEN** a demo user simulates "Do you open on Sunday?" from a demo contact
- **THEN** the message arrives as an inbound message on that contact's conversation, exactly as a real customer message would

#### Scenario: Outside demo
- **WHEN** a non-demo workspace user calls the simulate action
- **THEN** the system returns a 403 error and stores nothing
