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

export interface Conversation {
  id: string;
  platform: Platform;
  contactId: string;
  externalId?: string;
  lastMessageId?: string;
  lastMessageAt: number;
  unreadCount: number;
  status: ConversationStatus;
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
}
