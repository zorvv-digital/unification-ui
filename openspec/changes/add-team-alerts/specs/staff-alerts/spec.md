# Spec Delta

## Purpose

Notifies team members on their phones in real time when a customer or review needs attention, according to each person's preferences.

## ADDED Requirements

### Requirement: Device registration
The system SHALL let a logged-in user register and unregister a mobile device push token. Logging out on a device SHALL unregister its token.

#### Scenario: Register device
- **WHEN** a user registers a push token from the mobile app
- **THEN** alerts for that user are delivered to that device

### Requirement: Alert preferences
Each user SHALL be able to turn each alert type on or off: new customer message, conversation assigned to me, AI handoff needed, negative review (1 to 2 stars), and private feedback. All types SHALL be on by default.

#### Scenario: Mute new messages
- **WHEN** a user turns off new customer message alerts
- **THEN** they receive no push for new messages but still receive other enabled alerts

### Requirement: Alert routing
New message and AI handoff alerts for an assigned conversation SHALL go only to its assignee; for an unassigned conversation they SHALL go to all members. Review and feedback alerts SHALL go to all members. The user who caused an event SHALL NOT be alerted about it.

#### Scenario: Assigned conversation
- **WHEN** a customer writes in a conversation assigned to Meera
- **THEN** only Meera receives the new message alert

#### Scenario: Negative review
- **WHEN** a 1-star Google review arrives
- **THEN** every member with negative review alerts enabled receives a push

### Requirement: Push content and invalid tokens
Each push SHALL include a short title, a preview of at most 100 characters, and the id of the related conversation or review. Tokens that the push service reports as invalid SHALL be removed.

#### Scenario: Uninstalled app
- **WHEN** the push service reports a token as unregistered
- **THEN** the token is deleted and not used again
