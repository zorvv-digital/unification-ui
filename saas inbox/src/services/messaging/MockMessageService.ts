import type { MessageService } from './MessageService';
import type { Conversation, Message } from '../../types/messaging';

export class MockMessageService implements MessageService {
  async sendMessage(conversationId: string, content: string, type: Message['type']): Promise<Message> {
    return {
      id: Math.random().toString(36).substring(2, 11),
      conversationId,
      platform: 'whatsapp', // Mock default for Phase 1
      senderId: 'me',
      type,
      content,
      timestamp: Date.now(),
      direction: 'outbound',
      status: 'sent'
    };
  }

  async receiveMessage(conversationId: string, content: string, type: Message['type']): Promise<Message> {
    return {
      id: Math.random().toString(36).substring(2, 11),
      conversationId,
      platform: 'whatsapp', // Mock default for Phase 1
      senderId: 'other',
      type,
      content,
      timestamp: Date.now(),
      direction: 'inbound',
      status: 'delivered'
    };
  }

  async markAsRead(_conversationId: string): Promise<void> {
    // No internal state mutation, just an I/O abstraction
    return Promise.resolve();
  }

  async getConversations(): Promise<Conversation[]> {
    // Empty for Phase 1
    return [];
  }

  async getMessages(_conversationId: string): Promise<Message[]> {
    // Empty for Phase 1
    return [];
  }
}
