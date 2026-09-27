import { useState, useMemo, useEffect } from 'react';
import { Sidebar } from '../components/inbox/Sidebar';
import { Header } from '../components/inbox/Header';
import { ConversationList } from '../components/inbox/ConversationList';
import { MessageWorkspace } from '../components/inbox/MessageWorkspace';
import { ContactPanel } from '../components/inbox/ContactPanel';
import { useMessaging } from '../context/MessagingContext';
import { useInbox } from '../context/InboxContext';
import type { FilterType, SortType } from '../components/inbox/FilterBar';
import type { Conversation, Contact, Message as MessagingMessage } from '../types/messaging';

export default function UnifiedInbox() {
  const { 
    conversations, 
    contacts, 
    getMessages, 
    sendMessage,
    markAsRead
  } = useMessaging();
  
  const { messages: gmailMessages, addMessage: addGmailMessage } = useInbox();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeSort, setActiveSort] = useState<SortType>('latest');

  // Derive gmail data
  const { gmailConversations, gmailContacts, getGmailMessages } = useMemo(() => {
    const conversationsMap = new Map<string, Conversation>();
    const contactsMap = new Map<string, Contact>();
    const messagesMap = new Map<string, MessagingMessage[]>();

    gmailMessages.forEach(msg => {
      const normalizedSubject = msg.subject.replace(/^(Re:\s*)+/i, '').trim();
      const convId = `gmail-conv-${normalizedSubject}`;
      const isOutbound = msg.sender === 'me';
      const contactId = isOutbound ? 'me' : `gmail-contact-${msg.sender}`;
      
      if (!isOutbound && !contactsMap.has(contactId)) {
        contactsMap.set(contactId, {
          id: contactId,
          name: msg.sender,
          email: msg.sender,
        });
      }

      if (!conversationsMap.has(convId)) {
        conversationsMap.set(convId, {
          id: convId,
          platform: 'gmail',
          contactId: isOutbound ? 'me' : contactId, // Might be 'me' if first message is sent by us, but typically we have a contact
          lastMessageAt: msg.timestamp,
          unreadCount: msg.isRead ? 0 : 1,
          status: 'open',
        });
      } else {
        const existing = conversationsMap.get(convId)!;
        if (msg.timestamp > existing.lastMessageAt) {
          existing.lastMessageAt = msg.timestamp;
        }
        if (!msg.isRead) {
          existing.unreadCount += 1;
        }
        if (!isOutbound && existing.contactId === 'me') {
           existing.contactId = contactId; // update contact to actual user
        }
      }

      const mappedMsg: MessagingMessage = {
        id: msg.id,
        conversationId: convId,
        platform: 'gmail',
        senderId: contactId,
        type: 'text',
        content: msg.body,
        timestamp: msg.timestamp,
        direction: isOutbound ? 'outbound' : 'inbound',
      };

      if (!messagesMap.has(convId)) {
        messagesMap.set(convId, []);
      }
      messagesMap.get(convId)!.push(mappedMsg);
    });

    messagesMap.forEach(msgs => msgs.sort((a, b) => a.timestamp - b.timestamp));

    return {
      gmailConversations: Array.from(conversationsMap.values()),
      gmailContacts: Array.from(contactsMap.values()),
      getGmailMessages: (id: string) => messagesMap.get(id) || [],
    };
  }, [gmailMessages]);

  const allConversations = useMemo(() => [...conversations, ...gmailConversations], [conversations, gmailConversations]);
  const allContacts = useMemo(() => [...contacts, ...gmailContacts], [contacts, gmailContacts]);
  const getAllMessages = (id: string) => id.startsWith('gmail-conv-') ? getGmailMessages(id) : getMessages(id);

  // Mark as read when selected or when new messages arrive in active conversation
  useEffect(() => {
    if (selectedConversationId && !selectedConversationId.startsWith('gmail-conv-')) {
      const conv = conversations.find(c => c.id === selectedConversationId);
      if (conv && conv.unreadCount > 0) {
        markAsRead(selectedConversationId);
      }
    }
  }, [selectedConversationId, markAsRead, conversations]);

  // Derived state: Channel Summary Stats
  const stats = useMemo(() => {
    const defaultStats = {
      whatsapp: { count: 0, unread: 0 },
      instagram: { count: 0, unread: 0 },
      messenger: { count: 0, unread: 0 },
      gmail: { count: 0, unread: 0 },
    };
    
    allConversations.forEach(c => {
      if (c.platform === 'whatsapp') {
        defaultStats.whatsapp.count++;
        defaultStats.whatsapp.unread += c.unreadCount;
      } else if (c.platform === 'instagram') {
        defaultStats.instagram.count++;
        defaultStats.instagram.unread += c.unreadCount;
      } else if (c.platform === 'messenger') {
        defaultStats.messenger.count++;
        defaultStats.messenger.unread += c.unreadCount;
      } else if (c.platform === 'gmail') {
        defaultStats.gmail.count++;
        defaultStats.gmail.unread += c.unreadCount;
      }
    });
    return defaultStats;
  }, [allConversations]);

  // Derived state: Filtered & Sorted Conversations
  const filteredConversations = useMemo(() => {
    let result = [...allConversations];
    
    // 1. Apply Filter Bar
    if (activeFilter === 'whatsapp') result = result.filter(c => c.platform === 'whatsapp');
    else if (activeFilter === 'instagram') result = result.filter(c => c.platform === 'instagram');
    else if (activeFilter === 'messenger') result = result.filter(c => c.platform === 'messenger');
    else if (activeFilter === 'gmail') result = result.filter(c => c.platform === 'gmail');
    else if (activeFilter === 'unread') result = result.filter(c => c.unreadCount > 0);
    else if (activeFilter === 'assigned') result = result.filter(() => false); // Mock assigned to me
    
    // 2. Apply Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => {
        const contact = allContacts.find(con => con.id === c.contactId);
        if (contact && contact.name.toLowerCase().includes(q)) return true;
        if (contact && contact.username && contact.username.toLowerCase().includes(q)) return true;
        
        // Search last message content
        const msgs = getAllMessages(c.id);
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg && lastMsg.content && lastMsg.content.toLowerCase().includes(q)) return true;
        
        return false;
      });
    }

    // 3. Apply Sort
    result.sort((a, b) => {
      if (activeSort === 'latest') {
        return b.lastMessageAt - a.lastMessageAt;
      } else if (activeSort === 'oldest') {
        return a.lastMessageAt - b.lastMessageAt;
      } else if (activeSort === 'unread-first') {
        // If one is unread and other is read, unread goes first
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
        // Otherwise fallback to latest
        return b.lastMessageAt - a.lastMessageAt;
      }
      return 0;
    });
    
    return result;
  }, [allConversations, allContacts, activeFilter, searchQuery, activeSort, getAllMessages]);

  const activeConversation = allConversations.find(c => c.id === selectedConversationId);
  const activeContact = activeConversation ? allContacts.find(c => c.id === activeConversation.contactId) : undefined;
  const activeMessages = selectedConversationId ? getAllMessages(selectedConversationId) : [];

  const handleSendMessage = (content: string) => {
    if (selectedConversationId) {
      if (selectedConversationId.startsWith('gmail-conv-')) {
        const timestamp = Date.now();
        addGmailMessage({
          id: `gmail-msg-${timestamp}`,
          provider: 'gmail',
          sender: 'me',
          subject: selectedConversationId.replace('gmail-conv-', ''),
          body: content,
          timestamp: timestamp,
          isRead: true,
        });
      } else {
        sendMessage(selectedConversationId, content, 'text');
      }
    }
  };

  return (
    <div className="h-screen w-full flex bg-[var(--color-brand-surface)] text-[var(--color-brand-text)] font-sans overflow-hidden">
      
      {/* 1. Sidebar */}
      <Sidebar 
        isMobileOpen={isMobileSidebarOpen} 
        onCloseMobile={() => setIsMobileSidebarOpen(false)} 
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <Header 
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          showMobileMenu={true}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* 3-Column / 2-Column / 1-Column Responsive Grid Area */}
        <div className="flex-1 overflow-hidden relative grid grid-cols-1 md:grid-cols-[minmax(280px,340px)_1fr] lg:grid-cols-[minmax(280px,340px)_1fr_minmax(280px,320px)]">
          
          {/* Conversation List Column */}
          <div className={`
            h-full z-10
            ${selectedConversationId ? 'hidden md:block' : 'block'}
          `}>
            <ConversationList 
              conversations={filteredConversations}
              contacts={allContacts}
              getMessages={getAllMessages}
              stats={stats}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
              activeSort={activeSort}
              onSortChange={setActiveSort}
              selectedConversationId={selectedConversationId}
              onSelectConversation={setSelectedConversationId}
            />
          </div>

          {/* Message Workspace Column */}
          <div className={`
            h-full min-w-0 z-0
            ${selectedConversationId ? 'block' : 'hidden md:block'}
          `}>
            <MessageWorkspace 
              conversation={activeConversation}
              contact={activeContact}
              messages={activeMessages}
              onSendMessage={handleSendMessage}
              onBackToConversations={() => setSelectedConversationId(undefined)}
              onToggleContactPanel={() => setIsContactPanelOpen(true)}
            />
          </div>

          {/* Contact Panel Column (Desktop) */}
          <div className="hidden lg:block h-full z-10">
            <ContactPanel 
              isMobileOpen={false} 
              onClose={() => {}} 
              contact={activeContact}
              conversation={activeConversation}
              messageCount={activeMessages.length}
            />
          </div>
          
          {/* Tablet/Mobile Contact Panel Drawer */}
          <div className="lg:hidden">
             <ContactPanel 
               isMobileOpen={isContactPanelOpen} 
               onClose={() => setIsContactPanelOpen(false)} 
               contact={activeContact}
               conversation={activeConversation}
               messageCount={activeMessages.length}
             />
          </div>

        </div>
      </div>
    </div>
  );
}
