export type Platform = 'whatsapp' | 'instagram' | 'messenger' | 'gmail';

export interface Contact {
  id: string;
  name: string;
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
  lastMessageId?: string;
  lastMessageAt: number;
  unreadCount: number;
  status: ConversationStatus;
  mode?: ConversationMode;
  needsHuman?: boolean;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'file' | 'emoji';
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
