import { describe, expect, it } from 'vitest';
import { messagingReducer, type MessagingState } from './MessagingContext';
import { toConversation, toMessage, type ApiConversation, type ApiMessage } from '../services/messaging/HttpMessageService';
import type { Conversation, Message } from '../types/messaging';

const conversation = (id: string, lastMessageAt: number, unreadCount = 0): Conversation => ({
  id, platform: 'whatsapp', contactId: `contact-${id}`, lastMessageAt, unreadCount, status: 'open',
});

const message = (id: string, conversationId: string, direction: Message['direction'], timestamp = 1000): Message => ({
  id, conversationId, platform: 'whatsapp', senderId: direction === 'outbound' ? 'me' : 'c', type: 'text',
  content: 'hi', timestamp, direction,
});

const state = (overrides: Partial<MessagingState> = {}): MessagingState => ({
  contacts: [], conversations: [], messages: [], isInitialized: true, ...overrides,
});

describe('messagingReducer', () => {
  it('ignores a message it already has (POST response + live event for the same send)', () => {
    const start = state({ conversations: [conversation('a', 0)], messages: [message('m1', 'a', 'outbound')] });
    expect(messagingReducer(start, { type: 'MESSAGE_SENT', payload: message('m1', 'a', 'outbound') })).toBe(start);
    expect(messagingReducer(start, { type: 'MESSAGE_RECEIVED', payload: message('m1', 'a', 'outbound') })).toBe(start);
  });

  it('adds a new inbound message, bumps unread, and moves the conversation to the top', () => {
    const start = state({ conversations: [conversation('a', 500), conversation('b', 100)] });
    const next = messagingReducer(start, { type: 'MESSAGE_RECEIVED', payload: message('m2', 'b', 'inbound', 900) });
    expect(next.messages.map(m => m.id)).toEqual(['m2']);
    expect(next.conversations[0]).toMatchObject({ id: 'b', unreadCount: 1, lastMessageAt: 900 });
  });

  it('upserts an unknown conversation and its contact (first message from a new customer)', () => {
    const start = state({ conversations: [conversation('a', 100)] });
    const next = messagingReducer(start, {
      type: 'CONVERSATION_UPDATED',
      payload: { conversation: conversation('new', 999, 1), contact: { id: 'contact-new', name: 'Meera' } },
    });
    expect(next.conversations.map(c => c.id)).toEqual(['new', 'a']);
    expect(next.contacts).toEqual([{ id: 'contact-new', name: 'Meera' }]);
  });

  it('replaces a known conversation with the server copy', () => {
    const start = state({ conversations: [conversation('a', 100, 3)], contacts: [{ id: 'contact-a', name: 'A' }] });
    const next = messagingReducer(start, {
      type: 'CONVERSATION_UPDATED',
      payload: { conversation: conversation('a', 100, 0), contact: { id: 'contact-a', name: 'A' } },
    });
    expect(next.conversations).toEqual([conversation('a', 100, 0)]);
    expect(next.contacts).toHaveLength(1);
  });

  it('updates a message in place when its delivery status changes', () => {
    const start = state({ messages: [message('m1', 'a', 'outbound'), message('m2', 'a', 'inbound')] });
    const next = messagingReducer(start, { type: 'MESSAGE_UPDATED', payload: { ...message('m1', 'a', 'outbound'), status: 'read' } });
    expect(next.messages.map(m => [m.id, m.status])).toEqual([['m1', 'read'], ['m2', undefined]]);
  });

  it('applies an AI escalation from the server (mode and needs-human flag)', () => {
    const start = state({ conversations: [{ ...conversation('a', 100), mode: 'ai', needsHuman: false }] });
    const escalated = { ...conversation('a', 100), mode: 'human' as const, needsHuman: true };
    const next = messagingReducer(start, { type: 'CONVERSATION_UPDATED', payload: { conversation: escalated } });
    expect(next.conversations[0]).toMatchObject({ mode: 'human', needsHuman: true });
  });
});

describe('API mapping', () => {
  const apiConversation: ApiConversation = {
    id: 'c1', platform: 'instagram', channel_id: 'ch1', external_id: 'ig_sarah', status: 'open', unread_count: 2,
    last_message_at: '2026-09-28T10:00:00+00:00', mode: 'ai', needs_human: true,
    contact: { id: 'p1', name: 'Sarah', username: '@sarah', avatar: null, phone: null, email: 'sarah@x.com' },
  };

  it('maps conversations to camelCase with epoch timestamps', () => {
    expect(toConversation(apiConversation)).toEqual({
      id: 'c1', platform: 'instagram', contactId: 'p1', channelId: 'ch1', externalId: 'ig_sarah',
      lastMessageAt: Date.UTC(2026, 8, 28, 10), unreadCount: 2, status: 'open', mode: 'ai', needsHuman: true,
    });
  });

  it('maps messages, marking outbound as sent by "me"', () => {
    const api: ApiMessage = {
      id: 'm1', conversation_id: 'c1', platform: 'instagram', direction: 'outbound', type: 'text',
      content: 'Hello', status: 'sent', external_id: 'sim-1', author: 'agent', timestamp: '2026-09-28T10:00:00+00:00',
    };
    expect(toMessage(api)).toMatchObject({ senderId: 'me', timestamp: Date.UTC(2026, 8, 28, 10), externalId: 'sim-1', author: 'agent' });
    expect(toMessage({ ...api, direction: 'inbound' }).senderId).not.toBe('me');
  });
});
