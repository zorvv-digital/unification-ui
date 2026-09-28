# Spec Delta

## Purpose

Links customer feedback to the staff who served them, so the business can recognize strong performers and coach where customers are unhappy.

## ADDED Requirements

### Requirement: Staff members
The system SHALL let a user add, edit, deactivate, and list staff members with a name and role. Staff members SHALL NOT need a platform login.

#### Scenario: Add staff
- **WHEN** a user adds "Ravi, Stylist"
- **THEN** Ravi is listed as an active staff member

### Requirement: Attribution on requests and feedback
The system SHALL let the sender choose a staff member when sending a review request, and SHALL let the business optionally show a "who served you?" choice of active staff on the feedback page. The chosen staff member SHALL be recorded on the rating and any private feedback.

#### Scenario: Customer picks staff
- **WHEN** a customer selects Ravi on the feedback page and rates 5 stars
- **THEN** the 5-star rating is attributed to Ravi

### Requirement: Mentions in Google reviews
The system SHALL attribute a Google review to an active staff member when the review text contains the staff member's name as a whole word, ignoring case, and SHALL mark it as a mention.

#### Scenario: Name in review
- **WHEN** a review says "ravi did an amazing job"
- **THEN** the review is attributed to Ravi as a mention

### Requirement: Staff metrics
The system SHALL report, per staff member for a chosen period, the number of attributed ratings, average rating, counts of positive (4 to 5) and negative (1 to 2) ratings, private feedback count, and mention count, and SHALL rank staff by average rating with a minimum of 5 ratings to be ranked.

#### Scenario: Leaderboard
- **WHEN** a user views last month's leaderboard
- **THEN** staff with at least 5 ratings are ranked by average rating and others are listed as "not enough ratings"
