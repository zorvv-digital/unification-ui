export type Platform = 'whatsapp' | 'instagram' | 'messenger' | 'gmail' | 'website';

export type Consent = 'opted_in' | 'opted_out' | 'unknown';

export interface ContactTag {
  id: string;
  name: string;
  color: string;
}

export interface Contact {
  id: string;
  name: string;
  tags?: ContactTag[];
  birthday?: string;
  anniversary?: string;
  notes?: string;
  consent?: Consent;
  username?: string;
  avatar?: string;
  phone?: string;
  email?: string;
  online?: boolean;
}

export type ConversationStatus = 'open' | 'closed';
export type ConversationMode = 'ai' | 'human';

export interface Conversation {
  id: string;
  platform: Platform;
  contactId: string;
  channelId?: string;
  externalId?: string;
  subject?: string;
  lastMessageId?: string;
  lastMessageAt: number;
  unreadCount: number;
  status: ConversationStatus;
  mode?: ConversationMode;
  needsHuman?: boolean;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'emoji' | 'template';
export type MessageDirection = 'inbound' | 'outbound';

export interface Message {
  id: string;
  externalId?: string;
  conversationId: string;
  platform: Platform;
  senderId: string;
  type: MessageType;
  content: string;
  timestamp: number;
  direction: MessageDirection;
  status?: string;
  author?: 'customer' | 'staff' | 'agent';
}
