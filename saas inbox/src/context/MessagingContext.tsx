import React, { createContext, useContext, useReducer, useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { Contact, Conversation, Message } from '../types/messaging';
import { MockMessageService } from '../services/messaging/MockMessageService';
import { HttpMessageService, getToken } from '../services/messaging/HttpMessageService';
import { mockContacts, mockConversations, mockMessages } from '../data/messaging/mockData';

// --- State and Actions ---

export interface MessagingState {
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
  isInitialized: boolean;
}

export type MessagingAction =
  | { type: 'INITIALIZE'; payload: { contacts: Contact[]; conversations: Conversation[]; messages: Message[] } }
  | { type: 'MESSAGE_SENT'; payload: Message }
  | { type: 'MESSAGE_RECEIVED'; payload: Message }
  | { type: 'MESSAGE_UPDATED'; payload: Message }
  | { type: 'MARK_AS_READ'; payload: { conversationId: string } }
  | { type: 'CONVERSATION_UPDATED'; payload: { conversation: Conversation; contact?: Contact } };

// --- Reducer ---

export function messagingReducer(state: MessagingState, action: MessagingAction): MessagingState {
  switch (action.type) {
    case 'INITIALIZE':
      return {
        ...state,
        ...action.payload,
        isInitialized: true,
      };

    case 'MESSAGE_SENT': {
      const message = action.payload;
      if (state.messages.some(m => m.id === message.id)) return state;
      return {
        ...state,
        messages: [...state.messages, message],
        conversations: state.conversations.map(conv =>
          conv.id === message.conversationId
            ? {
                ...conv,
                lastMessageId: message.id,
                lastMessageAt: message.timestamp,
                // keep unreadCount unchanged
              }
            : conv
        ).sort((a, b) => b.lastMessageAt - a.lastMessageAt) // Move to top
      };
    }

    case 'MESSAGE_RECEIVED': {
      const message = action.payload;
      if (state.messages.some(m => m.id === message.id)) return state;
      return {
        ...state,
        messages: [...state.messages, message],
        conversations: state.conversations.map(conv =>
          conv.id === message.conversationId
            ? {
                ...conv,
                lastMessageId: message.id,
                lastMessageAt: message.timestamp,
                // increment unreadCount
                unreadCount: conv.unreadCount + 1, 
              }
            : conv
        ).sort((a, b) => b.lastMessageAt - a.lastMessageAt) // Move to top
      };
    }

    case 'MESSAGE_UPDATED':
      return { ...state, messages: state.messages.map(m => (m.id === action.payload.id ? action.payload : m)) };

    case 'MARK_AS_READ': {
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === action.payload.conversationId
            ? { ...conv, unreadCount: 0 }
            : conv
        )
      };
    }

    case 'CONVERSATION_UPDATED': {
      // Upsert: a first message from a new customer brings a conversation and contact we have not seen yet.
      const { conversation, contact } = action.payload;
      const exists = state.conversations.some(c => c.id === conversation.id);
      const conversations = exists
        ? state.conversations.map(c => (c.id === conversation.id ? conversation : c))
        : [...state.conversations, conversation];
      const contacts = contact && !state.contacts.some(c => c.id === contact.id)
        ? [...state.contacts, contact]
        : state.contacts;
      return {
        ...state,
        contacts,
        conversations: conversations.sort((a, b) => b.lastMessageAt - a.lastMessageAt),
      };
    }

    default:
      return state;
  }
}

// --- Context & Provider ---

export interface MessagingContextValue extends MessagingState {
  getConversations: (platform?: string) => Conversation[];
  getMessages: (conversationId: string) => Message[];
  sendMessage: (conversationId: string, content: string, type: Message['type']) => Promise<Message>;
  receiveMessage: (conversationId: string, content: string, type: Message['type']) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
}

const MessagingContext = createContext<MessagingContextValue | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL as string | undefined;

// With VITE_API_URL set the inbox talks to the backend; without it, it runs on local mock data.
export const apiService = API_URL ? new HttpMessageService(API_URL) : null;
const mockService = new MockMessageService();

export const MessagingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(messagingReducer, {
    contacts: [],
    conversations: [],
    messages: [],
    isInitialized: false,
  });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!apiService) {
      dispatch({
        type: 'INITIALIZE',
        payload: { contacts: mockContacts, conversations: mockConversations, messages: mockMessages },
      });
      return;
    }
    if (window.location.pathname === '/login') return;
    if (!getToken()) {
      window.location.href = '/login';
      return;
    }

    let cancelled = false;
    let source: EventSource | undefined;
    apiService.loadAll().then(data => {
      if (cancelled) return;
      dispatch({ type: 'INITIALIZE', payload: data });
      source = apiService.subscribe({
        onMessage: message =>
          dispatch({ type: message.direction === 'outbound' ? 'MESSAGE_SENT' : 'MESSAGE_RECEIVED', payload: message }),
        onMessageUpdated: message => dispatch({ type: 'MESSAGE_UPDATED', payload: message }),
        onConversation: (conversation, contact) =>
          dispatch({ type: 'CONVERSATION_UPDATED', payload: { conversation, contact } }),
      });
    }).catch(err => console.error('Failed to load inbox', err));

    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  // Actions keep a stable identity (they read state through a ref); pages list them as effect
  // dependencies, and a new identity per render would re-run mark-as-read on every live event.
  const actions = useMemo(() => ({
    sendMessage: async (conversationId: string, content: string, type: Message['type']) => {
      const msg = await (apiService ?? mockService).sendMessage(conversationId, content, type);
      dispatch({ type: 'MESSAGE_SENT', payload: msg });
      return msg;
    },

    receiveMessage: async (conversationId: string, content: string, type: Message['type']) => {
      if (apiService) {
        const conversation = stateRef.current.conversations.find(c => c.id === conversationId);
        if (conversation) await apiService.simulateInbound(conversation, content, type);
        return; // arrives through the event stream
      }
      const msg = await mockService.receiveMessage(conversationId, content, type);
      dispatch({ type: 'MESSAGE_RECEIVED', payload: msg });
    },

    markAsRead: async (conversationId: string) => {
      const conversation = stateRef.current.conversations.find(c => c.id === conversationId);
      if (!conversation || conversation.unreadCount === 0) return;
      dispatch({ type: 'MARK_AS_READ', payload: { conversationId } });
      await (apiService ?? mockService).markAsRead(conversationId);
    },
  }), []);

  const value = useMemo<MessagingContextValue>(() => {
    return {
      ...state,
      ...actions,

      getConversations: (platform?: string) => {
        if (platform) {
          return state.conversations.filter(c => c.platform === platform);
        }
        return state.conversations;
      },

      getMessages: (conversationId: string) => {
        return state.messages.filter(m => m.conversationId === conversationId);
      },
    };
  }, [state, actions]);

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
};

// --- Hook ---

export function useMessaging() {
  const context = useContext(MessagingContext);
  if (context === undefined) {
    throw new Error('useMessaging must be used within a MessagingProvider');
  }
  return context;
}
