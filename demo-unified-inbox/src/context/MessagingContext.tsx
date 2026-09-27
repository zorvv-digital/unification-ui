import React, { createContext, useContext, useReducer, useMemo } from 'react';
import type { Contact, Conversation, Message, Platform } from '../types/messaging';
import { MockMessageService } from '../services/MessageService';

import { whatsappContacts, whatsappConversations, whatsappMessages } from '../data/whatsapp';
import { instagramContacts, instagramConversations, instagramMessages } from '../data/instagram';
import { messengerContacts, messengerConversations, messengerMessages } from '../data/messenger';

const initialContacts = [...whatsappContacts, ...instagramContacts, ...messengerContacts];
const initialConversations = [...whatsappConversations, ...instagramConversations, ...messengerConversations];
const initialMessages = [...whatsappMessages, ...instagramMessages, ...messengerMessages];

const messageService = new MockMessageService();

type State = {
  contacts: Contact[];
  conversations: Conversation[];
  messages: Message[];
};

type Action =
  | { type: 'MESSAGE_SENT'; payload: Message }
  | { type: 'MESSAGE_RECEIVED'; payload: Message }
  | { type: 'CONVERSATION_READ'; payload: string };

function messagingReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'MESSAGE_SENT':
    case 'MESSAGE_RECEIVED': {
      const message = action.payload;
      const isNewMessageInbound = action.type === 'MESSAGE_RECEIVED';
      const updatedMessages = [...state.messages, message];
      
      const updatedConversations = state.conversations.map(conv => {
        if (conv.id === message.conversationId) {
          return {
            ...conv,
            lastMessageId: message.id,
            lastMessageAt: message.timestamp,
            unreadCount: isNewMessageInbound ? (conv.unreadCount || 0) + 1 : (conv.unreadCount || 0)
          };
        }
        return conv;
      });

      return { ...state, messages: updatedMessages, conversations: updatedConversations };
    }
    case 'CONVERSATION_READ': {
      const conversationId = action.payload;
      const updatedConversations = state.conversations.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, unreadCount: 0 };
        }
        return conv;
      });
      const updatedMessages = state.messages.map(msg => {
        if (msg.conversationId === conversationId && msg.direction === 'inbound' && msg.status !== 'read') {
          return { ...msg, status: 'read' as const };
        }
        return msg;
      });
      return { ...state, conversations: updatedConversations, messages: updatedMessages };
    }
    default:
      return state;
  }
}

interface MessagingContextType extends State {
  sendMessage: (conversationId: string, content: string, type: Message['type'], senderId: string, platform: Platform) => Promise<void>;
  receiveMessage: (payload: Omit<Message, 'id'>) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
}

const MessagingContext = createContext<MessagingContextType | null>(null);

export const MessagingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(messagingReducer, {
    contacts: initialContacts,
    conversations: initialConversations,
    messages: initialMessages
  });

  const sendMessage = async (conversationId: string, content: string, type: Message['type'], senderId: string, platform: Platform) => {
    const message = await messageService.sendMessage(conversationId, content, type, senderId, platform);
    dispatch({ type: 'MESSAGE_SENT', payload: message });
  };

  const receiveMessage = async (payload: Omit<Message, 'id'>) => {
    const message = await messageService.receiveMessage(payload);
    dispatch({ type: 'MESSAGE_RECEIVED', payload: message });
  };

  const markAsRead = async (conversationId: string) => {
    await messageService.markAsRead(conversationId);
    dispatch({ type: 'CONVERSATION_READ', payload: conversationId });
  };

  const value = useMemo(() => ({
    ...state,
    sendMessage,
    receiveMessage,
    markAsRead
  }), [state]);

  return (
    <MessagingContext.Provider value={value}>
      {children}
    </MessagingContext.Provider>
  );
};

export const useMessagingContext = () => {
  const context = useContext(MessagingContext);
  if (!context) {
    throw new Error('useMessagingContext must be used within a MessagingProvider');
  }
  return context;
};
