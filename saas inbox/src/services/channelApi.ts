import { apiService } from '../context/MessagingContext';

// Shapes match the backend responses (snake_case) one to one.

export interface Channel {
  id: string;
  platform: string;
  name: string;
  adapter_type: 'simulated' | 'whatsapp' | 'messenger' | 'instagram' | string;
  status: 'connected' | 'disconnected' | string;
  ai_enabled: boolean;
  ai_agent_id: string | null;
}

export interface WebhookInfo {
  webhook_url: string;
  verify_token: string;
}

export interface WhatsAppCredentials {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  app_secret: string;
}

export interface MetaCredentials {
  page_id: string;
  page_access_token: string;
  app_secret: string;
}

export interface WidgetSettings {
  widget_key: string;
  allowed_domains: string[];
  greeting: string;
  lead_fields: ('name' | 'email' | 'phone')[];
  embed_snippet: string;
}

export interface Template {
  name: string;
  language: string;
  category: string;
  body: string;
  parameter_count: number;
}

const api = () => {
  if (!apiService) throw new Error('Channels need VITE_API_URL');
  return apiService;
};

export const channelApi = {
  listChannels: () => api().request<Channel[]>('/channels'),
  connectWhatsApp: (credentials: WhatsAppCredentials) =>
    api().request<Channel & WebhookInfo>('/channels/whatsapp', { method: 'POST', body: JSON.stringify(credentials) }),
  connectMeta: (credentials: MetaCredentials) =>
    api().request<(Channel & WebhookInfo)[]>('/channels/meta', { method: 'POST', body: JSON.stringify(credentials) }),
  createWebsiteChat: (settings: Partial<Omit<WidgetSettings, 'widget_key' | 'embed_snippet'>>) =>
    api().request<Channel>('/channels/website', { method: 'POST', body: JSON.stringify(settings) }),
  getWidget: (id: string) => api().request<WidgetSettings>(`/channels/${id}/widget`),
  updateWidget: (id: string, settings: Partial<Omit<WidgetSettings, 'widget_key' | 'embed_snippet'>>) =>
    api().request<WidgetSettings>(`/channels/${id}/widget`, { method: 'PATCH', body: JSON.stringify(settings) }),
  authorizeGmail: () => api().request<{ authorize_url: string }>('/channels/gmail/authorize', { method: 'POST' }),
  webhookInfo: (id: string) => api().request<WebhookInfo>(`/channels/${id}/webhook`),
  disconnect: (id: string) => api().request<void>(`/channels/${id}`, { method: 'DELETE' }),
  listTemplates: (id: string) => api().request<Template[]>(`/channels/${id}/templates`),
  sendTemplate: (conversationId: string, template: Pick<Template, 'name' | 'language'>, parameters: string[]) =>
    api().request<unknown>(`/conversations/${conversationId}/template`, {
      method: 'POST', body: JSON.stringify({ ...template, parameters }),
    }),
};
