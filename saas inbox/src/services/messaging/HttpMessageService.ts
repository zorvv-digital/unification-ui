import type { MessageService } from './MessageService';
import type { Consent, Contact, ContactProductInterest, ContactTag, Conversation, Message, Platform, ProductStatus } from '../../types/messaging';

const TOKEN_KEY = 'unification.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

// --- API shapes (snake_case, ISO timestamps) ---

export interface ApiContact {
  id: string;
  name: string;
  username: string | null;
  avatar: string | null;
  phone: string | null;
  email: string | null;
  birthday?: string | null;
  anniversary?: string | null;
  notes?: string | null;
  consent?: Consent;
  tags?: ContactTag[];
  product_status?: ProductStatus;
  product_interests?: ContactProductInterest[];
  product_classified_at?: string | null;
}

export interface ApiConversation {
  id: string;
  platform: Platform;
  channel_id: string;
  external_id: string;
  subject?: string | null;
  status: 'open' | 'closed';
  unread_count: number;
  last_message_at: string | null;
  mode: 'ai' | 'human';
  needs_human: boolean;
  contact: ApiContact;
}

export interface ApiMessage {
  id: string;
  conversation_id: string;
  platform: Platform;
  direction: 'inbound' | 'outbound';
  type: Message['type'];
  content: string;
  status: string;
  external_id: string | null;
  author: 'customer' | 'staff' | 'agent';
  timestamp: string;
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  workspace: { id: string; name: string; is_demo: boolean };
}

// --- Mapping to the frontend's existing camelCase / epoch types ---

export const toContact = (c: ApiContact): Contact => ({
  id: c.id,
  name: c.name,
  username: c.username ?? undefined,
  avatar: c.avatar ?? undefined,
  phone: c.phone ?? undefined,
  email: c.email ?? undefined,
  birthday: c.birthday ?? undefined,
  anniversary: c.anniversary ?? undefined,
  notes: c.notes ?? undefined,
  consent: c.consent,
  tags: c.tags ?? [],
  productStatus: c.product_status,
  productInterests: c.product_interests ?? [],
  productClassifiedAt: c.product_classified_at ?? undefined,
});

export const toConversation = (c: ApiConversation): Conversation => ({
  id: c.id,
  platform: c.platform,
  contactId: c.contact.id,
  channelId: c.channel_id,
  externalId: c.external_id,
  subject: c.subject ?? undefined,
  lastMessageAt: c.last_message_at ? Date.parse(c.last_message_at) : 0,
  unreadCount: c.unread_count,
  status: c.status,
  mode: c.mode,
  needsHuman: c.needs_human,
});

// Inbound messages are grouped by sender in the UI, so any stable non-'me' id works.
export const toMessage = (m: ApiMessage): Message => ({
  id: m.id,
  externalId: m.external_id ?? undefined,
  conversationId: m.conversation_id,
  platform: m.platform,
  senderId: m.direction === 'outbound' ? 'me' : `contact:${m.conversation_id}`,
  type: m.type,
  content: m.content,
  timestamp: Date.parse(m.timestamp),
  direction: m.direction,
  status: m.status,
  author: m.author,
});

export class HttpMessageService implements MessageService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (auth && token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (res.status === 401 && auth) {
      clearToken();
      window.location.href = '/login';
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const detail = body.detail;
      const message = typeof detail === 'string'
        ? detail
        : Array.isArray(detail) && typeof detail[0]?.msg === 'string'
          ? detail[0].msg
          : `Request failed (${res.status})`;
      throw new Error(message);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  async login(email: string, password: string): Promise<void> {
    const { access_token } = await this.request<{ access_token: string }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }, false,
    );
    setToken(access_token);
  }

  me() {
    return this.request<ApiUser>('/auth/me');
  }

  resetDemo() {
    return this.request<void>('/demo/reset', { method: 'POST' });
  }

  /** Loads everything the context holds: conversations with contacts, then each conversation's messages. */
  async loadAll(): Promise<{ contacts: Contact[]; conversations: Conversation[]; messages: Message[] }> {
    const apiConversations = await this.request<ApiConversation[]>('/conversations');
    // ponytail: one request per conversation; fine at demo scale, switch to previews + lazy loading for large inboxes.
    const messageLists = await Promise.all(apiConversations.map(c => this.getMessages(c.id)));
    return {
      contacts: apiConversations.map(c => toContact(c.contact)),
      conversations: apiConversations.map(toConversation),
      messages: messageLists.flat(),
    };
  }

  /** Opens the live event stream; returns it so the caller can close it. */
  subscribe(handlers: {
    onMessage: (m: Message) => void;
    onMessageUpdated: (m: Message) => void;
    onConversation: (c: Conversation, contact: Contact) => void;
  }): EventSource {
    const source = new EventSource(`${this.baseUrl}/events?token=${encodeURIComponent(getToken() ?? '')}`);
    source.addEventListener('message.created', e => handlers.onMessage(toMessage(JSON.parse((e as MessageEvent).data))));
    source.addEventListener('message.updated', e => handlers.onMessageUpdated(toMessage(JSON.parse((e as MessageEvent).data))));
    source.addEventListener('conversation.updated', e => {
      const c: ApiConversation = JSON.parse((e as MessageEvent).data);
      handlers.onConversation(toConversation(c), toContact(c.contact));
    });
    return source;
  }

  async sendMessage(conversationId: string, content: string, type: Message['type']): Promise<Message> {
    const m = await this.request<ApiMessage>(`/conversations/${conversationId}/messages`, {
      method: 'POST', body: JSON.stringify({ content, type }),
    });
    return toMessage(m);
  }

  /** Posts to the conversation's simulated channel webhook; the message itself arrives via the event stream. */
  async simulateInbound(conversation: Conversation, content: string, type: Message['type']): Promise<void> {
    await this.request(`/webhooks/${conversation.channelId}`, {
      method: 'POST', body: JSON.stringify({ customer_id: conversation.externalId, content, type }),
    }, false);
  }

  async receiveMessage(): Promise<Message> {
    throw new Error('Use simulateInbound; inbound messages arrive through the event stream');
  }

  async markAsRead(conversationId: string): Promise<void> {
    await this.request(`/conversations/${conversationId}/read`, { method: 'POST' });
  }

  async getConversations(): Promise<Conversation[]> {
    return (await this.request<ApiConversation[]>('/conversations')).map(toConversation);
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return (await this.request<ApiMessage[]>(`/conversations/${conversationId}/messages`)).map(toMessage);
  }
}
