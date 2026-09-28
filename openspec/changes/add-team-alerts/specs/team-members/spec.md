# Spec Delta

## Purpose

Lets a business run the platform as a team, with owners controlling setup and agents handling customer conversations assigned to them.

## ADDED Requirements

### Requirement: Roles
Each user SHALL have the role `owner` or `agent`. The user who registers a workspace SHALL be an owner. Only owners SHALL manage channels, team members, AI agents, and workspace settings.

#### Scenario: Agent changes channel
- **WHEN** an agent tries to connect or disconnect a channel
- **THEN** the system returns a 403 error

#### Scenario: Agent uses inbox
- **WHEN** an agent lists conversations and replies
- **THEN** the actions succeed

### Requirement: Invitations
The system SHALL let an owner invite a person by email with a role. The invite SHALL contain a single-use link that expires after 7 days; accepting it SHALL create the user with a password of their choice.

#### Scenario: Accept invite
- **WHEN** an invited person opens a valid link and sets a password
- **THEN** they become a member with the invited role and can log in

#### Scenario: Expired invite
- **WHEN** an invite link older than 7 days is used
- **THEN** the system returns a 410 error and creates no user

### Requirement: Remove member
The system SHALL let an owner remove a member, after which the member's existing access tokens SHALL be rejected. A workspace SHALL always keep at least one owner.

#### Scenario: Removed member's token
- **WHEN** a removed member calls the API with a previously issued token
- **THEN** the system returns a 401 error

#### Scenario: Last owner
- **WHEN** the only owner tries to remove themselves or change their role to agent
- **THEN** the system returns a 409 error

### Requirement: Conversation assignment
The system SHALL let a user assign a conversation to any member or leave it unassigned, and SHALL let users filter conversations by assignee, including "assigned to me" and "unassigned".

#### Scenario: Assigned to me
- **WHEN** a member filters by "assigned to me"
- **THEN** only conversations assigned to that member are returned
