# Spec Delta

## Purpose

Lets a business create an AI customer-service agent from its business profile and keep improving it through edits and plain-language feedback, with every change versioned and reversible.

## ADDED Requirements

### Requirement: Profiling questions
The system SHALL accept a business profile (name, type, location, offerings, working hours) and return follow-up questions tailored to that business type, each with a field id, question text, UI type, options where applicable, and whether it is required.

#### Scenario: Niche business type
- **WHEN** a profile for a "Dental Clinic" is submitted
- **THEN** the returned questions include industry-specific topics such as accepted insurance or emergency hours

### Requirement: Generate agent
The system SHALL generate an agent from a business profile, answers to profiling questions, and optional setup preferences (agent name, personality, business objective, rules). The generated agent SHALL have a name, system prompt, greeting message, and a list of knowledge skills, and SHALL be stored as version 1 of a new workspace agent.

#### Scenario: Generate with setup preferences
- **WHEN** a user submits a profile, answers, and setup preferences
- **THEN** a new agent is stored whose version 1 reflects the given name, personality, objective, and rules

#### Scenario: Generate without setup preferences
- **WHEN** a user submits a profile and answers without setup preferences
- **THEN** the system chooses a suitable name, tone, and prompt for the business

#### Scenario: AI provider unavailable
- **WHEN** the AI provider fails or times out during generation
- **THEN** the system returns a 502 error and stores no agent

### Requirement: Manual edit creates a version
The system SHALL let a user edit an agent's system prompt, greeting, personality, rules, and skills. Each saved edit SHALL create a new version; earlier versions SHALL remain unchanged.

#### Scenario: Edit prompt
- **WHEN** a user saves a changed system prompt for an agent at version 3
- **THEN** version 4 is created with the new prompt and version 3 is still retrievable

### Requirement: Refine by feedback
The system SHALL accept plain-language feedback about an agent (for example "be more formal" or "always mention free parking") and produce a revised system prompt as a new version that is not active until the user activates it.

#### Scenario: Feedback produces draft
- **WHEN** a user submits feedback for an agent whose active version is 2
- **THEN** version 3 is created with a revised prompt, and version 2 remains active

### Requirement: Versions and activation
Each agent SHALL have exactly one active version. The system SHALL list an agent's versions newest first and let a user activate any version.

#### Scenario: Roll back
- **WHEN** a user activates version 1 of an agent whose active version is 4
- **THEN** version 1 becomes active and versions 2 to 4 are kept

### Requirement: Multiple agents per workspace
A workspace SHALL be able to hold multiple agents, and the system SHALL let a user list, rename, and delete them.

#### Scenario: Delete agent
- **WHEN** a user deletes an agent
- **THEN** the agent and all its versions are removed and no longer listed
