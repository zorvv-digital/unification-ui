# website-chat Specification

## Purpose
Lets website visitors chat with the business through an embeddable widget, with conversations handled in the unified inbox and visitor details captured as leads.

## Requirements

### Requirement: Widget configuration
The system SHALL give each website channel a public widget key, an embed snippet, a list of allowed domains, a greeting, and which lead fields (name, email, phone) to ask for.

#### Scenario: Get embed snippet
- **WHEN** a user opens their website channel settings
- **THEN** the embed snippet containing the widget key is returned

### Requirement: Allowed domains
Widget requests SHALL be accepted only from the channel's allowed domains.

#### Scenario: Unlisted domain
- **WHEN** a widget request comes from a domain not in the allowed list
- **THEN** the system returns a 403 error

### Requirement: Visitor session
The system SHALL issue an anonymous visitor session token on first contact. Messages sent with that token SHALL belong to one contact and one `website` conversation.

#### Scenario: First message
- **WHEN** a new visitor sends "Hi, are you open today?"
- **THEN** a contact and a `website` conversation are created and the message appears in the unified inbox

#### Scenario: Returning visitor
- **WHEN** a visitor returns with the same session token
- **THEN** the widget shows their earlier messages and new messages join the same conversation

### Requirement: Live replies to visitor
The system SHALL push staff and AI replies to the visitor's open widget in real time.

#### Scenario: Staff replies
- **WHEN** a staff member replies in a website conversation while the visitor's widget is open
- **THEN** the reply appears in the widget without a page reload

### Requirement: Lead capture
The system SHALL let the visitor submit the configured lead fields and SHALL save them on the contact.

#### Scenario: Visitor leaves details
- **WHEN** a visitor submits name "Priya" and phone "+91 98765 43210"
- **THEN** the contact's name and phone are updated and visible in the inbox contact panel

#### Scenario: Invalid email
- **WHEN** a visitor submits a malformed email
- **THEN** the system returns a 422 error and the contact is unchanged

### Requirement: Abuse protection
The system SHALL limit each visitor session to 20 messages per minute and SHALL limit message length to 2,000 characters.

#### Scenario: Flooding
- **WHEN** a visitor session sends a 21st message within one minute
- **THEN** the system returns a 429 error and does not store it

### Requirement: Demo website channel
When demo mode is enabled, the demo workspace SHALL have a website channel and the system SHALL serve a demo page with the widget embedded.

#### Scenario: Demo chat
- **WHEN** someone chats on the demo page
- **THEN** the conversation appears in the demo workspace inbox
