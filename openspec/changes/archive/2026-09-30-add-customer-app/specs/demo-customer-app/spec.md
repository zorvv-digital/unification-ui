# Spec Delta

## Purpose

Lets a presenter or prospect chat with the demo business from the customer's side, in screens that look like WhatsApp,
Instagram, Messenger, or Gmail, so demos show real messages flowing into the inbox and replies flowing back.

## ADDED Requirements

### Requirement: Demo-only customer app
The system SHALL provide a public customer app and customer API, without staff login, for the demo workspace only. When
demo mode is off or no demo workspace exists, every customer API request SHALL return a 404 error.

#### Scenario: Open the app
- **WHEN** someone opens the customer app with demo mode on
- **THEN** they see the demo business's name and can choose WhatsApp, Instagram, Messenger, or Gmail, or follow a link
  to the website chat demo page

#### Scenario: Demo mode off
- **WHEN** a customer API request arrives while demo mode is off
- **THEN** the system returns a 404 error and stores nothing

### Requirement: Customer session
The system SHALL start a customer session from a name of 1 to 60 characters and return a session token. Messages sent
with the token SHALL belong to one demo contact and one conversation per platform. The contact SHALL look like a real
customer of that platform in the inbox: WhatsApp contacts get a phone number, Instagram contacts get a username, and
Gmail contacts get an email address.

#### Scenario: Start a session
- **WHEN** a visitor starts a session as "Priya"
- **THEN** the system returns a session token, and nothing appears in the inbox until the first message

#### Scenario: Blank name
- **WHEN** a visitor starts a session with an empty or blank name
- **THEN** the system returns a 422 error

#### Scenario: Returning customer
- **WHEN** the visitor reopens the app on the same device
- **THEN** their session and earlier messages on each platform are shown again

#### Scenario: Invalid token
- **WHEN** a request carries a missing, malformed, or foreign token
- **THEN** the system returns a 401 error, and the app starts a new session

### Requirement: Customer messages reach the inbox
A message sent from the customer app SHALL arrive exactly as a real customer message on the demo workspace's simulated
channel for that platform: it appears in the unified inbox live, raises the unread count, and triggers AI auto-reply
when the channel has it on. A Gmail message SHALL carry a subject, which is required on the first email.

#### Scenario: First WhatsApp message
- **WHEN** "Priya" sends "Do you have a slot on Saturday?" in the WhatsApp screen
- **THEN** a WhatsApp conversation from Priya appears in the inbox with that message and one unread message, without a
  page reload

#### Scenario: AI answers
- **WHEN** the customer app sends a message on a channel with AI auto-reply on
- **THEN** the AI's answer is stored in the conversation, as it is for any customer message

#### Scenario: Gmail subject
- **WHEN** the first Gmail message has no subject
- **THEN** the system returns a 422 error and stores nothing

#### Scenario: Limits
- **WHEN** a message is longer than 2,000 characters, or is the 21st within a minute from one session
- **THEN** the system returns a 422 or 429 error respectively and stores nothing

### Requirement: Live replies and read state
The system SHALL push staff and AI replies to the customer's open app in real time, on the matching platform screen.
When staff open the conversation, the customer's messages SHALL show as read in the app.

#### Scenario: Staff reply
- **WHEN** a staff member replies to Priya's WhatsApp conversation while the customer app is open
- **THEN** the reply appears in the WhatsApp screen without a page reload

#### Scenario: Read receipt
- **WHEN** a staff member opens Priya's conversation in the inbox
- **THEN** Priya's messages show as read in the customer app

#### Scenario: Other customers' replies
- **WHEN** staff reply to a different customer
- **THEN** nothing is pushed to Priya's app

### Requirement: Staff link to the customer app
The inbox SHALL offer a link that opens the customer app in a new tab, shown only to demo workspace users.

#### Scenario: Demo user
- **WHEN** a demo workspace user views the inbox sidebar
- **THEN** a Customer app link is shown and opens the app in a new tab

#### Scenario: Real business
- **WHEN** a non-demo workspace user views the inbox sidebar
- **THEN** no Customer app link is shown

### Requirement: Demo reset and the customer app
A demo reset SHALL remove customer-app conversations and contacts with the rest of the demo data. An existing session
SHALL keep working after a reset and start new conversations.

#### Scenario: Message after reset
- **WHEN** the demo is reset and the customer then sends a new message
- **THEN** the app shows an empty history before the message, and the message starts a new conversation in the inbox
