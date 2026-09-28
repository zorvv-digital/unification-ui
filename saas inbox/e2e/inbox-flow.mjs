// End-to-end check of docs/ui-user-flow.md against a running backend and saas inbox.
// Run: npm run e2e   (backend on :8000 with DEMO_MODE=true, `npm run dev` on :5173)
// Uses an installed browser via BROWSER_CHANNEL (default msedge; chrome also works).
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
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
  await page.screenshot({ path: SHOTS + 'A7-auto-reply.png' });
  await page.getByText('Enable Automation').click();
  await waitPressed('AI auto-reply', 'true');
  const channels = await api('/channels', {}, token);
  assert.deepEqual(channels.filter(c => c.ai_enabled).map(c => c.platform), ['whatsapp']);
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
  assert.equal(conversations.length, 6);
  const agents = await api('/agents', {}, token);
  assert.equal(agents.length, 1);
  assert.equal(agents[0].active_version_number, 1);
  await page.screenshot({ path: SHOTS + '9-reset.png' });
});

await step('10. log out returns to login', async () => {
  await page.getByLabel('Log out').click();
  await page.waitForURL('**/login');
});

await browser.close();
const relevant = errors.filter(e => !e.includes('401') && !e.includes('favicon'));
assert.deepEqual(relevant, [], 'browser console errors');
console.log('ALL UI FLOW STEPS PASSED');
