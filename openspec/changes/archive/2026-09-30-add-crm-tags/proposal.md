# Proposal

## Why

Targeted marketing needs to know who each customer is and group them. Today a contact is just a name and avatar attached to one channel. The platform needs a real customer record with tags, key dates, and consent, and saved segments that campaigns can target.

## What Changes

- Contacts gain editable profile fields: phone, email, birthday, anniversary, notes, and marketing consent.
- The same customer reached on several channels can be merged into one contact.
- Tags (name + color) can be created and assigned to contacts; contacts can be searched and filtered by tag.
- Contacts can be imported from CSV.
- Segments are saved, dynamic filters (tags, platform, last activity, upcoming birthday) with a live member count.

## Capabilities

### New Capabilities
- `crm-contacts`: Contact profile, consent, merge, tags, search, and CSV import.
- `crm-segments`: Saved dynamic segments with preview.

### Modified Capabilities

None. The `unified-inbox` contact-details requirement still holds; the added fields are covered here.

## Impact

- **Depends on:** `add-inbox-backend`.
- **Backend:** contact columns, tag and contact-tag tables, segment table.
- **Frontend:** contact panel editing and tag chips in `saas inbox`; a contacts/segments page.
