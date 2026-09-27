import type { Message, Platform } from '../types/messaging';

export interface MessageService {
  sendMessage(conversationId: string, content: string, type: Message['type'], senderId: string, platform: Platform): Promise<Message>;
  receiveMessage(payload: Omit<Message, 'id'>): Promise<Message>;
  markAsRead(conversationId: string): Promise<void>;
}

export class MockMessageService implements MessageService {
  async sendMessage(conversationId: string, content: string, type: Message['type'], senderId: string, platform: Platform): Promise<Message> {
    const newMessage: Message = {
      id: Date.now().toString(),
      conversationId,
      platform,
      senderId,
      type,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      direction: 'outbound',
      status: 'sent'
    };

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 300));
    return newMessage;
  }

  async receiveMessage(payload: Omit<Message, 'id'>): Promise<Message> {
    const newMessage: Message = {
      ...payload,
      id: Date.now().toString(),
      direction: 'inbound',
    };

    await new Promise(resolve => setTimeout(resolve, 300));
    return newMessage;
  }

  async markAsRead(conversationId: string): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
