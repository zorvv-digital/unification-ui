import { apiService } from '../context/MessagingContext';

// Shapes match the backend responses (snake_case) one to one.

export interface AgentVersion {
  id: string;
  version_number: number;
  system_prompt: string;
  greeting_message: string;
  personality: string | null;
  rules: string[];
  skills: { skill_name: string; description: string }[];
  source: 'generated' | 'manual' | 'feedback';
  feedback: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Agent {
  id: string;
  name: string;
  active_version_number: number;
  active_version: AgentVersion;
  knowledge_ids: string[];
}

export interface AgentSummary {
  id: string;
  name: string;
  active_version_number: number;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  category: string;
  description: string;
  content: string;
  enabled: boolean;
}

export interface BusinessProfile {
  business_name: string;
  business_type: string;
  location?: string;
  offerings?: string[];
  working_hours?: string;
}

export interface ProfilerField {
  field_id: string;
  question_text: string;
  ui_type: 'text' | 'textarea' | 'select' | 'multiselect';
  options: string[] | null;
  is_required: boolean;
}

export interface Channel {
  id: string;
  platform: string;
  name: string;
  ai_enabled: boolean;
  ai_agent_id: string | null;
}

export interface AgentSetup {
  agent_name?: string;
  personality?: string;
  business_objective?: string;
  rules?: string[];
}

const api = () => {
  if (!apiService) throw new Error('AI features need VITE_API_URL');
  return apiService;
};

const post = <T>(path: string, body?: unknown) =>
  api().request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const aiApi = {
  listAgents: () => api().request<AgentSummary[]>('/agents'),
  getAgent: (id: string) => api().request<Agent>(`/agents/${id}`),
  listVersions: (id: string) => api().request<AgentVersion[]>(`/agents/${id}/versions`),
  saveVersion: (id: string, changes: Partial<Pick<AgentVersion, 'system_prompt' | 'greeting_message'>>) =>
    post<AgentVersion>(`/agents/${id}/versions`, changes),
  refine: (id: string, feedback: string) => post<AgentVersion>(`/agents/${id}/refine`, { feedback }),
  activate: (id: string, version: number) => post<Agent>(`/agents/${id}/versions/${version}/activate`),
  chat: (id: string, message: string, sessionId?: string, versionNumber?: number) =>
    post<{ reply: string; session_id: string; version_number: number }>(`/agents/${id}/playground/chat`, {
      message, session_id: sessionId, version_number: versionNumber,
    }),
  profilerQuestions: (profile: BusinessProfile) => post<{ fields: ProfilerField[] }>('/agents/profiler/questions', profile),
  generate: (profile: BusinessProfile, answers: Record<string, unknown>, setup: AgentSetup) =>
    post<Agent>('/agents/generate', { business_profile: profile, collected_answers: answers, agent_setup: setup }),

  listKnowledge: () => api().request<KnowledgeItem[]>('/knowledge'),
  createKnowledge: (item: Pick<KnowledgeItem, 'title' | 'category' | 'description' | 'content'>) =>
    post<KnowledgeItem>('/knowledge', item),
  updateKnowledge: (id: string, changes: Partial<KnowledgeItem>) =>
    api().request<KnowledgeItem>(`/knowledge/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  // Inbox AI replies
  listChannels: () => api().request<Channel[]>('/channels'),
  updateChannel: (id: string, changes: { ai_enabled?: boolean; ai_agent_id?: string }) =>
    api().request<Channel>(`/channels/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  setConversationMode: (id: string, mode: 'ai' | 'human') =>
    api().request<unknown>(`/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ mode }) }),
  suggestReply: (id: string) => post<{ suggestion: string }>(`/conversations/${id}/suggest-reply`),
  simulateCustomer: (id: string, content: string) => post<unknown>(`/demo/conversations/${id}/simulate`, { content }),

  attach: (agentId: string, itemId: string) => post<void>(`/agents/${agentId}/knowledge/${itemId}`),
  detach: (agentId: string, itemId: string) =>
    api().request<void>(`/agents/${agentId}/knowledge/${itemId}`, { method: 'DELETE' }),
};
