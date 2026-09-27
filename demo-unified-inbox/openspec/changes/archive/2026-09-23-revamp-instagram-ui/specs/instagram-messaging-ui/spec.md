# Spec Delta

## Purpose

Defines the core interface elements, layout, and empty states for the Instagram messaging experience on desktop and tablet.

## ADDED Requirements

### Requirement: Layout and Navigation
The system SHALL provide a layout consisting of a side navigation rail, a messages list panel, and a main chat area. On desktop, the side navigation rail SHALL be capable of collapsing to an icon-only view to maximize chat space.

#### Scenario: Viewing messages on desktop
- **WHEN** the user opens the Instagram messaging interface on a desktop viewport
- **THEN** the layout shows a collapsed icon-only navigation rail on the far left, a messages list panel in the middle, and the chat area on the right.

### Requirement: Messages List Header and Tabs
The messages list SHALL display the user's username with a dropdown chevron, a "compose message" icon, and three tabs labeled "Primary", "General", and "Requests".

#### Scenario: Navigating the messages list
- **WHEN** the user views the messages list panel
- **THEN** they see the "Primary", "General", and "Requests" tabs below the username header.

### Requirement: Notes Section
The system SHALL display a horizontally scrolling "Notes" section containing avatars and note bubbles above the conversation list.

#### Scenario: Viewing Notes
- **WHEN** the user looks at the top of the messages list
- **THEN** a horizontally scrollable list of avatars with short text notes is visible.

### Requirement: Empty Chat State
When no conversation is selected, the main chat area SHALL display a specific empty state featuring an outlined airplane/direct message icon, the text "Your messages", the subtext "Send a message to start a chat.", and a "Send message" button.

#### Scenario: No conversation selected
- **WHEN** the user navigates to the messages interface without an active conversation
- **THEN** the main area displays the correct empty state icon, text, and button.
