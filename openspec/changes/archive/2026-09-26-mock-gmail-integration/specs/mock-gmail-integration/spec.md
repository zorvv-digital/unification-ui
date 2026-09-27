# Spec Delta

## Purpose
Provides a mocked integration of Gmail inside the unified inbox to demonstrate read and write capabilities without a real backend.

## ADDED Requirements

### Requirement: Initialize with Mock Data
The system SHALL populate the local state with a predefined set of mock Gmail messages when the application loads.

#### Scenario: App initialization
- **WHEN** the application is started
- **THEN** a batch of mock Gmail messages is immediately available in the unified inbox view

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

### Requirement: Fake Message Sending
The system SHALL simulate sending a message by appending the composed message to the local state, making it immediately visible in the UI.

#### Scenario: User replies to a mock message
- **WHEN** the user writes a reply and clicks send
- **THEN** the message is added to the thread in local state and immediately appears in the UI
