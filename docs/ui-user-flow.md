# UI User Flow

How to run the platform locally and walk through the demo as a business user would.
The same flow is automated in `saas inbox/e2e/inbox-flow.mjs` (`npm run e2e`).

## 0. Run both apps

**Terminal 1: backend**
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

**Terminal 2: frontend**
```bash
cd "saas inbox"
npm install
cp .env.example .env.local        # sets VITE_API_URL=http://localhost:8000/api/v1
npm run dev
```

Open **http://localhost:5173**.

> Without `.env.local` (no `VITE_API_URL`), the frontend runs on its old built-in mock data and never calls the backend.
> The Gmail items in the inbox are still frontend mock data; they move to the backend in the Gmail change.

---

## 1. Sign in

1. Opening any page without being signed in takes you to **Sign in**.
2. Enter a wrong password → a red "Invalid email or password" message appears.
3. Click **Try the demo workspace** (or sign in with `demo@unification.app` / `demo12345`).
4. You land on the **Inbox**. The bottom-left corner shows **Demo Owner · Glow Salon & Spa (Demo)**.

## 2. Browse the unified inbox

- The list mixes WhatsApp, Instagram and Messenger conversations (and mock Gmail), newest first.
  The small icon on each avatar shows the channel.
- Unread counts show as black badges; the channel cards at the top summarise conversations per channel.
- Use the **All / WhatsApp / Instagram** chips and the **Latest** sort to filter.

## 3. Reply to a customer

1. Click **Rahul Kumar**. The thread and contact details (phone, email) open. His unread badge clears.
2. Type `Yes, 7:30 is booked for you!` and press **Enter**.
3. Your message appears right away (dark bubble).
4. About 3 seconds later the simulated customer replies (e.g. "Thanks! That works for me 👍") **without reloading**,
   and Rahul's conversation moves to the top.

## 4. A new customer writes in

Customers arrive through channel webhooks. Simulate one from Swagger (http://localhost:8000/docs → `POST /webhooks/{channel_id}`,
see `docs/api-testing-swagger.md` §5) or with curl:

```bash
curl -X POST http://localhost:8000/api/v1/webhooks/<WHATSAPP_CHANNEL_ID> \
  -H "Content-Type: application/json" \
  -d '{"customer_id": "+919900011122", "name": "Meera", "content": "Hi, do you do nail art?"}'
```

**Meera** appears at the top of the inbox with an unread badge, live. Open her conversation and reply.

## 5. Channel pages

1. In the sidebar click **WhatsApp**. Only WhatsApp conversations show, in a WhatsApp-style layout.
2. Open **Rahul Kumar** and click **Simulate Reply**: an incoming "Simulated incoming message" appears.
   It went through the WhatsApp channel's webhook, exactly like a real customer message.
3. **Instagram** and **Messenger** pages work the same way.

## 6. Everything is saved

Reload the page: all messages you sent and received are still there, because they now live in the backend.

## 7. Reset the demo

Click **Reset demo data** (bottom-left) → confirm. The inbox returns to the original six conversations; Meera and
everything you sent are gone. Use this before each demo.
Only the demo workspace shows this button.

## 8. Sign out

Click the **log-out icon** next to your name. You return to **Sign in**.

---

## Registering a real business

There is no sign-up screen yet. Create a workspace with `POST /auth/register` in Swagger, then sign in with that email.
A new business starts with an empty inbox and no channels; real channels (WhatsApp, Instagram, Messenger, Gmail, website chat)
are connected in later changes.
