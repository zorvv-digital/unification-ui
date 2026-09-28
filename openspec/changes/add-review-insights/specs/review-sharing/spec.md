# Spec Delta

## Purpose

Turns a business's best public reviews into marketing by displaying them on its website and posting them to its social accounts.

## ADDED Requirements

### Requirement: Only public reviews are shared
Only Google reviews SHALL be shareable. Private feedback and feedback-page ratings SHALL never be shown in the widget or posted to social media.

#### Scenario: Private feedback
- **WHEN** a user tries to share a private feedback entry
- **THEN** the system returns a 422 error

### Requirement: Website review widget
The system SHALL provide an embeddable public widget per workspace showing Google reviews that meet a minimum rating or were hand-picked, with the reviewer name, rating, text, and date as posted on Google.

#### Scenario: Minimum rating 4
- **WHEN** the widget is configured with minimum rating 4
- **THEN** it shows only 4- and 5-star reviews

#### Scenario: Review removed on Google
- **WHEN** a shown review is deleted on Google and the next sync runs
- **THEN** the widget no longer shows it

### Requirement: Social sharing
The system SHALL let a user share a Google review to the connected Facebook Page and Instagram account as a post with a generated review image and caption. Sharing SHALL work either after manual approval or automatically for reviews at or above a chosen rating.

#### Scenario: Auto-share five stars
- **WHEN** auto-share is on for 5 stars and a 5-star review arrives
- **THEN** a post with the review image is published to the connected Page and Instagram account

#### Scenario: Approval mode
- **WHEN** approval mode is on and a qualifying review arrives
- **THEN** a pending share is created and nothing is published until a user approves it

#### Scenario: Not connected
- **WHEN** a user shares a review but no Page is connected
- **THEN** the system returns a 409 error explaining that a Facebook Page must be connected
