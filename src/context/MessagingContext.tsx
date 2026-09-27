import React, { createContext, useContext, useReducer, useEffect, useMemo, type ReactNode } from 'react';
import type { Contact, Conversation, Message } from '../types/messaging';
import { MockMessageService } from '../services/messaging/MockMessageService';
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
  | { type: 'MARK_AS_READ'; payload: { conversationId: string } }
  | { type: 'CONVERSATION_UPDATED'; payload: Conversation };

// --- Reducer ---

function messagingReducer(state: MessagingState, action: MessagingAction): MessagingState {
  switch (action.type) {
    case 'INITIALIZE':
      return {
        ...state,
        ...action.payload,
        isInitialized: true,
      };

    case 'MESSAGE_SENT': {
      const message = action.payload;
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
      return {
        ...state,
        conversations: state.conversations.map(conv =>
          conv.id === action.payload.id ? action.payload : conv
        )
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
  sendMessage: (conversationId: string, content: string, type: Message['type']) => Promise<void>;
  receiveMessage: (conversationId: string, content: string, type: Message['type']) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
}

const MessagingContext = createContext<MessagingContextValue | undefined>(undefined);

const messageService = new MockMessageService();

export const MessagingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(messagingReducer, {
    contacts: [],
    conversations: [],
    messages: [],
    isInitialized: false,
  });

  useEffect(() => {
    // Initialize data from mock service/data
    dispatch({
      type: 'INITIALIZE',
      payload: {
        contacts: mockContacts,
        conversations: mockConversations,
        messages: mockMessages,
      }
    });
  }, []);

  const value = useMemo<MessagingContextValue>(() => {
    return {
      ...state,

      getConversations: (platform?: string) => {
        if (platform) {
          return state.conversations.filter(c => c.platform === platform);
        }
        return state.conversations;
      },

      getMessages: (conversationId: string) => {
        return state.messages.filter(m => m.conversationId === conversationId);
      },

      sendMessage: async (conversationId: string, content: string, type: Message['type']) => {
        const msg = await messageService.sendMessage(conversationId, content, type);
        dispatch({ type: 'MESSAGE_SENT', payload: msg });
      },

      receiveMessage: async (conversationId: string, content: string, type: Message['type']) => {
        const msg = await messageService.receiveMessage(conversationId, content, type);
        dispatch({ type: 'MESSAGE_RECEIVED', payload: msg });
      },

      markAsRead: async (conversationId: string) => {
        await messageService.markAsRead(conversationId);
        dispatch({ type: 'MARK_AS_READ', payload: { conversationId } });
      }
    };
  }, [state]);

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
