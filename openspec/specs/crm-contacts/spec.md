# crm-contacts Specification

## Purpose
Turns inbox contacts into a customer database the business can enrich, tag, search, and import into, as the foundation for targeted marketing.

## Requirements

### Requirement: Contact profile
The system SHALL let a user edit a contact's name, phone, email, birthday, anniversary, and notes. Birthday and anniversary SHALL be calendar dates without time.

#### Scenario: Add birthday
- **WHEN** a user sets a contact's birthday to 14 March
- **THEN** the contact's profile shows the birthday

#### Scenario: Invalid email
- **WHEN** a user saves a malformed email
- **THEN** the system returns a 422 error and the contact is unchanged

### Requirement: Marketing consent
Each contact SHALL have a marketing consent status of `opted_in`, `opted_out`, or `unknown`, with the time it last changed.

#### Scenario: Record opt-in
- **WHEN** a user marks a contact as `opted_in`
- **THEN** the status and change time are stored

### Requirement: Tags
The system SHALL let a user create, rename, recolor, and delete tags, and assign or remove tags on contacts. Tag names SHALL be unique per workspace, ignoring case.

#### Scenario: Duplicate tag name
- **WHEN** a user creates tag "VIP" and a tag "vip" already exists
- **THEN** the system returns a 409 error

#### Scenario: Delete tag
- **WHEN** a user deletes a tag
- **THEN** it is removed from all contacts

### Requirement: Contact search
The system SHALL let a user search contacts by name, phone, or email text and filter by one or more tags.

#### Scenario: Filter by tag
- **WHEN** a user filters contacts by tag "VIP"
- **THEN** only contacts with the "VIP" tag are returned

### Requirement: Merge contacts
The system SHALL let a user merge one contact into another. The merged contact's conversations and tags SHALL move to the target, empty profile fields on the target SHALL be filled from the merged contact, and the merged contact SHALL be removed.

#### Scenario: Same customer on WhatsApp and Instagram
- **WHEN** a user merges the Instagram contact into the WhatsApp contact
- **THEN** the WhatsApp contact shows both conversations and the Instagram contact no longer exists

### Requirement: CSV import
The system SHALL import contacts from a CSV with columns for name, phone, email, birthday, anniversary, and tags. Rows matching an existing contact by phone or email SHALL update it; invalid rows SHALL be skipped and reported with their row numbers.

#### Scenario: Mixed file
- **WHEN** a user imports 100 rows where 3 have invalid dates
- **THEN** 97 contacts are created or updated and the response lists the 3 skipped row numbers with reasons
