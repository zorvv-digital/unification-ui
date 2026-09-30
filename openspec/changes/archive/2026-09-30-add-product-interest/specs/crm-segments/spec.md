# Spec Delta

## MODIFIED Requirements

### Requirement: Segment rules
The system SHALL let a user save a named segment combining: tags the contact has (any or all of a list), tags the contact must not have, platforms, last activity within N days, marketing consent status, and products the contact is interested in (any or all of a list).

#### Scenario: VIPs active this month
- **WHEN** a user saves a segment "has tag VIP and last activity within 30 days"
- **THEN** the segment is stored with those rules

#### Scenario: Interested in a product
- **WHEN** a user saves a segment "interested in Sunscreen"
- **THEN** its members are the contacts currently interested in Sunscreen
