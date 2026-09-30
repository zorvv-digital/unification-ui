# UI User Flow

How to run the platform locally and walk through the demo as a business user would.
The same flow is automated in `saas inbox/e2e/inbox-flow.mjs` (`npm run e2e`; start the backend pointed at the
mock Meta and Google APIs it runs, see §16).

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
>
> After pulling this change, delete `backend/unification.db*` once (conversations gained a `subject` column; the database
> is not migrated). The demo workspace is recreated on the next start.

---

## 1. Sign in

1. Opening any page without being signed in takes you to **Sign in**.
2. Enter a wrong password → a red "Invalid email or password" message appears.
3. Click **Try the demo workspace** (or sign in with `demo@unification.app` / `demo12345`).
4. You land on the **Inbox**. The bottom-left corner shows **Demo Owner · Glow Salon & Spa (Demo)**.

## 2. Browse the unified inbox

- The list mixes WhatsApp, Instagram, Messenger and Gmail conversations, newest first.
  The small icon on each avatar shows the channel. Gmail conversations are email threads and show their **subject**
  (e.g. *Bridal package for 12 December*); replying to one works like any chat.
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

## 10. Connect a real WhatsApp number

Open **WhatsApp** in the sidebar and click **⋮** at the top of the chat list: the **WhatsApp numbers** window opens.
The demo's own number is listed as *Demo number (simulated)*.

1. **Connect.** Enter the *Phone number ID*, *WhatsApp Business Account ID*, *Access token* and *App secret*
   from your Meta app (see `docs/api-testing-swagger.md` §11) → **Connect**.
   Wrong credentials show "Meta rejected these credentials"; nothing is saved.
2. **Register the webhook.** A green box shows the **Webhook URL** and **Verify token**. Paste them in the Meta App Dashboard
   (WhatsApp → Configuration) and subscribe to **messages**. The backend needs a public URL for this (`PUBLIC_BASE_URL`, e.g. via ngrok).
3. **Chat.** Customer messages to that number appear live on the WhatsApp page and in the Inbox.
   Replies are sent through WhatsApp; the ticks turn blue when the customer reads them.
4. **Templates.** In a chat on a real number, the 📄 button next to the text box opens **Send a template**: pick an approved template,
   fill its parameters (the preview updates) → **Send template**. If you try to send a normal message more than 24 hours after
   the customer's last message, an orange bar explains that the window is closed, with a **Send template** link.
5. **Disconnect.** In **WhatsApp numbers**, click **Disconnect** next to the number and confirm. The chats stay; new messages
   are no longer received. **Reset demo data** removes connected numbers from the demo workspace.

## 11. Connect a Facebook Page and Instagram

Open **Messenger** (click **⋯** next to *Chats*) or **Instagram** (click **...** next to the account name): the
**Facebook Page & Instagram** window opens. The demo channels are listed as *Demo channel (simulated)*.

1. **Connect.** Enter the *Page ID*, *Page access token* and *App secret* from your Meta app (see `docs/api-testing-swagger.md` §12)
   → **Connect**. A wrong token shows "Meta rejected this Page token"; nothing is saved.
2. **Register the webhooks.** The Page appears as *Messenger · Connected* and its linked Instagram account as
   *@username, Instagram · Connected*. The green box shows a **Messenger webhook URL** (register under Messenger → Webhooks)
   and an **Instagram webhook URL** (Instagram → Webhooks), each with its verify token. Subscribe both to **messages**.
3. **Chat.** Messenger messages and Instagram DMs appear live on their pages and in the Inbox, under the customer's name.
   Replies go out through Meta. Real channels have no **Simulate** button. More than 24 hours after the customer's last
   message, an orange bar explains that the window is closed.
4. **Expired token.** If Meta rejects the Page token when you reply, the message fails and the orange bar says
   *"This Page's access token expired or was revoked. Reconnect the Page from the ⋯ menu."* The channel shows
   *Disconnected*. Enter a fresh token in the same window → **Connect**: the channels are connected again with the same
   webhook URLs, so nothing changes in Meta.
