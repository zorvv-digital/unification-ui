import type { Message } from '../types/inbox';

export const mockGmailMessages: Message[] = [
  {
    id: 'gmail-msg-1',
    provider: 'gmail',
    sender: 'alex@example.com',
    subject: 'Project Update',
    body: 'Hi team, just wanted to let you know the new designs are ready for review.',
    timestamp: Date.now() - 1000 * 60 * 30, // 30 mins ago
    isRead: false,
  },
  {
    id: 'gmail-msg-2',
    provider: 'gmail',
    sender: 'newsletter@startup.com',
    subject: 'Weekly Digest',
    body: 'Here is what happened this week in the startup world...',
    timestamp: Date.now() - 1000 * 60 * 60 * 2, // 2 hours ago
    isRead: true,
  },
  {
    id: 'gmail-msg-3',
    provider: 'gmail',
    sender: 'billing@cloudservice.com',
    subject: 'Invoice for September',
    body: 'Your invoice for the month of September is attached. Please pay by the 5th.',
    timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    isRead: true,
  },
];
