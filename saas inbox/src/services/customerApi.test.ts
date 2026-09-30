import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customerApi, loadSession, SessionExpired } from './customerApi';

const storage = () => {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
};
const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('customerApi', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'http://api.test/api/v1');
    vi.stubGlobal('localStorage', storage());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps the session after starting one', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { customer_token: 't1', name: 'Priya' })));
    await customerApi.start('Priya');
    expect(loadSession()).toEqual({ customer_token: 't1', name: 'Priya' });
  });

  it('forgets the session when the API answers 401', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { customer_token: 't1', name: 'Priya' })));
    await customerApi.start('Priya');
    const fetchMock = vi.fn(() => reply(401, { detail: 'Invalid customer session' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(customerApi.history('t1')).rejects.toBeInstanceOf(SessionExpired);
    expect(loadSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/v1/customer-app/messages', expect.objectContaining({
      headers: expect.objectContaining({ 'X-Customer-Token': 't1' }),
    }));
  });

  it('shows the API error detail, including validation errors', async () => {
    vi.stubGlobal('fetch', vi.fn(() => reply(422, { detail: 'The first email needs a subject' })));
    await expect(customerApi.send('t1', 'gmail', 'Hi')).rejects.toThrow('The first email needs a subject');
    vi.stubGlobal('fetch', vi.fn(() => reply(422, { detail: [{ msg: 'String should have at most 2000 characters' }] })));
    await expect(customerApi.send('t1', 'whatsapp', 'x')).rejects.toThrow('at most 2000');
  });

  it('works without storage', async () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSession()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(() => reply(200, { customer_token: 't1', name: 'Priya' })));
    await expect(customerApi.start('Priya')).resolves.toMatchObject({ customer_token: 't1' });
  });
});
