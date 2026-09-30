# Tasks

## 1. Contacts

- [x] 1.1 Write API tests for contact profile editing (birthday/anniversary dates, notes, consent with change time, malformed email 422 unchanged, other workspace 404) and search (`q`, tag filter, platforms and last activity); add the columns and implement until they pass

## 2. Tags

- [x] 2.1 Write API tests for tag CRUD (duplicate ignoring case 409 on create and rename; delete removes from contacts) and assigning/removing tags on contacts (idempotent, live `conversation.updated`); implement until they pass

## 3. Merge and import

- [x] 3.1 Write API tests for merge (conversations and tags move, empty fields filled, source deleted, self-merge 400) and CSV import (create, update by phone/email, tags created, invalid rows skipped with row numbers and reasons); implement until they pass

## 4. Segments

- [x] 4.1 Write API tests for segment rules (tags any/all, excluded tags, platforms, active within days, consent, upcoming birthday incl. year wrap), dynamic membership, preview without saving, CRUD and duplicate names; implement until they pass

## 5. Demo

- [x] 5.1 Seed demo tags on contacts; reset clears tags, contact tags, and segments; update demo tests

## 6. Frontend

- [x] 6.1 Contact panel: real tags (add/create/remove), edit form, notes, merge
- [x] 6.2 Contacts page: search, tag filter, table, CSV import, manage tags; Segments tab with rule builder, live preview, save/list/delete

## 7. Verify and document

- [x] 7.1 Extend the E2E (tag + edit in the inbox, contacts search/filter, import, merge, segment preview and save); run the full E2E
- [x] 7.2 Update `docs/api-testing-swagger.md` and `docs/ui-user-flow.md`
- [x] 7.3 Validate, archive, commit, and push `feature/add-crm-tags`
