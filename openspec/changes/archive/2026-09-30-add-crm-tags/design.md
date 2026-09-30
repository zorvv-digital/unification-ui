# Design

## Context

- `Contact` has `name`, `username`, `avatar`, `phone` and `email`. A new contact is created for every new conversation, except Gmail, which reuses contacts by email. `ConversationResponse` embeds the contact, and live `conversation.updated` events now replace the contact on the client.
- The inbox's contact panel shows hard-coded "Customer / VIP" tags and a mock note. The sidebar's **Contacts** item goes nowhere.
- SQLite runs without `PRAGMA foreign_keys`, so `ondelete=CASCADE` is not enforced. Association rows must be deleted explicitly.
- There is no `python-multipart`, so file uploads would need a new dependency.

## Goals / Non-Goals

**Goals:**
- Editable customer profiles (dates, notes, consent), tags, search, merge, CSV import, and saved dynamic segments with previews. All of these are usable from the inbox and from a Contacts page.
- A segment evaluation that `add-campaigns` can call later: `SegmentService.members(db, workspace_id, rules)`.

**Non-Goals:**
- Custom fields.
- Automatic duplicate detection. Merging is manual.
- Import mapping UI. The columns are fixed.
- Consent capture from customers. Staff record it for now.

## Decisions

### 1. Data model
- **`Contact`** gains `birthday`, `anniversary` (`Date`), `notes` (`Text`), `consent` (`opted_in | opted_out | unknown`, default `unknown`) and `consent_changed_at`.
- **`Tag`** has `workspace_id`, `name`, `name_key` and `color`:
  - `name_key` is the lowercased, trimmed name, with a `UniqueConstraint(workspace_id, name_key)`. The database enforces "unique ignoring case", and the service turns violations into 409.
  - The color is a `#rrggbb` hex value.
- **`contact_tags`** is an association table. `Contact.tags` is `lazy="selectin"`.
  - A new `Contact` starts with `tags=[]`, via `__init__`, so that serializing a just-created contact never triggers an async lazy load.
- **`Segment`** has `workspace_id`, `name` and `rules` (JSON).
- **Deleting explicitly:** deleting a tag, merging contacts and resetting the demo remove `contact_tags` rows themselves, because foreign keys are not enforced.
- *Migration:* delete `backend/unification.db*` once.

### 2. Contacts API (`/contacts`)
| Endpoint | Behavior |
|---|---|
| `GET /contacts?q=&tag_ids=` | Workspace contacts as `ContactListItem`: the contact plus `platforms` and `last_activity_at` (the latest `last_message_at` of their conversations). `q` matches name, phone or email case-insensitively. Several `tag_ids` means the contact has any of them. Most recently active first. |
| `GET /contacts/{id}` | Unchanged, but the contact now includes the new fields and `tags`. |
| `PATCH /contacts/{id}` | `name`, `phone`, `email` (checked against the email pattern, otherwise 422 and nothing changes), `birthday`, `anniversary`, `notes`, `consent`. `consent_changed_at` is set when the consent actually changes. |
| `POST /contacts/{id}/tags/{tag_id}` and `DELETE /contacts/{id}/tags/{tag_id}` | Assign or remove a tag. Both are idempotent. |
| `POST /contacts/{id}/merge` `{source_contact_id}` | See 4. |
| `POST /contacts/import` `{csv}` | See 5. |

- Every change publishes `conversation.updated` for each of the contact's conversations, so the inbox list and contact panel update live.

### 3. Tags API (`/tags`)
- `GET` lists the workspace's tags.
- `POST {name, color?}` creates a tag, or returns 409 for a duplicate ignoring case.
- `PATCH {name?, color?}` renames or recolors a tag, also with 409 on a duplicate.
- `DELETE` removes the tag from every contact first.

### 4. Merge
Merging the source contact into the target:
- The source's conversations move to the target (`Conversation.contact_id`).
- Tags are combined.
- Empty target fields (`phone`, `email`, `username`, `avatar`, `birthday`, `anniversary`, `notes`) are filled from the source. Consent is taken from the source only if the target's is `unknown`.
- The source is deleted.
- The request returns the target. Merging a contact into itself returns 400.

### 5. CSV import
- The body is JSON `{"csv": "<text>"}`, not a multipart upload: the browser reads the file, which avoids adding `python-multipart`.
- Columns are matched by header name, ignoring case and order: `name`, `phone`, `email`, `birthday`, `anniversary` and `tags`. Dates are `YYYY-MM-DD`, and tags are separated by `;`.
- For each row:
  - it updates an existing contact matched by phone (digits only) or by email (ignoring case);
  - otherwise it creates a contact, which needs a name, phone or email;
  - missing tags are created.
- Invalid rows, such as a bad date or email or an empty row, are skipped.
- The response is `{created, updated, skipped: [{row, reason}]}`. Row numbers count the header as row 1.

### 6. Segments (`/segments`)
- **Rules:**
  - `tags` + `tags_match` (`any`, the default, or `all`);
  - `exclude_tags`;
  - `platforms`;
  - `active_within_days`;
  - `consent` (a list);
  - `birthday_within_days`: the next birthday falls within N days, counting today, with 29 February treated as 1 March in other years. The proposal lists "upcoming birthday", which birthday campaigns need.
- An empty rule set matches every contact.
- **Endpoints:**
  - CRUD at `/segments`, with names unique per workspace (409);
  - `GET /segments/{id}/members?limit=&offset=` → `{count, members}`;
  - `POST /segments/preview {rules, limit, offset}` → `{count, members}`, which saves nothing;
  - `GET /segments` includes each segment's current `count`.
- **Evaluation:** `SegmentService.members` evaluates the rules in Python over the workspace's contacts, which are loaded with their tags and conversation platforms and activity. Membership is always computed when used and never stored. *Ceiling:* it is O(contacts) per evaluation. Translate the rules to SQL when workspaces reach tens of thousands of contacts.

### 7. Demo
- The seed adds the tags VIP, Regular and Bridal, and assigns some of them to seeded contacts.
- Reset deletes tags, contact tags and segments before reseeding.

### 8. Frontend (inbox theme)
- **Contact panel:**
  - The real tags appear as colored chips with a remove button. **Add** opens a picker of existing tags plus "Create tag".
  - **Edit** turns the details into a form: name, phone, email, birthday, anniversary, consent and notes.
  - The notes section shows the real notes.
  - **Merge** opens a searchable list of other contacts. The chosen one is merged into the current contact.
  - Errors are shown inline.
- **`/contacts` page** (the sidebar's **Contacts** item), with two tabs:
  - **Contacts:** search, tag filter chips, a table (name, channels, phone, email, tags, last active), **Import CSV** (a file input read as text, then a result summary with the skipped rows) and **Manage tags** (create, rename, recolor, delete).
  - **Segments:** a rule builder with a live count and the first members, previewed as the rules change. You can save it under a name. Saved segments are listed with their counts, and can be opened or deleted.
