# Spec Delta

## Purpose

Gives the business a safe place to talk to its agent, try unreleased versions, and see the effect of changes before customers do.

## ADDED Requirements

### Requirement: Test chat
The system SHALL let a user send a message to a chosen agent version, or to the active version when none is chosen, and return the agent's reply.

#### Scenario: Test draft version
- **WHEN** a user chats with an inactive version 3 of an agent
- **THEN** the reply is generated with version 3's prompt and skills

### Requirement: Multi-turn sessions
The system SHALL keep conversation context within a playground session id and SHALL let a user start a new session.

#### Scenario: Follow-up question
- **WHEN** a user asks "what are your hours?" then "and on Sunday?" in the same session
- **THEN** the second answer is about Sunday hours

#### Scenario: New session
- **WHEN** a user starts a new session
- **THEN** the agent has no memory of the previous session's messages

### Requirement: Isolation from customers
Playground messages SHALL NOT be sent to any channel, SHALL NOT appear in the unified inbox, and SHALL NOT change contacts or conversations.

#### Scenario: Playground chat
- **WHEN** a user exchanges messages in the playground
- **THEN** no conversation, contact, or channel delivery is created

### Requirement: AI failure
When the AI provider fails, the system SHALL return a 502 error and keep the session usable for the next message.

#### Scenario: Provider timeout
- **WHEN** the AI provider times out on a playground message
- **THEN** the user receives a 502 error and can send another message in the same session
