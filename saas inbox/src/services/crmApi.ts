import { apiService } from '../context/MessagingContext';
import type { ApiContact } from './messaging/HttpMessageService';
import type { Consent, ContactTag } from '../types/messaging';

// Shapes match the backend responses (snake_case) one to one.

export interface ContactListItem extends ApiContact {
  platforms: string[];
  last_activity_at: string | null;
}

export interface ContactChanges {
  name?: string;
  phone?: string | null;
  email?: string | null;
  birthday?: string | null;
  anniversary?: string | null;
  notes?: string | null;
  consent?: Consent;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
}

export interface SegmentRules {
  tags: string[];
  tags_match: 'any' | 'all';
  exclude_tags: string[];
  platforms: string[];
  active_within_days: number | null;
  consent: Consent[];
  birthday_within_days: number | null;
  products: string[];
  products_match: 'any' | 'all';
}

export interface Segment {
  id: string;
  name: string;
  rules: SegmentRules;
  count: number;
}

export interface SegmentMembers {
  count: number;
  members: ContactListItem[];
}

export const emptyRules = (): SegmentRules => ({
  tags: [], tags_match: 'any', exclude_tags: [], platforms: [], active_within_days: null, consent: [], birthday_within_days: null,
  products: [], products_match: 'any',
});

const api = () => {
  if (!apiService) throw new Error('Contacts need VITE_API_URL');
  return apiService;
};
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const crmApi = {
  listContacts: (q = '', tagIds: string[] = [], productIds: string[] = [], productStatus?: 'pending' | 'determined' | 'not_determined') => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    tagIds.forEach(id => params.append('tag_ids', id));
    productIds.forEach(id => params.append('product_ids', id));
    if (productStatus) params.set('product_status', productStatus);
    return api().request<ContactListItem[]>(`/contacts?${params}`);
  },
  updateContact: (id: string, changes: ContactChanges) => api().request<ApiContact>(`/contacts/${id}`, json('PATCH', changes)),
  addTag: (contactId: string, tagId: string) => api().request<ApiContact>(`/contacts/${contactId}/tags/${tagId}`, { method: 'POST' }),
  removeTag: (contactId: string, tagId: string) => api().request<ApiContact>(`/contacts/${contactId}/tags/${tagId}`, { method: 'DELETE' }),
  merge: (targetId: string, sourceId: string) =>
    api().request<ApiContact>(`/contacts/${targetId}/merge`, json('POST', { source_contact_id: sourceId })),
  importCsv: (csv: string) => api().request<ImportResult>('/contacts/import', json('POST', { csv })),

  listTags: () => api().request<ContactTag[]>('/tags'),
  createTag: (name: string, color: string) => api().request<ContactTag>('/tags', json('POST', { name, color })),
  updateTag: (id: string, changes: Partial<Omit<ContactTag, 'id'>>) => api().request<ContactTag>(`/tags/${id}`, json('PATCH', changes)),
  deleteTag: (id: string) => api().request<void>(`/tags/${id}`, { method: 'DELETE' }),

  listSegments: () => api().request<Segment[]>('/segments'),
  previewSegment: (rules: SegmentRules, limit = 10) => api().request<SegmentMembers>('/segments/preview', json('POST', { rules, limit })),
  createSegment: (name: string, rules: SegmentRules) => api().request<Segment>('/segments', json('POST', { name, rules })),
  updateSegment: (id: string, changes: { name?: string; rules?: SegmentRules }) =>
    api().request<Segment>(`/segments/${id}`, json('PATCH', changes)),
  deleteSegment: (id: string) => api().request<void>(`/segments/${id}`, { method: 'DELETE' }),
};

export const TAG_COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#6b7280'];
