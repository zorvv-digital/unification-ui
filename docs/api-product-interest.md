# API contract: product tags and customer product interest

**Status: implemented** in the backend (`add-product-interest`). The demo workspace has seeded salon products and
tagged customers.
**Revised 2026-09-30:** decisions are made per contact, not per conversation. The conversation-level
`product_interest` field and `/conversations/{id}/product-interest` endpoints were removed; see §2. The UI
can now run against the real backend. The field names and shapes below are
what the backend will return.

## What the feature does

1. Staff create **product tags**: the products or services the business sells (e.g. *Sunscreen*, *Face wash*,
   *Bridal makeup*). A short description and keywords help the AI recognize them.
2. When a customer chats on any channel, the backend reads **all of that customer's chats** and decides which
   product(s) they are interested in. It uses an AI decision model (Laya).
3. The customer (contact) is then **tagged as interested** in those products. If their chats are not about any
   product, or the AI is unsure, the contact is **not determined**.
4. Staff can correct the result, and staff choices are never overwritten by the AI.
5. Contacts and segments can be filtered by product interest, for example "everyone interested in Sunscreen" for a
   campaign.

## Conventions (same as the rest of the API)

- Base URL is `VITE_API_URL`, e.g. `http://localhost:8000/api/v1`.
- Auth: `Authorization: Bearer <token>` on every endpoint. All data is scoped to the user's workspace.
- JSON uses `snake_case`, ids are UUID strings, and times are ISO 8601 UTC strings (`2026-09-30T10:15:00Z`).
- Errors look like `{"detail": "message"}`. Validation errors (`422`) come as `{"detail": [{"loc": [...], "msg": "..."}]}`.
  Show `detail` as a string, or `detail[0].msg` for a list, which is what `crmApi.ts` already does.
- Live updates arrive over the existing SSE stream (`GET /events?token=...`), which `HttpMessageService` already
  handles.

---

## 1. Product tags

### Types

```ts
export interface Product {
  id: string;
  name: string;               // unique per workspace, ignoring case
  description: string | null; // "SPF 50 sunscreen for oily skin". Helps the AI; optional
  keywords: string[];         // ["sunscreen", "spf", "sunblock"]. Helps the AI; optional
  color: string;              // "#f59e0b" (hex #rrggbb), for chips
  interested_count: number;   // contacts currently interested in this product
  created_at: string;
}
```

### Endpoints

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `GET /products` | none | `200` with `Product[]`, sorted by name | none |
| `POST /products` | `{name, description?, keywords?, color?}` | `201` with `Product` | `409` name taken (ignoring case), `422` invalid (name 1–80 chars, at most 20 keywords of up to 40 chars each, bad color) |
| `PATCH /products/{id}` | any of `{name, description, keywords, color}` | `200` with `Product` | `404`, `409`, `422` |
| `DELETE /products/{id}` | none | `204` | `404` |

- Deleting a product removes it from every contact's interests.
- `color` is optional on create. The server picks one from a palette.

Example `POST /products`:
```json
{ "name": "Sunscreen", "description": "SPF 50 gel sunscreen for oily skin", "keywords": ["sunscreen", "spf", "sunblock"], "color": "#f59e0b" }
```
Response:
```json
{ "id": "6f1c…", "name": "Sunscreen", "description": "SPF 50 gel sunscreen for oily skin",
  "keywords": ["sunscreen", "spf", "sunblock"], "color": "#f59e0b", "interested_count": 0,
  "created_at": "2026-09-30T10:15:00Z" }
```

---

## 2. Product interest on a contact (the customer tag)

The decision is made **per contact**, from that customer's messages across **all** their chats (WhatsApp,
Instagram, Messenger, Gmail and website). The result is "this customer is interested in Sunscreen".

### Types

```ts
export type ProductStatus =
  | 'pending'         // not analysed yet (no customer messages, or no products defined yet)
  | 'determined'      // interested in one or more products
  | 'not_determined'; // analysed, but not about any known product, or the AI was not confident enough

export interface ContactProductInterest {
  product_id: string;
  name: string;
  color: string;
  source: 'ai' | 'staff';     // 'staff' = added by a person; the AI never removes it
  confidence: number | null;  // 0–1 from the AI; null when added by staff
  last_detected_at: string;   // when the AI last saw it in the chats (or when staff added it)
}
```

