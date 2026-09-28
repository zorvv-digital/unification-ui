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
everything you sent are gone. The AI Playground returns to the single Glow Assistant (v1) with its four knowledge items,
and AI auto-reply is back on WhatsApp only.
Use this before each demo.
Only the demo workspace shows this button.

## 8. AI Playground: test and improve your AI agent

Open **AI Playground** in the sidebar.

> Answers come from the offline demo AI unless the backend has a real provider configured
> (`LLM_PROVIDER=openai` + `LLM_API_KEY` in `backend/.env`, see `docs/api-testing-swagger.md` §9).
> The offline AI answers with the matching knowledge item, so the flow below works without any key.

1. **The demo agent is ready.** The right panel shows **Glow Assistant** and **Testing v1 · live**; the phone shows its greeting.
2. **Chat with it.** Type `What is your pricing for a haircut?` in the phone and press Enter. It answers from the **Pricing** knowledge.
   The ↻ button next to the version picker starts a fresh chat.
3. **Improve it with feedback.** In **Improve with feedback** type `Always mention free parking` → **Create draft**.
   A blue note says *Draft v2 is ready*; the phone header shows **testing draft v2**. Customers still get v1.
4. **Make it live.** Under **Versions**, click **Activate** next to v2. v2 shows the green **Live** badge.
   To roll back, click **Activate** on v1.
5. **Edit the instructions directly.** Change the text in **Instructions** → **Save as new version** (becomes live immediately).
6. **Teach it something new.** Click **Connectors and skills** → under **Custom Skills** click **Create New**,
   enter `Gift Vouchers` / `Vouchers from 1,000 INR, valid for one year.` → **Add skill**.
   The new card has **Used by agent** and **Enabled** ticked. Close the window and ask `Do you sell gift vouchers?`;
   the agent uses the new skill right away (no new version needed). Untick **Enabled** or **Used by agent** to stop it using a skill.
7. **Build a new agent.** Click **+ New agent** → enter `Bright Smile` / `Dental Clinic` → **Next**.
   Answer the questions tailored to a dental clinic, optionally name it `Smiley` → **Generate agent**.
   The new agent is selected and greets you; switch between agents with the agent picker.

## 9. AI replies in the inbox

The demo WhatsApp channel has AI auto-reply on, so the **AI auto-reply** switch (robot icon, top right) is blue.

1. **The AI is handling Priya.** Open **Priya Singh**. Under her name it says **AI is replying**, and the switch
   next to the robot icon in the thread header is on.
2. **A customer asks something.** Click **⋮** (top right of the thread) → **Simulate customer message** →
   type `What is your pricing for a haircut?` → OK. Within a second the AI answers from the Pricing knowledge.
   Its bubble carries a small **AI** label, and the inbox list shows `AI:` before the preview.
3. **The customer wants a person.** Simulate `I want to talk to a real person`. The AI does not answer. Priya gets a red
   **Needs human** pill (in the thread and the list), and the switch turns off.
4. **Find escalations.** Click the **Needs human** filter chip above the list: only flagged conversations show. Click **All**.
5. **Let the AI draft for you.** Click the ✨ button in the composer. A suggested reply fills the text box;
   nothing is sent until you press Enter.
6. **Reply yourself or hand back.** Sending a message yourself takes the conversation over (switch off, flag cleared).
   Turning the switch back on hands it to the AI, which answers the next customer message.
7. **Choose channels and agent.** Click the top-right **AI auto-reply** switch to turn auto-reply off everywhere.
   Click it again: the **AI Auto-Reply** window lets you pick the agent and tick the channels
   (e.g. only **Demo WhatsApp**) → **Enable Automation**. New customers on those channels are answered by the AI.

> A new customer on WhatsApp (for example Meera in §4) is now answered by the AI straight away.
> Replying to a customer yourself switches their conversation to you, so the simulated customer replies in §3 keep working.
> The WhatsApp, Instagram and Messenger pages keep their own layouts. The AI controls are on the **Inbox** page.

## 10. Sign out

Click the **log-out icon** next to your name. You return to **Sign in**.

---

## Registering a real business

There is no sign-up screen yet. Create a workspace with `POST /auth/register` in Swagger, then sign in with that email.
A new business starts with an empty inbox and no channels; real channels (WhatsApp, Instagram, Messenger, Gmail, website chat)
are connected in later changes.
