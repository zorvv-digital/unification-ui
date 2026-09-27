export type Platform = 'whatsapp' | 'instagram' | 'messenger';

export interface Contact {
  id: string;
  name: string;
  username?: string;
  avatar: string;
  online?: boolean;
}

export interface Conversation {
  id: string;
  platform: Platform;
  contactId: string;
  externalId?: string;
  lastMessageId?: string;
  lastMessageAt?: string;
  unreadCount: number;
  status: 'open' | 'closed';
}

export interface Message {
  id: string;
  externalId?: string;
  conversationId: string;
  platform: Platform;
  senderId: string; // 'me' or contactId
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'emoji';
  content: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  status?: 'sent' | 'delivered' | 'read';
}
