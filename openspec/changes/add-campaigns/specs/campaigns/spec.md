# Spec Delta

## Purpose

Lets a business send targeted promotions and automatic birthday and anniversary greetings to consenting customers, and measure the results.

## ADDED Requirements

### Requirement: Workspace timezone
Each workspace SHALL have a timezone (default UTC) that an owner can change. All campaign schedules and automation send times SHALL be interpreted in it.

#### Scenario: Set timezone
- **WHEN** an owner sets the timezone to Asia/Kolkata
- **THEN** a campaign scheduled for 10:00 is sent at 10:00 Asia/Kolkata time

### Requirement: Broadcast campaign
The system SHALL let a user create a campaign with a name, a segment, a channel, a message (an approved template with parameters for WhatsApp), and either immediate or scheduled start.

#### Scenario: Schedule campaign
- **WHEN** a user schedules a campaign for tomorrow 10:00
- **THEN** the campaign is stored as `scheduled` and starts sending at that time

#### Scenario: Schedule in the past
- **WHEN** a user schedules a campaign for a time that has passed
- **THEN** the system returns a 422 error

### Requirement: Recipient eligibility
When a campaign starts, the system SHALL resolve the segment and send only to contacts with consent `opted_in` who are reachable on the campaign's channel. Other members SHALL be recorded as skipped with a reason.

#### Scenario: Mixed consent
- **WHEN** a campaign's segment has 50 members, 40 opted in with WhatsApp numbers and 10 opted out
- **THEN** 40 messages are sent and 10 recipients are recorded as skipped for consent

### Requirement: Personalization
The system SHALL replace variables such as `{first_name}` in the message with each recipient's data, and SHALL use a fallback value set on the campaign when the data is missing.

#### Scenario: Missing name
- **WHEN** a recipient has no name and the fallback is "there"
- **THEN** the message reads "Hi there"

### Requirement: Delivery tracking and stats
The system SHALL track each recipient's status (`pending`, `sent`, `delivered`, `read`, `failed`, `skipped`) and whether they replied, and SHALL report totals per campaign. Replies SHALL arrive in the unified inbox as normal conversations.

#### Scenario: View results
- **WHEN** a user opens a finished campaign
- **THEN** the totals for targeted, sent, delivered, read, failed, skipped, and replied are shown

### Requirement: Cancel
The system SHALL let a user cancel a campaign before it starts, or stop one in progress, leaving unsent recipients unsent.

#### Scenario: Stop mid-send
- **WHEN** a user stops a campaign after 100 of 500 messages are sent
- **THEN** the remaining 400 are not sent and the campaign status is `stopped`

### Requirement: Birthday and anniversary automations
The system SHALL let a user enable a birthday automation and an anniversary automation, each with a message, channel, and local send time. Each opted-in contact SHALL receive at most one message per occasion per year. Contacts born on 29 February SHALL be greeted on 28 February in non-leap years.

#### Scenario: Birthday today
- **WHEN** the send time arrives on a contact's birthday and the contact is opted in
- **THEN** the birthday message is sent to them once

#### Scenario: Leap-day birthday
- **WHEN** it is 28 February in a non-leap year
- **THEN** contacts with a 29 February birthday receive the birthday message

### Requirement: Opt-out keywords
When an inbound message consists only of a configured opt-out keyword (default "STOP", ignoring case and surrounding spaces), the system SHALL set the contact's consent to `opted_out` and send a confirmation.

#### Scenario: Customer replies STOP
- **WHEN** a customer replies "stop"
- **THEN** their consent becomes `opted_out` and they are excluded from future campaigns and automations
