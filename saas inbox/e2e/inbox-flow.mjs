// End-to-end check of docs/ui-user-flow.md against a running backend and saas inbox.
// Run: npm run e2e   (`npm run dev` on :5173; backend on :8000 with DEMO_MODE=true and the mock Meta + Google
//      APIs this script starts on :8765:
//        META_GRAPH_URL=http://127.0.0.1:8765 GMAIL_SYNC_SECONDS=2
//        GOOGLE_CLIENT_ID=e2e-client GOOGLE_CLIENT_SECRET=e2e-secret
//        GOOGLE_AUTH_URL=http://127.0.0.1:8765/o/oauth2/auth GOOGLE_TOKEN_URL=http://127.0.0.1:8765/token
//        GMAIL_API_URL=http://127.0.0.1:8765/gmail/v1)
// Uses an installed browser via BROWSER_CHANNEL (default msedge; chrome also works).
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const UI = process.env.UI_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:8000/api/v1';
const SHOTS = fileURLToPath(new URL('./shots/', import.meta.url));
const REPLIES = ['Thanks! That works for me', 'Great, see you then!', 'Can I bring a friend', 'What time do you close', 'Perfect, thank you'];

const api = async (path, init = {}, token) => {
  const res = await fetch(API + path, {
    ...init, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
  });
  return res.status === 204 ? null : res.json();
};

// --- Mock Meta Graph API (WhatsApp Cloud API) ---
const WA = { phoneId: '109876543210', wabaId: '208765432109', token: 'e2e-good-token', secret: 'e2e-app-secret', customer: '919800033333' };
const META = { pageId: '112233445566', igId: '17841400000000001', token: 'e2e-page-token', secret: 'e2e-meta-secret', igsid: '8000000000000001' };
const graphSends = [];
let metaRevoked = false;

// --- Mock Google (OAuth + Gmail API) ---
const GMAIL = { address: 'hello@glowsalon.example.com', inbox: [], sent: [], tokens: new Set(), revoked: false };
const b64url = text => Buffer.from(text).toString('base64url');
const gmailMessage = (id, threadId, subject, body, from) => ({
  id, threadId, payload: { mimeType: 'text/plain', body: { data: b64url(body) }, headers: [
    { name: 'From', value: from }, { name: 'Subject', value: subject }, { name: 'Message-ID', value: `<${id}@mail.example.com>` },
  ] },
});
const google = (req, res, url, body, reply) => {
  const path = url.pathname;
  if (path === '/o/oauth2/auth') {
    const back = new URL(url.searchParams.get('redirect_uri'));
    back.search = new URLSearchParams({ code: 'e2e-code', state: url.searchParams.get('state') }).toString();
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (path === '/token') {
    const form = new URLSearchParams(body);
    if (form.get('grant_type') === 'authorization_code' && form.get('code') !== 'e2e-code') return reply(400, { error: 'invalid_grant' });
    if (form.get('grant_type') === 'refresh_token' && GMAIL.revoked) return reply(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
    const token = `ya29.e2e${GMAIL.tokens.size + 1}`;
    GMAIL.tokens.add(token);
    return reply(200, { access_token: token, refresh_token: 'e2e-refresh', expires_in: 3599 });
  }
  if (GMAIL.revoked || !GMAIL.tokens.has((req.headers.authorization ?? '').replace('Bearer ', ''))) {
    return reply(401, { error: { code: 401, message: 'Invalid Credentials' } });
  }
  const rest = path.replace('/gmail/v1/users/me/', '');
  if (rest === 'profile') return reply(200, { emailAddress: GMAIL.address, historyId: '1' });
  if (rest === 'messages' && req.method === 'GET') return reply(200, { messages: GMAIL.inbox.map(m => ({ id: m.id, threadId: m.threadId })) });
  if (rest === 'messages/send') {
    GMAIL.sent.push(JSON.parse(body));
    return reply(200, { id: `gsent${GMAIL.sent.length}`, threadId: JSON.parse(body).threadId });
  }
  if (rest.startsWith('messages/')) return reply(200, GMAIL.inbox.find(m => m.id === rest.split('/')[1]));
  if (rest.startsWith('threads/')) return reply(200, { messages: GMAIL.inbox.filter(m => m.threadId === rest.split('/')[1]) });
  return reply(404, { error: { message: 'Unknown path' } });
};
const graph = http.createServer((req, res) => {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    const url = new URL(req.url, 'http://graph');
    const path = url.pathname;
    if (path.startsWith('/o/oauth2/') || path === '/token' || path.startsWith('/gmail/')) return google(req, res, url, body, reply);
    if (req.headers.authorization === `Bearer ${META.token}`) {
      if (metaRevoked) return reply(400, { error: { message: 'Error validating access token: The session has been invalidated', type: 'OAuthException', code: 190 } });
      if (req.method === 'GET' && path === `/${META.pageId}`) return reply(200, { id: META.pageId, name: 'Glow Salon Page', instagram_business_account: { id: META.igId, username: 'glowsalon' } });
      if (req.method === 'GET' && path === `/${META.igsid}`) return reply(200, { id: META.igsid, name: 'Arjun Mehta' });
      if (req.method === 'POST' && path === `/${META.pageId}/messages`) {
        graphSends.push(JSON.parse(body));
        return reply(200, { recipient_id: META.igsid, message_id: `m_e2e${graphSends.length}` });
      }
      return reply(404, { error: { message: 'Unknown path', code: 803 } });
    }
    if (req.headers.authorization !== `Bearer ${WA.token}`) return reply(401, { error: { message: 'Invalid OAuth access token.' } });
    if (req.method === 'GET' && path === `/${WA.phoneId}`) return reply(200, { id: WA.phoneId, display_phone_number: '+91 98000 22222' });
    if (req.method === 'POST' && path === `/${WA.phoneId}/messages`) {
      graphSends.push(JSON.parse(body));
      return reply(200, { messages: [{ id: `wamid.e2e${graphSends.length}` }] });
    }
    if (req.method === 'GET' && path === `/${WA.wabaId}/message_templates`) {
      return reply(200, { data: [{ name: 'appointment_reminder', language: 'en_US', status: 'APPROVED', category: 'UTILITY', components: [{ type: 'BODY', text: 'Hi {{1}}, see you on {{2}}.' }] }] });
    }
    reply(404, { error: { message: 'Unknown path' } });
  });
}).listen(8765);

