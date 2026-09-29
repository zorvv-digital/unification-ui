import type { Contact, Conversation, Message } from '../../types/messaging';

export const mockContacts: Contact[] = [
  { id: 'c1', name: 'Rahul Kumar', online: true, avatar: 'https://i.pravatar.cc/150?u=c1', phone: '+1 (555) 0123-4567', email: 'rahul@example.com' },
  { id: 'c2', name: 'Sarah', username: '@sarah_designs', online: false, avatar: 'https://i.pravatar.cc/150?u=c2', phone: '+1 (555) 9876-5432', email: 'sarah@designs.com' },
  { id: 'c3', name: 'Alex', online: true, avatar: 'https://i.pravatar.cc/150?u=c3', email: 'alex@company.com' },
  { id: 'c4', name: 'Priya Singh', online: false, avatar: 'https://i.pravatar.cc/150?u=c4', phone: '+1 (555) 1111-2222' },
  { id: 'c5', name: 'Ananya Rao', online: false, avatar: 'https://i.pravatar.cc/150?u=ananya', email: 'ananya.rao@example.com' },
  { id: 'c6', name: 'Neha Kapoor', online: false, avatar: 'https://i.pravatar.cc/150?u=neha', email: 'neha.kapoor@example.com' },
];

export const mockConversations: Conversation[] = [
  {
    id: 'conv1',
    platform: 'whatsapp',
    contactId: 'c1',
    lastMessageAt: Date.now() - 1000 * 60 * 5, // 5 mins ago
    unreadCount: 2,
    status: 'open'
  },
  {
    id: 'conv2',
    platform: 'instagram',
    contactId: 'c2',
    lastMessageAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
    unreadCount: 0,
    status: 'open'
  },
  {
    id: 'conv3',
    platform: 'messenger',
    contactId: 'c3',
    lastMessageAt: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    unreadCount: 1,
    status: 'open'
  },
  {
    id: 'conv4',
    platform: 'gmail',
    contactId: 'c5',
    subject: 'Bridal package for 12 December',
    lastMessageAt: Date.now() - 1000 * 60 * 30,
    unreadCount: 1,
    status: 'open'
  },
  {
    id: 'conv5',
    platform: 'gmail',
    contactId: 'c6',
    subject: 'Invoice for September',
    lastMessageAt: Date.now() - 1000 * 60 * 60 * 24,
    unreadCount: 0,
    status: 'open'
  }
];

export const mockMessages: Message[] = [
  // conv1 messages (WhatsApp)
  {
    id: 'm1',
    conversationId: 'conv1',
    platform: 'whatsapp',
    senderId: 'c1',
    type: 'text',
    content: 'Hey, are you available tomorrow?',
    timestamp: Date.now() - 1000 * 60 * 6,
    direction: 'inbound',
    status: 'delivered'
  },
  {
    id: 'm2',
    conversationId: 'conv1',
    platform: 'whatsapp',
    senderId: 'c1',
    type: 'text',
    content: 'Need to discuss the new design.',
    timestamp: Date.now() - 1000 * 60 * 5,
    direction: 'inbound',
    status: 'delivered'
  },
  {
    id: 'm2a',
    conversationId: 'conv1',
    platform: 'whatsapp',
    senderId: 'me',
    type: 'text',
    content: 'Sure! Let\'s chat later today.',
    timestamp: Date.now() - 1000 * 60 * 2,
    direction: 'outbound',
    status: 'read'
  },
  {
    id: 'm2b',
    conversationId: 'conv1',
    platform: 'whatsapp',
    senderId: 'c1',
    type: 'text',
    content: 'Awesome, talk then.',
    timestamp: Date.now() - 1000 * 30,
    direction: 'inbound',
    status: 'delivered'
  },
  
  // conv2 messages (Instagram)
  {
    id: 'm3',
    conversationId: 'conv2',
    platform: 'instagram',
    senderId: 'c2',
    type: 'text',
    content: 'Check this out 👀',
    timestamp: Date.now() - 1000 * 60 * 60,
    direction: 'inbound',
    status: 'delivered'
  },

  // conv3 messages (Messenger)
  {
    id: 'm4',
    conversationId: 'conv3',
    platform: 'messenger',
    senderId: 'c3',
    type: 'text',
    content: 'I\'ll send the files.',
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    direction: 'inbound',
    status: 'delivered'
  },

  // Gmail threads
  {
    id: 'm5',
    conversationId: 'conv4',
    platform: 'gmail',
    senderId: 'c5',
    type: 'text',
    content: 'Hello, I\'m getting married on 12 December and would love a bridal hair and makeup trial beforehand. Could you share your bridal packages and prices?',
    timestamp: Date.now() - 1000 * 60 * 30,
    direction: 'inbound',
    status: 'delivered'
  },
  {
    id: 'm6',
    conversationId: 'conv5',
    platform: 'gmail',
    senderId: 'c6',
    type: 'text',
    content: 'Could you please email me the invoice for my September facial package? I need it for reimbursement.',
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    direction: 'inbound',
    status: 'read'
  }
];
