import type { Conversation, Message } from '../../types/messaging';

export interface MessageService {
  sendMessage(conversationId: string, content: string, type: Message['type']): Promise<Message>;
  receiveMessage(conversationId: string, content: string, type: Message['type'], adContext?: Message['adContext']): Promise<Message>;
  markAsRead(conversationId: string): Promise<void>;
  getConversations(): Promise<Conversation[]>;
  getMessages(conversationId: string): Promise<Message[]>;
}
