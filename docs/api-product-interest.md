# API contract: product tags and customer product interest

**Status: contract only. The backend is not built yet**, so these endpoints return `404` until it ships. Build the UI
against this document and a mock (see "Working before the backend exists"). The field names and shapes below are
what the backend will return.

## What the feature does

1. Staff create **product tags**: the products or services the business sells (e.g. *Sunscreen*, *Face wash*,
   *Bridal makeup*). A short description and keywords help the AI recognize them.
2. When a customer chats on any channel, the backend reads the conversation and decides which product(s) the customer
   is asking about. It uses an AI decision model (Laya).
3. The customer is then **tagged as interested** in those products. If the chat is not about any product, or the AI
   is unsure, the conversation is **not determined**.
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

## 2. Product interest on a conversation

Each conversation carries the AI's (or staff's) decision about which products it is about.

### Types

```ts
export type InterestStatus =
  | 'pending'         // no customer message yet, or classification is running
  | 'determined'      // one or more products found
  | 'not_determined'; // not about a known product, or the AI is not confident enough

export interface ProductMatch {
  product_id: string;
  name: string;
  color: string;
  confidence: number | null; // 0–1 from the AI; null when set by staff
}

export interface ProductInterest {
  status: InterestStatus;
  products: ProductMatch[];   // empty unless status is 'determined'
  source: 'ai' | 'staff' | null;
  classified_at: string | null;
}
```

`ConversationResponse` (from `GET /conversations` and the `conversation.updated` SSE event) gains one field:
```ts
product_interest: ProductInterest;
```

### Endpoints

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `GET /conversations/{id}/product-interest` | none | `200` with `ProductInterest` | `404` |
| `PUT /conversations/{id}/product-interest` | `{product_ids: string[]}` | `200` with `ProductInterest` (`source: "staff"`). An empty list means staff marked it `not_determined` | `404`, and `422` for unknown product ids |
| `POST /conversations/{id}/product-interest/classify` | none | `200` with `ProductInterest`: runs the AI now on the latest messages | `404`, `409` when staff set it (clear it with `DELETE` first), `502` when the AI is unavailable |
| `DELETE /conversations/{id}/product-interest` | none | `200` with `ProductInterest`: removes the staff override and goes back to AI results | `404` |

Behavior the UI can rely on:
- **Automatic.** After each new customer message, the backend classifies in the background. The UI learns the result
  from the `conversation.updated` SSE event, with no polling. Show `pending` as a subtle "Detecting…" state.
- **Staff override wins.** While `source` is `"staff"`, the AI never changes the result.
- **Confidence.** The AI marks a product only above a confidence threshold of 0.6. Below that, the result is
  `not_determined`.

Example `conversation.updated` payload (other fields as today):
```json
{ "id": "c1…", "platform": "whatsapp", "contact": { "id": "k9…", "name": "Priya", "…": "…" },
  "product_interest": { "status": "determined", "source": "ai", "classified_at": "2026-09-30T10:16:02Z",
    "products": [ { "product_id": "6f1c…", "name": "Sunscreen", "color": "#f59e0b", "confidence": 0.91 } ] } }
```

---

## 3. Product interest on a contact (the customer tag)

A contact's interests are all products found across all their conversations. This is "this customer is interested in
Sunscreen".

### Types

```ts
export interface ContactProductInterest {
  product_id: string;
  name: string;
  color: string;
  source: 'ai' | 'staff';
  confidence: number | null;
  last_detected_at: string;   // most recent conversation that matched
}
```

`ContactResponse` (the `contact` inside conversations, `GET /contacts`, `GET /contacts/{id}`) gains:
```ts
product_interests: ContactProductInterest[]; // empty = no product determined yet
```

### Endpoints

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `GET /contacts?product_ids=<id>&product_ids=<id>` | none | contacts interested in **any** of these products (combines with the existing `q` and `tag_ids`) | none |
| `GET /contacts?product_status=not_determined` | none | contacts with no product interest yet | `422` for another value |
| `POST /contacts/{id}/product-interests/{product_id}` | none | `200` with `ContactResponse`: staff adds an interest (`source: "staff"`); repeating it changes nothing | `404` |
| `DELETE /contacts/{id}/product-interests/{product_id}` | none | `200` with `ContactResponse`: removes it, and the AI will not re-add this product for this contact | `404` |

---

## 4. Segments

Segment rules (`POST /segments/preview`, `POST /segments`, `PATCH /segments/{id}`) gain two optional fields:
```ts
products: string[];                 // interested in any of these product ids
products_match: 'any' | 'all';      // default 'any'
```
Saved segments stay dynamic, so a customer who later asks about Sunscreen joins "Sunscreen interested" automatically.

---

## 5. Suggested screens

- **Products** (new page or a tab on Contacts): a list with a color chip, name, keyword count and
  `interested_count`. Create and edit in a modal with name, description, keywords (chip input) and color. Delete with
  confirmation ("Removes it from N customers").
- **Inbox contact panel:** a "Interested in" row of product chips, plus a "Detecting…" or "Not determined" state.
  - Add or remove a product with the same UI as tags.
  - **Re-detect** calls `classify`, and **Reset to AI** calls `DELETE` when staff overrode the result.
- **Conversation list** (optional): small product chips under the preview.
- **Contacts page:** a product filter next to the tag filter, including "Not determined".
- **Segment builder:** an "Interested in products" rule, like "Has tags".

Keep the existing theme (brand CSS tokens, gray-900 primary buttons), as in the Contacts page.

## 6. Working before the backend exists

- Add `src/services/productApi.ts` in the style of `crmApi.ts`. Until the backend lands, back it with an in-memory
  mock of the shapes above, for example when `VITE_PRODUCTS_MOCK=true`.
- Treat `product_interest` and `product_interests` as optional in the existing types (`?:`), so the current backend
  responses keep working until the fields exist.
- The backend will follow this contract exactly. If something is missing or awkward for the UI, raise it before the
  backend is built, and this document will be updated.
