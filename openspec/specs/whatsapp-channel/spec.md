# whatsapp-channel Specification

## Purpose
Connects a business's real WhatsApp number to the unified inbox through Meta's official WhatsApp Cloud API, so customer WhatsApp chats are received and answered from the platform.

## Requirements

### Requirement: Connect WhatsApp number
The system SHALL let a user connect a WhatsApp channel by providing the phone number id, WhatsApp Business Account id, access token, and app secret. The system SHALL verify the credentials with Meta before saving and SHALL store the token and secret encrypted.

#### Scenario: Valid credentials
- **WHEN** a user submits credentials that Meta accepts
- **THEN** the channel is saved with status `connected` and a webhook URL and verify token are returned for the user to register in Meta

#### Scenario: Invalid credentials
- **WHEN** Meta rejects the submitted credentials
- **THEN** the system returns a 400 error and saves nothing

### Requirement: Webhook verification
The system SHALL answer Meta's webhook verification request with the challenge value only when the verify token matches the channel's verify token.

#### Scenario: Wrong verify token
- **WHEN** a verification request arrives with a verify token that does not match
- **THEN** the system returns a 403 error

### Requirement: Signed inbound events
The system SHALL accept inbound events only when their HMAC-SHA256 signature matches the channel's app secret, and SHALL turn text, image, audio, video, and document messages into inbound inbox messages.

#### Scenario: Valid text message
- **WHEN** Meta posts a correctly signed event containing a customer text message
- **THEN** the message appears in the unified inbox on the WhatsApp conversation for that customer's phone number

#### Scenario: Bad signature
- **WHEN** an event arrives with a missing or wrong signature
- **THEN** the system returns a 401 error and stores nothing

### Requirement: Delivery status updates
The system SHALL update an outbound message's status to `sent`, `delivered`, `read`, or `failed` when Meta reports that status, and SHALL emit a live event for the change.

#### Scenario: Customer reads message
- **WHEN** Meta reports an outbound message as read
- **THEN** that message's status becomes `read`

### Requirement: Outbound messages
The system SHALL send text and media messages through the Cloud API and store Meta's message id on the message.

#### Scenario: Send text within window
- **WHEN** a user replies to a customer who wrote within the last 24 hours
- **THEN** the message is delivered through the Cloud API and stored with Meta's message id

### Requirement: 24-hour customer service window
The system SHALL reject a free-form outbound message when the customer's last inbound message is older than 24 hours, with an error that tells the user to send a template instead.

#### Scenario: Window expired
- **WHEN** a user sends free-form text to a customer whose last message was 30 hours ago
- **THEN** the system returns a 409 error explaining that a template is required, and nothing is sent

### Requirement: Message templates
The system SHALL list the channel's Meta-approved templates and SHALL send a chosen template with its parameters to a contact, whether or not the 24-hour window is open.

#### Scenario: Send template outside window
- **WHEN** a user sends an approved template with all required parameters to a customer outside the window
- **THEN** the template message is delivered and appears in the conversation

#### Scenario: Missing parameter
- **WHEN** a user sends a template without a required parameter
- **THEN** the system returns a 422 error and nothing is sent

### Requirement: Disconnect
The system SHALL let a user disconnect a WhatsApp channel, deleting its stored secrets while keeping existing conversations readable.

#### Scenario: Disconnect
- **WHEN** a user disconnects the channel
- **THEN** its secrets are deleted, new inbound events are rejected, and past conversations remain in the inbox
