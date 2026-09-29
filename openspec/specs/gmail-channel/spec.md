# gmail-channel Specification

## Purpose
Brings a business's Gmail customer email into the unified inbox as threaded conversations that can be answered like any other channel.

## Requirements

### Requirement: Connect Gmail
The system SHALL let a user connect a Gmail account through Google sign-in, storing the grant encrypted and creating a `gmail` channel.

#### Scenario: Consent granted
- **WHEN** a user completes Google sign-in and grants the requested access
- **THEN** a connected `gmail` channel is created for that address

#### Scenario: Consent denied
- **WHEN** the user cancels or denies access
- **THEN** no channel is created

### Requirement: Thread sync
The system SHALL import new incoming emails within 2 minutes of arrival. Each Gmail thread SHALL map to one conversation, the conversation SHALL keep the email subject, and the sender's address SHALL identify the contact.

#### Scenario: New email
- **WHEN** a customer emails the connected address with subject "Booking for Saturday"
- **THEN** a `gmail` conversation with that subject appears in the unified inbox

#### Scenario: Reply in existing thread
- **WHEN** the customer replies in the same email thread
- **THEN** the message is added to the existing conversation

### Requirement: Email replies
The system SHALL send a user's reply as an email from the connected address in the same Gmail thread.

#### Scenario: Reply
- **WHEN** a user replies in a `gmail` conversation
- **THEN** the customer receives the reply in the same email thread

### Requirement: Revoked access
When Google rejects the stored grant, the system SHALL set the channel to `disconnected` and emit an event.

#### Scenario: User revokes access in Google
- **WHEN** sync fails because access was revoked
- **THEN** the channel becomes `disconnected` and an event is emitted

### Requirement: Demo Gmail channel
When demo mode is enabled, the demo workspace SHALL have a simulated `gmail` channel seeded with sample email conversations.

#### Scenario: Demo Gmail
- **WHEN** a demo user filters the inbox by Gmail
- **THEN** the seeded email conversations are shown and replies behave like other simulated channels
