// Demo customer app: the customer side of the demo workspace's simulated channels (backend `/customer-app`).
// Public API, no staff login; the session token identifies the customer.

export type CustomerPlatform = 'whatsapp' | 'instagram' | 'messenger' | 'gmail';

export interface CustomerMessage {
  id: string;
  platform: CustomerPlatform;
  direction: 'inbound' | 'outbound'; // inbound = sent by the customer
  type: string;
  content: string;
  status: string;
  timestamp: string;
}

export interface CustomerSession {
  customer_token: string;
  name: string;
}

export interface CustomerAppConfig {
  business_name: string;
  platforms: CustomerPlatform[];
}

const STORAGE_KEY = 'customer-app-session';

/** The API answered 401: the stored session is gone and the customer must start again. */
export class SessionExpired extends Error {}

export const apiUrl = () => import.meta.env.VITE_API_URL as string | undefined;

// Storage can be missing or throw (private mode, blocked site data); the app then just forgets the session.
export const loadSession = (): CustomerSession | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const saveSession = (session: CustomerSession) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); } catch { /* not persisted */ }
};
export const clearSession = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* nothing stored */ }
};

async function call<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const base = apiUrl();
  if (!base) throw new Error('The customer app needs VITE_API_URL');
  const res = await fetch(`${base}/customer-app${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token && { 'X-Customer-Token': token }) },
  });
  if (res.status === 401) {
    clearSession();
    throw new SessionExpired('Your session ended; please start again');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : detail?.[0]?.msg ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const customerApi = {
  config: () => call<CustomerAppConfig>('/config'),
  start: async (name: string) => {
    const session = await call<CustomerSession>('/sessions', { method: 'POST', body: JSON.stringify({ name }) });
    saveSession(session);
    return session;
  },
  history: (token: string) => call<CustomerMessage[]>('/messages', {}, token),
  send: (token: string, platform: CustomerPlatform, content: string, subject?: string) =>
    call<CustomerMessage>('/messages', { method: 'POST', body: JSON.stringify({ platform, content, subject }) }, token),
  /** Live `message.created` and `conversation.read` events; close the returned source when done. */
  events: (token: string, onMessage: (m: CustomerMessage) => void, onRead: (platform: CustomerPlatform) => void) => {
    const source = new EventSource(`${apiUrl()}/customer-app/events?token=${encodeURIComponent(token)}`);
    source.addEventListener('message.created', e => onMessage(JSON.parse((e as MessageEvent).data)));
    source.addEventListener('conversation.read', e => onRead(JSON.parse((e as MessageEvent).data).platform));
    return source;
  },
};
