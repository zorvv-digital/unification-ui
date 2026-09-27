import type { Contact, Conversation, Message } from '../types/messaging';

export const whatsappContacts: Contact[] = [
  { id: 'me', name: 'Me', avatar: 'https://i.pravatar.cc/150?u=me' },
  { id: 'w_c1', name: 'Alice', avatar: 'https://i.pravatar.cc/150?u=alice', online: true },
  { id: 'w_c2', name: 'Family Group', avatar: 'https://i.pravatar.cc/150?u=family', online: false },
  { id: 'w_c3', name: 'Bob', avatar: 'https://i.pravatar.cc/150?u=bob', online: true }
];

export const whatsappConversations: Conversation[] = [
  {
    id: 'w1',
    platform: 'whatsapp',
    contactId: 'w_c1',
    lastMessageId: 'm4',
    lastMessageAt: '10:45 AM',
    unreadCount: 2,
    status: 'open'
  },
  {
    id: 'w2',
    platform: 'whatsapp',
    contactId: 'w_c2',
    lastMessageId: 'm2',
    lastMessageAt: 'Yesterday',
    unreadCount: 0,
    status: 'open'
  },
  {
    id: 'w3',
    platform: 'whatsapp',
    contactId: 'w_c3',
    lastMessageId: 'm1',
    lastMessageAt: 'Yesterday',
    unreadCount: 0,
    status: 'open'
  }
];

export const whatsappMessages: Message[] = [
  { id: 'w1_m1', conversationId: 'w1', platform: 'whatsapp', senderId: 'w_c1', type: 'text', content: 'Hey! Are we still on for lunch?', timestamp: '10:30 AM', direction: 'inbound', status: 'read' },
  { id: 'w1_m2', conversationId: 'w1', platform: 'whatsapp', senderId: 'me', type: 'text', content: 'Yes! Same place as usual?', timestamp: '10:35 AM', direction: 'outbound', status: 'read' },
  { id: 'w1_m3', conversationId: 'w1', platform: 'whatsapp', senderId: 'w_c1', type: 'text', content: 'Yep, perfect.', timestamp: '10:40 AM', direction: 'inbound', status: 'read' },
  { id: 'w1_m4', conversationId: 'w1', platform: 'whatsapp', senderId: 'w_c1', type: 'text', content: 'Sounds good, see you then!', timestamp: '10:45 AM', direction: 'inbound', status: 'delivered' },
  
  { id: 'w2_m1', conversationId: 'w2', platform: 'whatsapp', senderId: 'w_c2', type: 'text', content: 'Who is bringing dessert?', timestamp: 'Yesterday', direction: 'inbound', status: 'read' },
  { id: 'w2_m2', conversationId: 'w2', platform: 'whatsapp', senderId: 'w_c2', type: 'text', content: 'Mom: Dinner is ready!', timestamp: 'Yesterday', direction: 'inbound', status: 'delivered' },

  { id: 'w3_m1', conversationId: 'w3', platform: 'whatsapp', senderId: 'w_c3', type: 'text', content: 'Can you send me the files?', timestamp: 'Yesterday', direction: 'inbound', status: 'read' }
];
