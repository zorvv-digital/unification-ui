import type { Contact, Conversation, Message } from '../types/messaging';

export const messengerContacts: Contact[] = [
  { id: 'me', name: 'Me', avatar: 'https://i.pravatar.cc/150?u=me' },
  { id: 'm_c1', name: 'Tech Group', avatar: 'https://i.pravatar.cc/150?u=tech', online: true },
  { id: 'm_c2', name: 'Charlie', avatar: 'https://i.pravatar.cc/150?u=charlie', online: false },
  { id: 'm_c3', name: 'Diana', avatar: 'https://i.pravatar.cc/150?u=diana', online: true }
];

export const messengerConversations: Conversation[] = [
  {
    id: 'm1',
    platform: 'messenger',
    contactId: 'm_c1',
    lastMessageId: 'm1_m3',
    lastMessageAt: '11:20 AM',
    unreadCount: 5,
    status: 'open'
  },
  {
    id: 'm2',
    platform: 'messenger',
    contactId: 'm_c2',
    lastMessageId: 'm2_m1',
    lastMessageAt: '9:00 AM',
    unreadCount: 0,
    status: 'open'
  },
  {
    id: 'm3',
    platform: 'messenger',
    contactId: 'm_c3',
    lastMessageId: 'm3_m2',
    lastMessageAt: 'Yesterday',
    unreadCount: 0,
    status: 'open'
  }
];

export const messengerMessages: Message[] = [
  { id: 'm1_m1', conversationId: 'm1', platform: 'messenger', senderId: 'm_c1', type: 'text', content: 'Anyone tried Next.js 14?', timestamp: '11:15 AM', direction: 'inbound', status: 'read' },
  { id: 'm1_m2', conversationId: 'm1', platform: 'messenger', senderId: 'me', type: 'text', content: 'Yeah, server actions are cool.', timestamp: '11:18 AM', direction: 'outbound', status: 'read' },
  { id: 'm1_m3', conversationId: 'm1', platform: 'messenger', senderId: 'm_c1', type: 'text', content: 'Check out this new framework.', timestamp: '11:20 AM', direction: 'inbound', status: 'delivered' },

  { id: 'm2_m1', conversationId: 'm2', platform: 'messenger', senderId: 'm_c2', type: 'text', content: 'Are you free tonight?', timestamp: '9:00 AM', direction: 'inbound', status: 'read' },

  { id: 'm3_m1', conversationId: 'm3', platform: 'messenger', senderId: 'me', type: 'text', content: 'Here is the repo link', timestamp: 'Yesterday', direction: 'outbound', status: 'read' },
  { id: 'm3_m2', conversationId: 'm3', platform: 'messenger', senderId: 'm_c3', type: 'text', content: 'Thanks!', timestamp: 'Yesterday', direction: 'inbound', status: 'read' }
];
