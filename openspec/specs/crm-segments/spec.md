# crm-segments Specification

## Purpose
Lets a business define reusable customer groups by rules, so campaigns always target the right, current set of customers.

## Requirements

### Requirement: Segment rules
The system SHALL let a user save a named segment combining: tags the contact has (any or all of a list), tags the contact must not have, platforms, last activity within N days, and marketing consent status.

#### Scenario: VIPs active this month
- **WHEN** a user saves a segment "has tag VIP and last activity within 30 days"
- **THEN** the segment is stored with those rules

### Requirement: Dynamic membership
Segment membership SHALL be evaluated whenever the segment is used, not stored at creation.

#### Scenario: New VIP
- **WHEN** a contact is tagged "VIP" after the segment was created
- **THEN** the contact is included the next time the segment is used

### Requirement: Preview
The system SHALL return a segment's current member count and a page of its members, both for saved segments and for unsaved rules.

#### Scenario: Preview before saving
- **WHEN** a user previews unsaved rules
- **THEN** the current member count and first page of members are returned without saving anything
