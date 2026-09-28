# unified-inbox Specification

## Purpose
Provides one inbox API for customer conversations from every connected platform, so the business can read, reply to, and track conversations in a single place with live updates.

## Requirements

### Requirement: Supported platforms
Each conversation and message SHALL belong to exactly one platform. The supported platform set SHALL be the platforms for which a channel adapter exists; this change provides `whatsapp`, `instagram`, and `messenger`. All timestamps in responses SHALL be ISO-8601 in UTC.

#### Scenario: Platform added by a new adapter
- **WHEN** a later change adds an adapter for a new platform
- **THEN** conversations on that platform appear in the unified list and are filterable without any change to inbox behavior

#### Scenario: Unknown platform filter
- **WHEN** a client filters conversations by a platform outside the supported set
- **THEN** the system returns a 422 error

### Requirement: List conversations
The system SHALL list the workspace's conversations ordered by most recent message first. Each item SHALL include the conversation id, platform, status (`open` or `closed`), unread count, last message time, a preview of the last message, and the contact's id, name, and avatar.

#### Scenario: Unfiltered list
- **WHEN** a user lists conversations with no filters
- **THEN** all workspace conversations across all platforms are returned, newest activity first

#### Scenario: Filtered by platform and status
- **WHEN** a user lists conversations filtered by `platform=instagram` and `status=open`
- **THEN** only open Instagram conversations are returned

### Requirement: Read conversation messages
The system SHALL return a conversation's messages in chronological order, each with id, direction (`inbound` or `outbound`), type (`text`, `image`, `video`, `audio`, `file`, `emoji`), content, timestamp, and delivery status (`sent`, `delivered`, `read`, `failed`).

#### Scenario: Open a conversation
- **WHEN** a user requests the messages of a conversation in their workspace
- **THEN** all its messages are returned oldest first

### Requirement: Send a message
The system SHALL accept an outbound message for a conversation, store it, deliver it through the conversation's channel, and update the conversation's last message time.

#### Scenario: Successful send
- **WHEN** a user sends non-empty content to an open conversation
- **THEN** the message is stored with direction `outbound` and status `sent`, and is returned to the caller

#### Scenario: Channel delivery fails
- **WHEN** the channel reports a delivery failure for an outbound message
- **THEN** the message remains stored with status `failed` and the response indicates the failure

#### Scenario: Empty content
- **WHEN** a user sends a message with empty or whitespace-only content
- **THEN** the system returns a 422 error and stores nothing

#### Scenario: Closed conversation
- **WHEN** a user sends a message to a closed conversation
- **THEN** the system reopens the conversation and sends the message

### Requirement: Receive a message
The system SHALL store each inbound message delivered by a channel, creating the contact and conversation if this is the first message from that customer on that channel, and SHALL increment the conversation's unread count.

#### Scenario: First message from a new customer
- **WHEN** a channel delivers a message from a customer id not seen before on that channel
- **THEN** a new contact and an open conversation are created, and the message is stored with unread count 1

#### Scenario: Duplicate delivery
- **WHEN** a channel delivers a message whose channel-side message id was already stored
- **THEN** the system ignores the duplicate and the unread count does not change

### Requirement: Read state
The system SHALL let a user mark a conversation as read, setting its unread count to zero and marking its inbound messages as `read`.

#### Scenario: Mark as read
- **WHEN** a user marks a conversation with 3 unread messages as read
- **THEN** its unread count becomes 0 and those inbound messages have status `read`

### Requirement: Conversation status
The system SHALL let a user close and reopen a conversation.

#### Scenario: Close conversation
- **WHEN** a user closes an open conversation
- **THEN** its status becomes `closed` and it is excluded from `status=open` listings

### Requirement: Contact details
The system SHALL return a contact's name, username, avatar, phone, and email, along with the ids of the contact's conversations.

#### Scenario: View contact
- **WHEN** a user requests a contact in their workspace
- **THEN** the contact's details and conversation ids are returned

### Requirement: Live event stream
The system SHALL provide an authenticated server-sent event stream that pushes `message.created` and `conversation.updated` events to connected clients of the same workspace.

#### Scenario: Inbound message while inbox is open
- **WHEN** a customer message is received while a user of that workspace is connected to the stream
- **THEN** the user receives a `message.created` event with the message and a `conversation.updated` event with the new unread count

#### Scenario: Other workspaces receive nothing
- **WHEN** a message is received in workspace A
- **THEN** clients connected for workspace B receive no event for it
