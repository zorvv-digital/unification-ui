# Capability: mock-gmail-integration

## Purpose

Provides a mocked integration of Gmail inside the unified inbox to demonstrate read and write capabilities without a real backend.

## Requirements

### Requirement: Filter by Gmail Integration
The system SHALL provide a view or filter that displays only the mock Gmail messages.

#### Scenario: User selects Gmail view
- **WHEN** the user selects the Gmail filter or tab
- **THEN** the message list updates to show only messages originating from the mocked Gmail integration

### Requirement: Read Mock Messages
The system SHALL display the content, sender, and metadata of mock Gmail messages in the UI.

#### Scenario: User opens a mock message
- **WHEN** the user clicks on a mock Gmail message in the list
- **THEN** the full details of the message are displayed in the detail view
