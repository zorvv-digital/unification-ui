import type { Contact, Conversation, Message } from '../types/messaging';

export const instagramContacts: Contact[] = [
  { id: 'me', name: 'Me', username: 'my_insta', avatar: 'https://i.pravatar.cc/150?u=me' },
  { id: 'i_c1', name: 'Jane Doe', username: 'janedoe99', avatar: 'https://i.pravatar.cc/150?u=jane', online: true },
  { id: 'i_c2', name: 'Travel Vibes', username: 'travelvibes', avatar: 'https://i.pravatar.cc/150?u=travel', online: false },
  { id: 'i_c3', name: 'Mark Smith', username: 'mark.smith', avatar: 'https://i.pravatar.cc/150?u=mark', online: true }
];

export const instagramConversations: Conversation[] = [
  {
    id: 'i1',
    platform: 'instagram',
    contactId: 'i_c1',
    lastMessageId: 'i1_m3',
    lastMessageAt: '2h',
    unreadCount: 1,
    status: 'open'
  },
  {
    id: 'i2',
    platform: 'instagram',
    contactId: 'i_c2',
    lastMessageId: 'i2_m1',
    lastMessageAt: '5h',
    unreadCount: 0,
    status: 'open'
  },
  {
    id: 'i3',
    platform: 'instagram',
    contactId: 'i_c3',
    lastMessageId: 'i3_m1',
    lastMessageAt: '1d',
    unreadCount: 0,
    status: 'open'
  }
];

export const instagramMessages: Message[] = [
  { id: 'i1_m1', conversationId: 'i1', platform: 'instagram', senderId: 'i_c1', type: 'text', content: 'Did you see that new cafe?', timestamp: '3h', direction: 'inbound', status: 'read' },
  { id: 'i1_m2', conversationId: 'i1', platform: 'instagram', senderId: 'me', type: 'text', content: 'Yeah, we should go this weekend!', timestamp: '2.5h', direction: 'outbound', status: 'read' },
  { id: 'i1_m3', conversationId: 'i1', platform: 'instagram', senderId: 'i_c1', type: 'text', content: 'Reacted 😂 to your message', timestamp: '2h', direction: 'inbound', status: 'delivered' },

  { id: 'i2_m1', conversationId: 'i2', platform: 'instagram', senderId: 'i_c2', type: 'text', content: 'Sent a reel by @nature', timestamp: '5h', direction: 'inbound', status: 'read' },

  { id: 'i3_m1', conversationId: 'i3', platform: 'instagram', senderId: 'i_c3', type: 'text', content: 'How was the trip?', timestamp: '1d', direction: 'inbound', status: 'read' }
];