// Posts a Meta webhook event signed with the app secret, like Meta does.
const metaEvent = (channelId, value) => {
  const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: WA.wabaId, changes: [{ field: 'messages', value }] }] });
  const signature = 'sha256=' + crypto.createHmac('sha256', WA.secret).update(raw).digest('hex');
  return fetch(`${API}/webhooks/${channelId}`, { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } });
};

// Posts a signed Instagram DM webhook event, like Meta does.
const instagramDm = (channelId, mid, text) => {
  const raw = JSON.stringify({ object: 'instagram', entry: [{ id: META.igId, time: 1727600000, messaging: [
    { sender: { id: META.igsid }, recipient: { id: META.igId }, timestamp: 1727600000, message: { mid, text } },
  ] }] });
  const signature = 'sha256=' + crypto.createHmac('sha256', META.secret).update(raw).digest('hex');
  return fetch(`${API}/webhooks/${channelId}`, { method: 'POST', body: raw, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': signature } });
};

const { access_token: token } = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: 'demo@unification.app', password: 'demo12345' }) });
await api('/demo/reset', { method: 'POST' }, token);

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('console', m => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', e => errors.push(e.message));
const step = async (name, fn) => { await fn(); console.log('ok  ', name); };

await step('1. unauthenticated /inbox redirects to /login', async () => {
  await page.goto(`${UI}/inbox`);
  await page.waitForURL('**/login');
  await page.screenshot({ path: SHOTS + '1-login.png' });
});

await step('2. wrong password shows an error', async () => {
  await page.fill('input[type=email]', 'demo@unification.app');
  await page.fill('input[type=password]', 'wrong-password');
  await page.click('button[type=submit]');
  await page.getByRole('alert').getByText('Invalid email or password').waitFor();
});

await step('3. demo login lands on the inbox with seeded conversations', async () => {
  await page.getByText('Try the demo workspace').click();
  await page.waitForURL('**/inbox');
  await page.getByText('Rahul Kumar').first().waitFor();
  for (const name of ['Priya Singh', 'Sarah', 'Alex']) await page.getByText(name).first().waitFor();
  await page.getByText('Glow Salon & Spa (Demo)').waitFor();
  await page.screenshot({ path: SHOTS + '3-inbox.png' });
});

await step('4. send a message and see the simulated customer reply arrive live', async () => {
  await page.getByText('Rahul Kumar').first().click();
  await page.fill('input[placeholder="Type a message..."], textarea[placeholder="Type a message..."]', 'Yes, 7:30 is booked for you!');
  await page.keyboard.press('Enter');
  await page.getByText('Yes, 7:30 is booked for you!').first().waitFor();
  await page.locator(`text=/${REPLIES.join('|')}/`).first().waitFor({ timeout: 10000 });
  await page.screenshot({ path: SHOTS + '4-reply.png' });
});

await step('5. a new customer message (webhook) appears live without reload', async () => {
  const channels = await api('/channels', {}, token);
  const whatsapp = channels.find(c => c.platform === 'whatsapp');
  await api(`/webhooks/${whatsapp.id}`, { method: 'POST', body: JSON.stringify({ customer_id: '+919900011122', name: 'Meera', content: 'Hi, do you do nail art?' }) });
  await page.getByText('Meera').first().waitFor({ timeout: 5000 });
  await page.screenshot({ path: SHOTS + '5-new-customer.png' });
});

await step('6. opening a conversation clears its unread count on the server', async () => {
  await page.getByText('Meera').first().click();
  await page.getByText('Hi, do you do nail art?').last().waitFor();
  await page.waitForTimeout(500);
  const conversations = await api('/conversations', {}, token);
  assert.equal(conversations.find(c => c.contact.name === 'Meera').unread_count, 0);
});

await step('7. WhatsApp page: Simulate Reply posts through the channel webhook', async () => {
  await page.goto(`${UI}/whatsapp`);
  await page.getByText('Rahul Kumar').first().click();
  await page.getByText('Simulate Reply').click();
  await page.getByText('Simulated incoming message').first().waitFor({ timeout: 5000 });
  await page.screenshot({ path: SHOTS + '7-whatsapp.png' });
});

await step('8. data survives a reload (it lives in the backend)', async () => {
  await page.reload();
  await page.getByText('Rahul Kumar').first().click();
  await page.getByText('Simulated incoming message').first().waitFor();
});

// --- AI replies in the inbox (add-ai-replies) ---
const aiSwitch = () => page.getByLabel('AI replies for this conversation');
const waitPressed = (label, value) => page.waitForFunction(
  ([l, v]) => document.querySelector(`[aria-label="${l}"]`)?.getAttribute('aria-pressed') === v, [label, value]);
const simulateCustomer = async text => {
  page.once('dialog', d => d.accept(text));
  await page.getByLabel('More options').click();
  await page.getByText('Simulate customer message').click();
};
const priyaMessages = async () => {
  const priya = (await api('/conversations', {}, token)).find(c => c.contact.name === 'Priya Singh');
  return api(`/conversations/${priya.id}/messages`, {}, token);
};

await step('A1. WhatsApp auto-reply is on and Priya is handled by the AI', async () => {
  await page.goto(`${UI}/inbox`);
  await waitPressed('AI auto-reply', 'true');
  await page.getByText('Priya Singh').first().click();
  await page.getByText('AI is replying').waitFor();
  await waitPressed('AI replies for this conversation', 'true');
});

await step('A2. a customer question gets an AI answer from the knowledge', async () => {
  await simulateCustomer('What is your pricing for a haircut?');
  await page.getByText('Haircut: 500 INR').first().waitFor({ timeout: 10000 });
  assert.equal((await priyaMessages()).at(-1).author, 'agent');
  await page.screenshot({ path: SHOTS + 'A2-ai-reply.png' });
});

await step('A3. asking for a person escalates to a human', async () => {
  await simulateCustomer('I want to talk to a real person');
  await page.getByText('Needs human').first().waitFor({ timeout: 5000 });
  await waitPressed('AI replies for this conversation', 'false');
  assert.equal((await priyaMessages()).at(-1).author, 'customer');
  await page.screenshot({ path: SHOTS + 'A3-needs-human.png' });
});

await step('A4. the Needs human filter shows only escalated conversations', async () => {
  await page.getByRole('button', { name: 'Needs human', exact: true }).click();
  await page.waitForFunction(() => !document.body.innerText.includes('Rahul Kumar'));
  await page.getByText('Priya Singh').first().waitFor();
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByText('Rahul Kumar').first().waitFor();
});

await step('A5. suggest reply fills the composer without sending', async () => {
  const before = (await priyaMessages()).length;
  await page.getByLabel('Suggest reply').click();
  await page.waitForFunction(() => document.querySelector('textarea[placeholder="Type a message..."]')?.value.length > 0, null, { timeout: 10000 });
  assert.equal((await priyaMessages()).length, before);
  await page.fill('textarea[placeholder="Type a message..."]', '');
});

await step('A6. handing back to the AI clears the flag', async () => {
  await aiSwitch().click();
  await page.getByText('AI is replying').waitFor();
  await page.locator('span:text-is("Needs human")').first().waitFor({ state: 'detached' });
  const priya = (await api('/conversations', {}, token)).find(c => c.contact.name === 'Priya Singh');
  assert.deepEqual([priya.mode, priya.needs_human], ['ai', false]);
});

await step('A7. the header switch turns auto-reply off and back on per channel', async () => {
  await page.getByLabel('AI auto-reply').click();
  await waitPressed('AI auto-reply', 'false');
  assert.ok((await api('/channels', {}, token)).every(c => !c.ai_enabled));
  await page.getByLabel('AI auto-reply').click();
  await page.getByText('AI Auto-Reply').waitFor();
  await page.getByLabel('Answering agent').filter({ hasText: 'Glow Assistant' }).waitFor();
  await page.getByLabel('Demo Instagram').uncheck();
  await page.getByLabel('Demo Messenger').uncheck();
  await page.getByLabel('Demo Gmail').uncheck();
  await page.getByLabel('Website chat', { exact: true }).uncheck();
  await page.screenshot({ path: SHOTS + 'A7-auto-reply.png' });
  await page.getByText('Enable Automation').click();
  await waitPressed('AI auto-reply', 'true');
  const channels = await api('/channels', {}, token);
  assert.deepEqual(channels.filter(c => c.ai_enabled).map(c => c.platform), ['whatsapp']);
});

// --- WhatsApp Cloud API (add-whatsapp-channel) ---
let waChannel;
const fillCredentials = async accessToken => {
  await page.getByLabel('Phone number ID').fill(WA.phoneId);
  await page.getByLabel('WhatsApp Business Account ID').fill(WA.wabaId);
  await page.getByLabel('Access token').fill(accessToken);
  await page.getByLabel('App secret').fill(WA.secret);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
};

await step('W1. connecting with credentials Meta rejects shows the error', async () => {
  await page.goto(`${UI}/whatsapp`);
  await page.getByLabel('WhatsApp numbers').click();
  await page.getByText('Demo number (simulated)').waitFor();
  await fillCredentials('wrong-token');
  await page.getByRole('alert').getByText('Meta rejected these credentials').waitFor();
  assert.deepEqual(errors.splice(0).filter(e => !e.includes('400') && !e.includes('401')), []); // the 400 response is expected here
});

await step('W2. valid credentials connect the number and show the webhook to register', async () => {
  await fillCredentials(WA.token);
  await page.getByRole('status').getByText('Connected!').waitFor();
  waChannel = (await api('/channels', {}, token)).find(c => c.adapter_type === 'whatsapp');
  assert.equal(await page.getByLabel('Webhook URL').inputValue(), `http://localhost:8000/api/v1/webhooks/${waChannel.id}`);
  assert.ok((await page.getByLabel('Verify token').inputValue()).length >= 16);
  await page.getByText('WhatsApp +91 98000 22222').waitFor();
  await page.screenshot({ path: SHOTS + 'W2-connected.png' });
  await page.getByLabel('Close').click();
});

await step('W3. Meta webhook verification handshake', async () => {
  const { verify_token } = await api(`/channels/${waChannel.id}/webhook`, {}, token);
  const res = await fetch(`${API}/webhooks/${waChannel.id}?hub.mode=subscribe&hub.verify_token=${verify_token}&hub.challenge=e2e-challenge`);
  assert.equal(await res.text(), 'e2e-challenge');
});

await step('W4. a signed WhatsApp message appears live', async () => {
  const res = await metaEvent(waChannel.id, {
    messaging_product: 'whatsapp',
    contacts: [{ profile: { name: 'Kiran' }, wa_id: WA.customer }],
    messages: [{ from: WA.customer, id: 'wamid.in-e2e-1', timestamp: '1727600000', type: 'text', text: { body: 'Hi from real WhatsApp' } }],
  });
  assert.equal(res.status, 200);
  await page.getByText('Kiran').first().click();
  await page.getByText('Hi from real WhatsApp').last().waitFor();
});

await step('W5. a reply goes through the Cloud API and turns blue when read', async () => {
  await page.getByPlaceholder('Type a message').fill('Hello Kiran, how can we help?');
  await page.keyboard.press('Enter');
  await page.getByText('Hello Kiran, how can we help?').last().waitFor();
  assert.deepEqual(graphSends.at(-1), { messaging_product: 'whatsapp', to: WA.customer, type: 'text', text: { body: 'Hello Kiran, how can we help?' } });
  await metaEvent(waChannel.id, { messaging_product: 'whatsapp', statuses: [{ id: `wamid.e2e${graphSends.length}`, status: 'read', recipient_id: WA.customer }] });
  await page.waitForFunction(() => [...document.querySelectorAll('.bg-\\[\\#dcf8c6\\]')].at(-1)?.querySelector('svg')?.getAttribute('class')?.includes('53bdeb'));
});

await step('W6. an approved template can be sent', async () => {
  await page.getByLabel('Send template').click();
  await page.getByLabel('Parameter {{1}}').fill('Kiran');
  await page.getByLabel('Parameter {{2}}').fill('Friday');
  await page.getByLabel('Template preview').getByText('Hi Kiran, see you on Friday.').waitFor();
  await page.screenshot({ path: SHOTS + 'W6-template.png' });
  await page.locator('button[type=submit]', { hasText: 'Send template' }).click();
  await page.getByLabel('Template preview').waitFor({ state: 'detached' });
  await page.getByText('Hi Kiran, see you on Friday.').last().waitFor();
  assert.equal(graphSends.at(-1).type, 'template');
});

await step('W7. disconnecting keeps the chat and rejects new events', async () => {
  await page.getByLabel('WhatsApp numbers').click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await page.getByText('Disconnected', { exact: true }).waitFor();
  await page.getByLabel('Close').click();
  await page.getByText('Hi from real WhatsApp').last().waitFor();
  const res = await metaEvent(waChannel.id, { messaging_product: 'whatsapp', messages: [] });
  assert.equal(res.status, 410);
});

// --- Messenger and Instagram (add-meta-channels) ---
let igChannel;
const connectPage = async pageToken => {
  await page.getByLabel('Page ID').fill(META.pageId);
  await page.getByLabel('Page access token').fill(pageToken);
  await page.getByLabel('App secret').fill(META.secret);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
};

await step('M1. connecting a Page with a token Meta rejects shows the error', async () => {
  await page.goto(`${UI}/messenger`);
  await page.getByLabel('Facebook Page & Instagram').click();
  await page.getByText('Demo channel (simulated)').first().waitFor();
  await connectPage('wrong-token');
  await page.getByRole('alert').getByText('Meta rejected this Page token').waitFor();
  assert.deepEqual(errors.splice(0).filter(e => !e.includes('400') && !e.includes('401')), []);
});

await step('M2. a valid Page token connects Messenger and the linked Instagram account', async () => {
  await connectPage(META.token);
  await page.getByRole('status').getByText('Connected!').waitFor();
  const channels = await api('/channels', {}, token);
  const messenger = channels.find(c => c.adapter_type === 'messenger');
  igChannel = channels.find(c => c.adapter_type === 'instagram');
  assert.equal(await page.getByLabel('Messenger webhook URL').inputValue(), `http://localhost:8000/api/v1/webhooks/${messenger.id}`);
  assert.equal(await page.getByLabel('Instagram webhook URL').inputValue(), `http://localhost:8000/api/v1/webhooks/${igChannel.id}`);
  await page.getByText('@glowsalon').waitFor();
  await page.getByText('Instagram · Connected').waitFor();
  await page.screenshot({ path: SHOTS + 'M2-meta-connected.png' });
  await page.getByLabel('Close').click();
});

await step('M3. a signed Instagram DM appears with the customer name from Meta', async () => {
  // Posted before opening the page: live delivery is covered by W4/G3, and posting during page load races the event stream.
  assert.equal((await instagramDm(igChannel.id, 'm_in_e2e_1', 'Do you have a slot tomorrow?')).status, 200);
  await page.goto(`${UI}/instagram`);
  await page.getByText('Arjun Mehta').first().click();
  await page.getByText('Do you have a slot tomorrow?').last().waitFor();
  assert.equal(await page.getByText('Simulate', { exact: true }).count(), 0);
});

await step('M4. a reply goes out through the Messenger Platform', async () => {
  await page.getByPlaceholder('Message...').fill('Yes, 11am is free!');
  await page.keyboard.press('Enter');
  await page.getByText('Yes, 11am is free!').last().waitFor();
  assert.deepEqual(graphSends.at(-1), { recipient: { id: META.igsid }, messaging_type: 'RESPONSE', message: { text: 'Yes, 11am is free!' } });
  await page.screenshot({ path: SHOTS + 'M4-instagram-reply.png' });
});

await step('M5. a revoked Page token fails the send and disconnects the channel', async () => {
  metaRevoked = true;
  await page.getByPlaceholder('Message...').fill('Are you still there?');
  await page.keyboard.press('Enter');
  await page.getByRole('alert').getByText('expired or was revoked').waitFor();
  assert.equal((await api('/channels', {}, token)).find(c => c.id === igChannel.id).status, 'disconnected');
  await page.screenshot({ path: SHOTS + 'M5-token-revoked.png' });
});

await step('M6. reconnecting the Page reuses the channel and sending works again', async () => {
  metaRevoked = false;
  await page.getByLabel('Facebook Page & Instagram').click();
  await page.getByText('Instagram · Disconnected').waitFor();
  await connectPage(META.token);
  await page.getByText('Instagram · Connected').waitFor();
  assert.equal(await page.getByLabel('Instagram webhook URL').inputValue(), `http://localhost:8000/api/v1/webhooks/${igChannel.id}`);
  await page.getByLabel('Close').click();
  await page.getByPlaceholder('Message...').fill('Sorry, we are back!');
  await page.keyboard.press('Enter');
  await page.getByText('Sorry, we are back!').last().waitFor();
  assert.equal(graphSends.at(-1).message.text, 'Sorry, we are back!');
  assert.equal(await page.getByRole('alert').count(), 0);
});

// --- Gmail (add-gmail-channel) ---
const sidebarGmail = () => page.locator('aside').getByRole('button', { name: 'Gmail' });

await step('G1. the demo inbox has Gmail threads with subjects', async () => {
  await page.goto(`${UI}/inbox`);
  await page.getByRole('button', { name: 'Gmail', exact: true }).last().click();
  await page.getByText('Bridal package for 12 December').first().click();
  await page.getByText('bridal hair and makeup trial').last().waitFor();
  await page.screenshot({ path: SHOTS + 'G1-demo-gmail.png' });
});

await step('G2. connecting Gmail goes through Google sign-in and back', async () => {
  await sidebarGmail().click();
  await page.getByText('Demo mailbox (simulated)').waitFor();
  await page.getByRole('button', { name: 'Connect with Google' }).click();
  await page.getByRole('status').getByText('Gmail connected').waitFor();
  assert.equal(new URL(page.url()).search, ''); // the ?gmail= result is cleared from the address bar
  const gmail = (await api('/channels', {}, token)).find(c => c.adapter_type === 'gmail');
  assert.deepEqual([gmail.name, gmail.status], [GMAIL.address, 'connected']);
  await page.screenshot({ path: SHOTS + 'G2-gmail-connected.png' });
});

await step('G3. a new customer email is synced into the inbox with its subject', async () => {
  GMAIL.inbox.push(gmailMessage('gm1', 'e2e-t1', 'Table for six on Friday', 'Hi! Could we book a table for six this Friday at 8pm?', 'Kavya Iyer <kavya@example.com>'));
  await page.getByText('Table for six on Friday').first().waitFor({ timeout: 10000 });
  await page.getByText('Kavya Iyer').first().click();
  await page.getByText('Could we book a table for six').last().waitFor();
});

await step('G4. a reply is emailed in the same thread', async () => {
  await page.fill('textarea[placeholder="Type a message..."]', 'Friday 8pm is booked for six!');
  await page.keyboard.press('Enter');
  await page.getByText('Friday 8pm is booked for six!').last().waitFor();
  const sent = GMAIL.sent.at(-1);
  assert.equal(sent.threadId, 'e2e-t1');
  const mime = Buffer.from(sent.raw, 'base64url').toString();
  assert.match(mime, /To: kavya@example.com/);
  assert.match(mime, /Subject: Re: Table for six on Friday/);
  assert.match(mime, /In-Reply-To: <gm1@mail.example.com>/);
  await page.screenshot({ path: SHOTS + 'G4-gmail-reply.png' });
});

await step('G5. revoking Google access disconnects the channel', async () => {
  GMAIL.revoked = true;
  const disconnected = async () => (await api('/channels', {}, token)).find(c => c.adapter_type === 'gmail').status === 'disconnected';
  for (let i = 0; i < 20 && !(await disconnected()); i++) await page.waitForTimeout(500);
  assert.ok(await disconnected());
  await sidebarGmail().click();
  await page.getByText('Disconnected', { exact: true }).waitFor();
  await page.getByLabel('Close').click();
});

// --- Website chat (add-website-chat) ---
const DEMO_SITE = API + '/widget/demo';
let site;
const SEEDED_VISITOR = '5f1c0a3e9b7d4c2a8e6f1b0d3c5a7e9f';
const visitorConversation = async () => (await api('/conversations', {}, token)).find(c => c.platform === 'website' && c.external_id !== SEEDED_VISITOR);

await step('WC1. the Website chat window shows the embed code and saves settings', async () => {
  await page.goto(`${UI}/inbox`);
  await page.locator('aside').getByRole('button', { name: 'Website chat' }).click();
  assert.match(await page.getByLabel('Embed code').inputValue(), /data-widget-key="[^"]+"/);
  await page.getByLabel('Greeting').fill('Hi! Ask us anything about Glow Salon.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('status').getByText('Saved.').waitFor();
  await page.screenshot({ path: SHOTS + 'WC1-website-settings.png' });
  await page.getByLabel('Close').click();
});

await step('WC2. a visitor chats on the demo page and it appears in the inbox live', async () => {
  site = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  site.on('pageerror', e => errors.push(e.message));
  await site.goto(DEMO_SITE);
  await site.getByLabel('Open chat').click();
  await site.getByText('Hi! Ask us anything about Glow Salon.').waitFor();
  await site.getByLabel('Chat message').fill('Hi, are you open today?');
  await site.keyboard.press('Enter');
  await site.locator('.uw-in', { hasText: 'Hi, are you open today?' }).waitFor();
  await page.getByText('Hi, are you open today?').first().waitFor({ timeout: 5000 });
  assert.ok(await visitorConversation());
});

await step('WC3. a staff reply reaches the open widget live', async () => {
  await page.getByText('Hi, are you open today?').first().click();
  await page.fill('textarea[placeholder="Type a message..."]', 'Yes, until 9pm!');
  await page.keyboard.press('Enter');
  await site.locator('.uw-out', { hasText: 'Yes, until 9pm!' }).waitFor({ timeout: 5000 });
  await site.screenshot({ path: SHOTS + 'WC3-widget-reply.png' });
});

await step('WC4. lead capture updates the contact in the inbox', async () => {
  await site.getByLabel('Your name').fill('Priya Menon');
  await site.getByLabel('Phone').fill('+91 98765 43210');
  await site.getByRole('button', { name: 'Save details' }).click();
  await site.getByText('Thanks, we have your details!').waitFor();
  await page.getByText('Priya Menon').first().waitFor({ timeout: 5000 });
  const contact = (await visitorConversation()).contact;
  assert.deepEqual([contact.name, contact.phone], ['Priya Menon', '+91 98765 43210']);
  await page.screenshot({ path: SHOTS + 'WC4-lead.png' });
});

await step('WC5. a returning visitor sees their history', async () => {
  await site.reload();
  await site.getByLabel('Open chat').click();
  await site.locator('.uw-in', { hasText: 'Hi, are you open today?' }).waitFor();
  await site.locator('.uw-out', { hasText: 'Yes, until 9pm!' }).waitFor();
  await site.close();
});

await step('WC6. the widget refuses unlisted websites', async () => {
  const key = (await api(`/channels/${(await api('/channels', {}, token)).find(c => c.platform === 'website').id}/widget`, {}, token)).widget_key;
  const res = await fetch(`${API}/widget/${key}/config`, { headers: { Origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
});

// --- AI playground (add-ai-agents) ---
const chat = async text => {
  const before = await page.locator('.bg-white.rounded-tl-none').filter({ hasText: /\S/ }).count();
  await page.getByPlaceholder('Message', { exact: true }).fill(text);
  await page.keyboard.press('Enter');
  // The typing indicator shares the bubble class, so wait for a new bubble with text.
  const replies = () => [...document.querySelectorAll('.bg-white.rounded-tl-none')].filter(b => b.innerText.trim());
  await page.waitForFunction(`(${replies})().length > ${before}`, null, { timeout: 10000 });
  return page.evaluate(`(${replies})().at(-1).innerText`);
};

await step('P1. playground opens the seeded demo agent with its greeting', async () => {
  await page.goto(`${UI}/ai-playground`);
  await page.getByLabel('Agent').filter({ hasText: 'Glow Assistant' }).waitFor();
  await page.getByText('Welcome to Glow Salon & Spa').first().waitFor();
});

await step('P2. chatting uses the agent knowledge', async () => {
  assert.match(await chat('What is your pricing for a haircut?'), /Haircut: 500 INR/);
  await page.screenshot({ path: SHOTS + 'P2-playground-chat.png' });
});

await step('P3. feedback creates a draft version that is tested first', async () => {
  await page.getByLabel('Feedback').fill('Always mention free parking');
  await page.getByText('Create draft').click();
  await page.getByRole('status').getByText('Draft v2 is ready').waitFor();
  await page.getByText('testing draft v2').waitFor();
  const agent = (await api('/agents', {}, token))[0];
  assert.equal(agent.active_version_number, 1);
});

await step('P4. activating the draft makes it live', async () => {
  await page.getByLabel('Activate v2').click();
  await page.getByRole('status').getByText('v2 is now live').waitFor();
  assert.equal((await api('/agents', {}, token))[0].active_version_number, 2);
});

await step('P5. a new custom skill is used on the next answer', async () => {
  await page.getByText('Connectors and skills').click();
  await page.getByText('Create New').click();
  await page.getByLabel('Skill title').fill('Gift Vouchers');
  await page.getByLabel('Skill content').fill('Vouchers from 1,000 INR, valid for one year.');
  await page.getByText('Add skill').click();
  await page.getByLabel('Use Gift Vouchers').waitFor();
  assert.equal(await page.getByLabel('Use Gift Vouchers').isChecked(), true);
  await page.screenshot({ path: SHOTS + 'P5-skills.png' });
  await page.locator('h2:has-text("Integrations Marketplace") + button').click();
  assert.match(await chat('Do you sell gift vouchers?'), /Vouchers from 1,000 INR/);
});

await step('P6. building a new agent from a business profile', async () => {
  await page.getByText('New agent').click();
  await page.getByLabel('Business name').fill('Bright Smile');
  await page.getByLabel('Business type').fill('Dental Clinic');
  await page.getByText('Next', { exact: true }).click();
  await page.getByText('Which services does your Dental Clinic get asked about most?').waitFor();
  await page.locator('textarea[required]').first().fill('Cleaning and braces');
  await page.locator('select[required]').first().selectOption('Phone');
  await page.getByLabel('Agent name').fill('Smiley');
  await page.screenshot({ path: SHOTS + 'P6-builder.png' });
  await page.getByText('Generate agent').click();
  await page.getByRole('status').getByText('Smiley is ready').waitFor();
  await page.getByText('Hello! Welcome to Bright Smile').first().waitFor();
  assert.equal((await api('/agents', {}, token)).length, 2);
});

await step('9. reset demo restores the seed', async () => {
  await page.goto(`${UI}/inbox`);
  await page.getByText('Meera').first().waitFor();
  page.once('dialog', d => d.accept());
  await page.getByText('Reset demo data').click();
  await page.waitForFunction(() => !document.body.innerText.includes('Meera'), null, { timeout: 5000 });
  await page.getByText('Rahul Kumar').first().waitFor();
  const conversations = await api('/conversations', {}, token);
  assert.equal(conversations.length, 10);
  const agents = await api('/agents', {}, token);
  assert.equal(agents.length, 1);
  assert.equal(agents[0].active_version_number, 1);
  assert.deepEqual((await api('/channels', {}, token)).map(c => c.adapter_type).sort(), ['simulated', 'simulated', 'simulated', 'simulated', 'website']);
  await page.screenshot({ path: SHOTS + '9-reset.png' });
});

await step('10. log out returns to login', async () => {
  await page.getByLabel('Log out').click();
  await page.waitForURL('**/login');
});

await browser.close();
graph.close();
const relevant = errors.filter(e => !e.includes('401') && !e.includes('favicon'));
assert.deepEqual(relevant, [], 'browser console errors');
console.log('ALL UI FLOW STEPS PASSED');
