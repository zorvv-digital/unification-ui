# ai-replies Specification

## Purpose
Lets an AI agent answer customer conversations automatically, around the clock, while staff stay in control and can take over any conversation.

## Requirements

### Requirement: Auto-reply settings per channel
The system SHALL let a user enable or disable AI auto-reply for each channel and choose which workspace agent answers on it.

#### Scenario: Enable on WhatsApp only
- **WHEN** a user enables auto-reply on the WhatsApp channel and leaves Instagram disabled
- **THEN** inbound WhatsApp messages get AI replies and inbound Instagram messages do not

### Requirement: Conversation mode
Each conversation SHALL be in `ai` or `human` mode. New conversations on auto-reply channels SHALL start in `ai` mode; others SHALL start in `human` mode.

#### Scenario: AI answers inbound message
- **WHEN** a customer message arrives on a conversation in `ai` mode
- **THEN** the chosen agent's active version generates a reply using the conversation's recent messages, and the reply is sent as an outbound message marked as authored by the agent

#### Scenario: Human mode
- **WHEN** a customer message arrives on a conversation in `human` mode
- **THEN** no AI reply is sent

### Requirement: Human takeover and hand-back
A staff member sending a message in a conversation SHALL switch it to `human` mode. The system SHALL let a user switch a conversation back to `ai` mode.

#### Scenario: Staff replies
- **WHEN** a staff member sends a message in an `ai` mode conversation
- **THEN** the conversation switches to `human` mode and later customer messages get no AI reply

#### Scenario: Hand back
- **WHEN** a user switches a `human` conversation to `ai`
- **THEN** the next customer message gets an AI reply

### Requirement: Escalation
When the agent cannot answer, or the customer asks for a person, the system SHALL switch the conversation to `human` mode, flag it as needing a human, and emit a `conversation.updated` event.

#### Scenario: Customer asks for a person
- **WHEN** a customer writes "I want to talk to a real person" in an `ai` conversation
- **THEN** the conversation is flagged as needing a human and switched to `human` mode

#### Scenario: AI provider fails
- **WHEN** the AI provider fails while answering
- **THEN** no reply is sent and the conversation is flagged as needing a human

### Requirement: Suggested reply
The system SHALL let a user request an AI-suggested reply for any conversation. The suggestion SHALL be returned to the user and SHALL NOT be sent.

#### Scenario: Suggest
- **WHEN** a user requests a suggested reply
- **THEN** the suggestion text is returned and no message is sent or stored
