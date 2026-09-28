# Spec Delta

## Purpose

Defines how a workspace connects messaging channels and how messages move between the inbox and each channel, so new platforms can be added without changing inbox behavior.

## ADDED Requirements

### Requirement: Workspace channels
A workspace SHALL be able to have one or more channels, each with a platform, a display name, an adapter type, and adapter configuration. Channel listings SHALL NOT expose secret configuration values.

#### Scenario: List channels
- **WHEN** a user lists their workspace's channels
- **THEN** each channel's id, platform, name, adapter type, and connection status are returned without tokens or secrets

### Requirement: Outbound delivery through the channel
Every outbound message SHALL be delivered through the adapter of the channel its conversation belongs to. The channel-side message id returned by the adapter SHALL be stored on the message.

#### Scenario: Adapter accepts message
- **WHEN** an outbound message is sent on a conversation whose channel adapter accepts it
- **THEN** the message stores the channel-side id returned by the adapter

### Requirement: Inbound webhook per channel
The system SHALL accept inbound events for each channel at a channel-specific webhook URL that does not require a user token. The channel's adapter SHALL validate and translate the event into zero or more inbound messages.

#### Scenario: Unknown channel
- **WHEN** an event is posted to a webhook URL for a channel id that does not exist
- **THEN** the system returns a 404 error and stores nothing

#### Scenario: Authenticity check fails
- **WHEN** an event fails the channel adapter's authenticity check
- **THEN** the system returns a 401 error and stores nothing

#### Scenario: Valid event
- **WHEN** a valid event carrying one customer message is posted to a channel's webhook
- **THEN** the message is received into the inbox for that channel's workspace

### Requirement: Simulated adapter
The system SHALL provide a `simulated` adapter that accepts every outbound message without contacting any external service and returns a generated channel-side id. Its inbound webhook SHALL accept events in the inbox's own message format without an authenticity check.

#### Scenario: Send on simulated channel
- **WHEN** an outbound message is sent on a simulated channel
- **THEN** delivery succeeds with a generated channel-side id and no network call is made
