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

await step('9. reset demo restores the seed', async () => {
  await page.goto(`${UI}/inbox`);
  await page.getByText('Meera').first().waitFor();
  page.once('dialog', d => d.accept());
  await page.getByText('Reset demo data').click();
  await page.waitForFunction(() => !document.body.innerText.includes('Meera'), null, { timeout: 5000 });
  await page.getByText('Rahul Kumar').first().waitFor();
  const conversations = await api('/conversations', {}, token);
  assert.equal(conversations.length, 6);
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