`ContactResponse` gains three fields. This covers the `contact` inside conversations and in the
`conversation.updated` SSE event, `GET /contacts` and `GET /contacts/{id}`:
```ts
product_status: ProductStatus;
product_interests: ContactProductInterest[]; // empty unless product_status is 'determined'
product_classified_at: string | null;        // last time the AI analysed this contact
```

### Endpoints

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /contacts/{id}/product-interests/classify` | none | `200` with `ContactResponse`: re-runs the AI on the contact's chats now | `404`, `502` when the AI is unavailable |
| `POST /contacts/{id}/product-interests/{product_id}` | none | `200` with `ContactResponse`: staff adds an interest (`source: "staff"`); repeating it changes nothing | `404` for an unknown contact or product |
| `DELETE /contacts/{id}/product-interests/{product_id}` | none | `200` with `ContactResponse`: removes the interest, and the AI will not add this product to this contact again | `404` |
| `GET /contacts?product_ids=<id>&product_ids=<id>` | none | contacts interested in **any** of these products (combines with the existing `q` and `tag_ids`) | none |
| `GET /contacts?product_status=not_determined` | none | contacts by status (`pending`, `determined` or `not_determined`) | `422` for another value |

Behavior the UI can rely on:
- **Automatic.** After each new customer message on any channel, the backend re-analyses that contact in the
  background. The UI learns the result from the `conversation.updated` SSE event, with no polling.
- **Interests accumulate.** A customer who asked about Sunscreen last week and about Face wash today is interested in
  both. An interest is removed only by staff (`DELETE`) or when the product is deleted.
- **Staff decisions stick.** A staff-added interest is never removed by the AI, and a staff-removed one is never
  re-added.
- **Confidence.** The AI adds a product only at a confidence of 0.5 or higher (configurable on the server).
- **New or edited products.** Creating or editing a product re-analyses the workspace's contacts in the background,
  so existing chats get tagged too. Expect `interested_count` and the contacts to update over the next seconds.

Example `contact` (inside a conversation or `GET /contacts/{id}`), with other fields as today:
```json
{ "id": "k9…", "name": "Priya", "tags": [],
  "product_status": "determined", "product_classified_at": "2026-09-30T10:16:02Z",
  "product_interests": [
    { "product_id": "6f1c…", "name": "Sunscreen", "color": "#f59e0b", "source": "ai", "confidence": 0.91,
      "last_detected_at": "2026-09-30T10:16:02Z" } ] }
```

---

## 3. Segments

Segment rules (`POST /segments/preview`, `POST /segments`, `PATCH /segments/{id}`) gain two optional fields:
```ts
products: string[];                 // interested in any of these product ids
products_match: 'any' | 'all';      // default 'any'
```
Saved segments stay dynamic, so a customer who later asks about Sunscreen joins "Sunscreen interested" automatically.

---

## 4. Suggested screens

- **Products** (new page or a tab on Contacts): a list with a color chip, name, keyword count and
  `interested_count`. Create and edit in a modal with name, description, keywords (chip input) and color. Delete with
  confirmation ("Removes it from N customers").
- **Inbox contact panel:** an "Interested in" row of product chips (staff-added ones marked), or a "Not analysed yet"
  / "Not determined" state.
  - Add or remove a product with the same UI as tags.
  - **Re-detect** calls `classify`.
- **Conversation list** (optional): small product chips from `contact.product_interests` under the preview.
- **Contacts page:** a product filter next to the tag filter, including "Not determined".
- **Segment builder:** an "Interested in products" rule, like "Has tags".

Keep the existing theme (brand CSS tokens, gray-900 primary buttons), as in the Contacts page.

## 5. Working before the backend exists

- Add `src/services/productApi.ts` in the style of `crmApi.ts`. Until the backend lands, back it with an in-memory
  mock of the shapes above, for example when `VITE_PRODUCTS_MOCK=true`.
- Treat `product_status`, `product_interests` and `product_classified_at` as optional in the existing types (`?:`), so
  the current backend responses keep working until the fields exist.
- The backend will follow this contract exactly. If something is missing or awkward for the UI, raise it before the
  backend is built, and this document will be updated.
