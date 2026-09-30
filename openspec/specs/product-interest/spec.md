# product-interest Specification

## Purpose
Lets a business define its products and have each customer automatically tagged with the products they are
interested in, decided from that customer's chats by a decision model, with staff able to correct the result.

## Requirements

### Requirement: Product tags
The system SHALL let a user create, list, edit, and delete workspace products with a name (unique ignoring case),
an optional description, up to 20 keywords, and a color. Each product SHALL report how many contacts are interested
in it. Deleting a product SHALL remove it from every contact.

#### Scenario: Create product
- **WHEN** a user creates "Sunscreen" with keywords "sunscreen, spf"
- **THEN** the product is returned with `interested_count` 0

#### Scenario: Duplicate name
- **WHEN** a user creates "sunscreen" while "Sunscreen" exists
- **THEN** the system returns a 409 error

### Requirement: Per-contact product interest
After each inbound customer message, the system SHALL classify that contact's recent messages across all their
conversations against the workspace's products, in the background. Products with a confidence at or above a configurable threshold (default 0.5) SHALL
become interests of the contact, alongside earlier ones. The contact SHALL report `product_status`: `pending` before
any analysis, `determined` with at least one interest, and `not_determined` when analysed without any.

#### Scenario: Customer asks about a product
- **WHEN** a customer writes "Do you have sunscreen for oily skin?" and the workspace has a "Sunscreen" product
- **THEN** the contact becomes interested in Sunscreen with source `ai` and a confidence, and open inboxes receive
  the updated contact live

#### Scenario: Unrelated chat
- **WHEN** a customer only asks "Do you have parking?"
- **THEN** the contact's status is `not_determined`

#### Scenario: Interests accumulate
- **WHEN** a customer interested in Sunscreen later asks about face wash
- **THEN** the contact is interested in both products

#### Scenario: Across channels
- **WHEN** a customer asks about sunscreen on WhatsApp and about face wash by email, as one merged contact
- **THEN** the contact is interested in both

### Requirement: Staff overrides
The system SHALL let a user add a product interest (source `staff`), remove one, and re-run the analysis for a contact.
The analysis SHALL never remove a staff-added interest nor re-add an interest that staff removed.

#### Scenario: Staff removes a wrong interest
- **WHEN** staff remove Sunscreen from a contact and the customer mentions sunscreen again
- **THEN** Sunscreen is not added back

#### Scenario: Re-detect
- **WHEN** staff request re-analysis and the decision model is unavailable
- **THEN** the system returns a 502 error and the contact is unchanged

### Requirement: Filters
The system SHALL let a user list contacts interested in any of given products and contacts by product status.

#### Scenario: Filter by product
- **WHEN** a user lists contacts with the Sunscreen product filter
- **THEN** only contacts interested in Sunscreen are returned

### Requirement: Re-analysis on product changes
When a product is created or edited, the system SHALL re-analyse, in the background, the workspace's contacts that
have customer messages.

#### Scenario: New product tags existing chats
- **WHEN** a user creates "Sunscreen" and a customer asked about sunscreen yesterday
- **THEN** that customer becomes interested in Sunscreen without writing again

### Requirement: Decision provider
Classification SHALL go through a configurable provider: an offline deterministic provider by default and in tests,
and the Laya decision model when configured, asking one yes/no question per product.

#### Scenario: Offline default
- **WHEN** no decision provider is configured
- **THEN** classification works offline by matching product names and keywords