5. **Disconnect.** Click **Disconnect** next to a channel and confirm. **Reset demo data** removes connected Pages from the demo workspace.

## 12. Connect Gmail

Click **Gmail** in the sidebar (under *Channels*): the **Gmail** window opens. The demo's mailbox is listed as
*Demo mailbox (simulated)*. The server needs a Google OAuth client first (see `docs/api-testing-swagger.md` §13).

1. **Connect.** Click **Connect with Google**. Google's sign-in page opens: choose the business Gmail account and allow
   reading and sending email. You come back to the Inbox with the banner *"Gmail connected. New customer emails arrive in
   the inbox within a minute or two."* If you cancel on Google's page, the banner says access was not granted and nothing
   is connected.
2. **Receive.** New emails in that mailbox's inbox appear within about a minute, one conversation per email thread, with the
   sender's name and the subject. A customer's reply in the same thread lands in the same conversation, without the quoted
   previous email.
3. **Reply.** Answer in the Inbox as usual. The customer receives it as an email reply in the same thread (subject `Re: ...`).
4. **Revoked access.** If access is removed in the Google account (Security → Third-party access), the channel shows
   *Disconnected* in the Gmail window. Click **Connect with Google** again to reconnect the same address.
5. **Disconnect.** Click **Disconnect** next to the address and confirm. **Reset demo data** removes connected Gmail accounts
   from the demo workspace.

## 13. Website chat

Click **Website chat** in the sidebar (under *Channels*).

1. **Settings.** The demo already has a widget. The window shows the **Embed code** to paste into the website, the
   **Allowed domains** (the widget only works on these sites; `example.com` also covers its subdomains), the **Greeting**,
   and which details to **Ask visitors for**. Change the greeting → **Save** → *Saved.* A new business sees
   **Create chat widget** instead.
2. **Chat as a visitor.** Click **Open demo page**: a sample salon website opens in a new tab. Click the chat button in the
   bottom-right corner, see the greeting, and send `Hi, are you open today?`. Back in the Inbox, a **Website visitor**
   conversation (globe icon) appears live; the **Website** filter chip shows only these.
3. **Reply.** Answer in the Inbox: the reply appears in the visitor's open chat right away.
4. **Lead.** After the first message the widget asks *"Leave your details"*. Enter a name and phone → **Save details**.
   The conversation in the Inbox is renamed live and the contact panel shows the phone.
5. **Returning visitor.** Reload the demo page and open the chat: the earlier messages are still there.

## 14. Contacts, tags and segments

The demo has three tags: **VIP**, **Regular** and **Bridal**.

1. **Tag a customer from the inbox.** Open **Rahul Kumar**. The contact panel on the right shows his tags (VIP, Regular).
   Click **Add tag**, type `Birthday club`, and click **Create tag**. The new tag appears on Rahul right away (click the
   **×** on a tag to remove it).
2. **Edit the profile.** Click **Edit** in the contact panel. Set a **Birthday**, set **Marketing consent** to *Opted in*,
   add **Notes** (e.g. *Prefers evening slots*), and click **Save contact**. The panel shows *Marketing: Opted in* and the notes.
3. **Merge the same customer.** Sarah wrote on two channels, so she also appears as **Mark Smith**. Open **Sarah**, click
   **Merge**, search `Mark`, pick **Mark Smith**, and confirm. The inbox reloads, and both conversations now belong to
   Sarah. Mark's tags move over, and his details fill in anything Sarah's contact was missing.
4. **Contacts page.** Click **Contacts** in the sidebar (under *Main*). The table shows each customer's channels, tags and
   last activity. Type in **Search** (name, phone or email) or click tag chips to filter: **Bridal** shows Ananya Rao and
   Priya Singh.
5. **Import a CSV.** Click **Import CSV** and choose a file with a header row
   `name,phone,email,birthday,anniversary,tags` (dates as `YYYY-MM-DD`, tags separated by `;`). A summary appears, e.g.
   *Imported: 1 created, 1 updated, 1 skipped*, with the reason for each skipped row (e.g. *Row 3: Invalid birthday*).
   A row with the phone or email of an existing contact updates that contact instead of adding a new one.
