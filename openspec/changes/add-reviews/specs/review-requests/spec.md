# Spec Delta

## Purpose

Helps a business collect more genuine Google reviews by asking every customer, while giving unhappy customers a private way to reach the business so problems can be resolved.

## ADDED Requirements

### Requirement: Send review requests
The system SHALL let a user send a review request to one contact, or to a segment, through a chosen channel. Each request SHALL contain a unique feedback link. The system SHALL also let a user enable automatically sending a request when a conversation is closed.

#### Scenario: Request after visit
- **WHEN** a user sends a review request to a contact on WhatsApp
- **THEN** the contact receives a message with their unique feedback link

#### Scenario: Auto on close
- **WHEN** auto-request on close is enabled and a user closes a conversation
- **THEN** a review request is sent to that conversation's contact

### Requirement: Request frequency limit
The system SHALL NOT send a contact more than one review request within a configurable period (default 30 days), and SHALL NOT send requests to contacts who opted out.

#### Scenario: Asked last week
- **WHEN** a request is attempted for a contact who received one 7 days ago
- **THEN** it is skipped with reason "recently asked"

### Requirement: Feedback page
The feedback link SHALL open a public page without login that asks for a 1 to 5 star rating. After rating, the page SHALL show a link to leave a review on the business's Google profile to every customer, regardless of the rating. The link SHALL expire after 30 days.

#### Scenario: Five stars
- **WHEN** a customer rates 5 stars
- **THEN** the page shows the Google review link

#### Scenario: Two stars
- **WHEN** a customer rates 2 stars
- **THEN** the page shows the Google review link and also offers a private feedback form

#### Scenario: Expired link
- **WHEN** a customer opens a link older than 30 days
- **THEN** the page says the link has expired and records nothing

### Requirement: No review gating
The system SHALL NOT hide, delay, or de-emphasize the Google review link based on the customer's rating, and SHALL NOT offer incentives for reviews.

#### Scenario: Low rating still sees Google link
- **WHEN** a customer rates 1 star
- **THEN** the Google review link is shown as visibly as for a 5-star rating

### Requirement: Private feedback
For ratings at or below a configurable threshold (default 3), the system SHALL offer a private feedback form. Submitted feedback SHALL be stored with the rating and contact, SHALL open or update an inbox conversation with that contact, and SHALL emit a `feedback.created` event.

#### Scenario: Customer explains problem
- **WHEN** a 2-star customer submits "my order was cold"
- **THEN** the feedback is stored, appears in the unified inbox for follow-up, and an event is emitted

### Requirement: Request funnel stats
The system SHALL report, for a date range, how many requests were sent, opened, rated, clicked through to Google, and answered with private feedback, plus the rating distribution.

#### Scenario: Monthly funnel
- **WHEN** a user views request stats for last month
- **THEN** each funnel count and the rating distribution for that month are returned
