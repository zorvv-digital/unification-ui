import { useState, useMemo } from 'react';
import { useMessagingContext } from '../context/MessagingContext';
import type { Platform, Message } from '../types/messaging';

interface UseMessagingProps {
  platform?: Platform;
}

export function useMessaging({ platform }: UseMessagingProps = {}) {
  const { contacts, conversations, messages, sendMessage: contextSendMessage, markAsRead } = useMessagingContext();
  
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter conversations by platform if specified
  const platformConversations = useMemo(() => {
    return platform ? conversations.filter(c => c.platform === platform) : conversations;
  }, [conversations, platform]);

  // Join conversations with contacts to match the old UI expectations
  const mappedConversations = useMemo(() => {
    return platformConversations.map(conv => {
      const contact = contacts.find(c => c.id === conv.contactId);
      const msgs = messages.filter(m => m.conversationId === conv.id);
      const lastMsg = msgs.find(m => m.id === conv.lastMessageId) || msgs[msgs.length - 1];
      
      return {
        id: conv.id,
        platform: conv.platform,
        name: contact?.name || 'Unknown',
        username: contact?.username,
        avatar: contact?.avatar || '',
        lastMessage: lastMsg?.content || '',
        timestamp: conv.lastMessageAt || '',
        unread: conv.unreadCount || 0,
        online: contact?.online
      };
    });
  }, [platformConversations, contacts, messages]);

  const activeConversation = useMemo(() => 
    mappedConversations.find(c => c.id === activeConversationId) || null,
  [mappedConversations, activeConversationId]);

  const activeMessages = useMemo(() => {
    if (!activeConversationId) return [];
    return messages.filter(m => m.conversationId === activeConversationId).map(m => ({
      id: m.id,
      sender: m.direction === 'outbound' ? 'me' : 'them',
      type: m.type,
      content: m.content,
      timestamp: m.timestamp,
      status: m.status,
      platform: m.platform
    }));
  }, [messages, activeConversationId]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return mappedConversations;
    const query = searchQuery.toLowerCase();
    return mappedConversations.filter(c => 
      c.name.toLowerCase().includes(query) || 
      (c.username && c.username.toLowerCase().includes(query)) ||
      c.lastMessage.toLowerCase().includes(query)
    );
  }, [mappedConversations, searchQuery]);

  const sendMessage = async (content: string, type: Message['type'] = 'text') => {
    if (!activeConversationId) return;
    
    // Find the actual conversation to get the platform
    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv) {
      await contextSendMessage(activeConversationId, content, type, 'me', conv.platform);
    }
  };

  return {
    conversations: mappedConversations,
    filteredConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    activeMessages,
    searchQuery,
    setSearchQuery,
    sendMessage,
    markAsRead
  };
}
