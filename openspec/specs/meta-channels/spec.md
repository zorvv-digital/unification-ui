# meta-channels Specification

## Purpose
Connects a business's Facebook Page and Instagram professional account so Messenger and Instagram direct messages are received and answered in the unified inbox.

## Requirements

### Requirement: Connect Page and Instagram account
The system SHALL let a user connect a Facebook Page with its Page access token and Meta app secret, verified with Meta, creating a `messenger` channel for the Page and an `instagram` channel for its linked Instagram professional account when one exists. Page tokens and the app secret SHALL be stored encrypted. Reconnecting the same Page SHALL reuse its existing channels.

#### Scenario: Page with linked Instagram
- **WHEN** a user connects a Page linked to an Instagram professional account
- **THEN** a connected `messenger` channel and a connected `instagram` channel are created

#### Scenario: Page without Instagram
- **WHEN** the connected Page has no linked Instagram professional account
- **THEN** only the `messenger` channel is created

### Requirement: Webhook verification and signatures
The system SHALL answer Meta's verification challenge only for a matching verify token, and SHALL accept inbound events only with a valid HMAC-SHA256 signature from the Meta app secret.

#### Scenario: Bad signature
- **WHEN** an event arrives with an invalid signature
- **THEN** the system returns a 401 error and stores nothing

### Requirement: Inbound direct messages
The system SHALL turn Messenger and Instagram direct messages (text and attachments) into inbound inbox messages on the matching platform, identifying the customer by their Page-scoped or Instagram-scoped id.

#### Scenario: Instagram DM
- **WHEN** a customer sends a direct message to the connected Instagram account
- **THEN** it appears in the unified inbox as an `instagram` conversation for that customer

### Requirement: Outbound replies within the messaging window
The system SHALL send replies through the Messenger Platform when the customer's last message is within 24 hours, and SHALL reject free-form replies outside that window with an explanatory error.

#### Scenario: Reply within window
- **WHEN** a user replies to a Messenger customer who wrote 2 hours ago
- **THEN** the reply is delivered and stores Meta's message id

#### Scenario: Window expired
- **WHEN** a user replies to an Instagram customer who last wrote 3 days ago
- **THEN** the system returns a 409 error and nothing is sent

### Requirement: Token health
When Meta rejects a channel's token as expired or revoked, the system SHALL set the channel status to `disconnected` and emit an event so the workspace can reconnect.

#### Scenario: Revoked token
- **WHEN** sending fails because the Page token was revoked
- **THEN** the message is stored as `failed`, the channel becomes `disconnected`, and an event is emitted