6. **Manage tags.** Click **Manage tags** to add, rename, recolor or delete tags. Deleting a tag removes it from every
   contact.
7. **Segments.** Switch to the **Segments** tab. Pick rules (tags a customer has, or doesn't have, channels, marketing
   consent, active in the last N days, birthday in the next N days). **Matching contacts** on the right updates as you
   click. Enter a **Segment name** (e.g. *VIP customers*) → **Save segment**. It appears under **Saved segments** with its
   member count. Segments are dynamic: a customer tagged VIP later joins *VIP customers* automatically.

**Reset demo data** restores the three seeded tags and removes saved segments.

## 15. Customer app: demo from the customer's side

Show a prospect what their customers experience. The **customer app** is a phone screen where you are the customer:
you write to the salon on WhatsApp, Instagram, Messenger or Gmail. Messages land in the inbox live, and replies from
staff or the AI come back to the phone.

1. **Open it.** In the demo inbox, click **Customer app** (bottom-left, above *Reset demo data*). It opens
   **http://localhost:5173/phone** in a new tab. Put the two windows side by side.
2. **Pick a name.** Enter a name, e.g. `Priya Menon`, and click **Start chatting**. The phone's home screen shows
   WhatsApp, Instagram, Messenger, Gmail and Website.
3. **Write on WhatsApp.** Tap **WhatsApp** and send `Hi! Do you have a slot on Saturday?`. In the inbox, a WhatsApp
   conversation from Priya Menon appears at the top right away, with an unread badge and a phone number in the contact
   panel. The demo AI answers right away (WhatsApp has AI auto-reply on), and its answer shows on the phone.
4. **Reply as staff.** Open the conversation in the inbox and reply. The reply appears on the phone within a second.
   Priya's messages get blue ticks once the conversation is open in the inbox.
5. **Other apps.** Go back to the home screen and try **Instagram** (shows *Seen* when read) and **Messenger**. For
   **Gmail**, the first email needs a **Subject**. It arrives in the inbox as an email thread with that subject, and the
   reply appears as an email on the phone. Replies that arrive while you're on the home screen show a red badge on the
   app. **Website** opens the website chat demo page (§13).
6. **Real conversations only.** Chats started from the customer app never get the demo's canned customer replies,
   because someone is typing on the phone. The seeded conversations still reply automatically.
7. **Start over.** **Not Priya Menon? Start over** on the home screen forgets the name. **Reset demo data** removes
   these conversations; an open phone keeps working and starts empty.

**On a real phone.** With the phone and the computer on the same Wi-Fi, start the frontend with
`npm run dev -- --host`, set `VITE_API_URL=http://<computer's LAN IP>:8000/api/v1` in `.env.local`, start the backend
with `--host 0.0.0.0`, and open `http://<computer's LAN IP>:5173/phone` on the phone.

## 16. Automated E2E

`npm run e2e` runs this whole guide in a browser against mock Meta and Google APIs that it starts on port 8765.
Start the backend for it with:

```bash
cd backend
META_GRAPH_URL=http://127.0.0.1:8765 GMAIL_SYNC_SECONDS=2 \
GOOGLE_CLIENT_ID=e2e-client GOOGLE_CLIENT_SECRET=e2e-secret \
GOOGLE_AUTH_URL=http://127.0.0.1:8765/o/oauth2/auth GOOGLE_TOKEN_URL=http://127.0.0.1:8765/token \
GMAIL_API_URL=http://127.0.0.1:8765/gmail/v1 \
uv run uvicorn app.main:app --port 8000
```

## 17. Sign out

Click the **log-out icon** next to your name. You return to **Sign in**.

---

## Registering a real business

There is no sign-up screen yet. Create a workspace with `POST /auth/register` in Swagger, then sign in with that email.
A new business starts with an empty inbox and no channels. Connect a WhatsApp number as in §10, a Facebook Page with
Instagram as in §11, Gmail as in §12, and add the website chat widget as in §13.
