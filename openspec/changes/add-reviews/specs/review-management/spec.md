# Spec Delta

## Purpose

Brings a business's Google reviews into the platform so every review can be answered quickly and on-brand, and the business can track its reputation over time.

## ADDED Requirements

### Requirement: Connect Google Business Profile
The system SHALL let a user connect a Google account through Google sign-in and choose which Business Profile locations to manage. The grant SHALL be stored encrypted.

#### Scenario: Choose locations
- **WHEN** a user connects an account with three locations and selects two
- **THEN** only the two selected locations are managed

### Requirement: Review sync
The system SHALL import each managed location's reviews, including rating, text, reviewer display name, date, and existing reply, and SHALL pick up new or edited reviews at least every hour.

#### Scenario: New review
- **WHEN** a customer posts a new Google review
- **THEN** it appears in the platform within an hour and a `review.created` event is emitted

### Requirement: Review list
The system SHALL list reviews newest first, filterable by location, rating, replied or unreplied, and date range.

#### Scenario: Unanswered low ratings
- **WHEN** a user filters by rating 1 to 2 and unreplied
- **THEN** only unreplied 1- and 2-star reviews are returned

### Requirement: AI reply drafts
The system SHALL generate a reply draft for a review using the workspace's chosen agent, its brand tone, and knowledge. The draft SHALL NOT be posted until a user posts it or an auto-reply rule applies.

#### Scenario: Draft for complaint
- **WHEN** a user requests a draft for a 2-star review about slow service
- **THEN** a draft reply that addresses slow service is returned and nothing is posted

### Requirement: Post reply
The system SHALL post a user's reply to Google and record it on the review. Editing an existing reply SHALL replace it on Google.

#### Scenario: Post edited draft
- **WHEN** a user edits a draft and posts it
- **THEN** the reply appears on the Google review and the review is marked replied

#### Scenario: Google rejects reply
- **WHEN** Google rejects the reply
- **THEN** the review stays unreplied and the user receives the error

### Requirement: Auto-reply rule
The system SHALL let a user enable automatic posting of AI replies for reviews at or above a chosen rating, with a minimum threshold of 4 stars. Reviews below the threshold SHALL always require a human to post.

#### Scenario: Five-star review with rule on
- **WHEN** a 5-star review arrives and auto-reply is enabled from 4 stars
- **THEN** an AI reply is posted automatically

#### Scenario: Threshold below 4
- **WHEN** a user tries to set the auto-reply threshold to 3 stars
- **THEN** the system returns a 422 error

### Requirement: Rating summary
The system SHALL report, per location and overall, the average rating, review count, count per star, reply rate, and average rating per month.

#### Scenario: Monthly trend
- **WHEN** a user opens the reputation summary
- **THEN** the average rating for each of the last 12 months is shown
