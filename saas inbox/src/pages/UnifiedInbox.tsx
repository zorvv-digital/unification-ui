import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { Sidebar } from '../components/inbox/Sidebar';
import { Header } from '../components/inbox/Header';
import { ConversationList } from '../components/inbox/ConversationList';
import { MessageWorkspace } from '../components/inbox/MessageWorkspace';
import { ContactPanel } from '../components/inbox/ContactPanel';
import { useMessaging } from '../context/MessagingContext';
import type { FilterType, SortType } from '../components/inbox/FilterBar';

const GMAIL_RESULTS: Record<string, string> = {
  connected: 'Gmail connected. New customer emails arrive in the inbox within a minute or two.',
  denied: 'Gmail was not connected: access was not granted.',
  error: 'Could not connect Gmail. Please try again.',
};

export default function UnifiedInbox() {
  const { 
    conversations, 
    contacts, 
    getMessages, 
    sendMessage,
    markAsRead
  } = useMessaging();

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [activeSort, setActiveSort] = useState<SortType>('latest');
  // Google sign-in returns to /inbox?gmail=connected|denied|error
  const [searchParams, setSearchParams] = useSearchParams();
  const [gmailResult, setGmailResult] = useState(searchParams.get('gmail'));
  useEffect(() => {
    if (searchParams.has('gmail')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // Mark as read when selected or when new messages arrive in active conversation
  useEffect(() => {
    if (selectedConversationId) {
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
    
    conversations.forEach(c => {
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
  }, [conversations]);

  // Derived state: Filtered & Sorted Conversations
  const filteredConversations = useMemo(() => {
    let result = [...conversations];
    
    // 1. Apply Filter Bar
    if (activeFilter === 'whatsapp') result = result.filter(c => c.platform === 'whatsapp');
    else if (activeFilter === 'instagram') result = result.filter(c => c.platform === 'instagram');
    else if (activeFilter === 'messenger') result = result.filter(c => c.platform === 'messenger');
    else if (activeFilter === 'gmail') result = result.filter(c => c.platform === 'gmail');
    else if (activeFilter === 'website') result = result.filter(c => c.platform === 'website');
    else if (activeFilter === 'unread') result = result.filter(c => c.unreadCount > 0);
    else if (activeFilter === 'needs-human') result = result.filter(c => c.needsHuman);
    else if (activeFilter === 'assigned') result = result.filter(() => false); // Mock assigned to me
    
    // 2. Apply Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => {
        const contact = contacts.find(con => con.id === c.contactId);
        if (contact && contact.name.toLowerCase().includes(q)) return true;
        if (contact && contact.username && contact.username.toLowerCase().includes(q)) return true;
        
        // Search last message content
        const msgs = getMessages(c.id);
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
  }, [conversations, contacts, activeFilter, searchQuery, activeSort, getMessages]);

  const activeConversation = conversations.find(c => c.id === selectedConversationId);
  const activeContact = activeConversation ? contacts.find(c => c.id === activeConversation.contactId) : undefined;
  const activeMessages = selectedConversationId ? getMessages(selectedConversationId) : [];

  const handleSendMessage = (content: string) => {
    if (selectedConversationId) {
      sendMessage(selectedConversationId, content, 'text');
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

        {gmailResult && GMAIL_RESULTS[gmailResult] && (
          <div role="status" className="flex items-center justify-between gap-3 px-4 py-2 text-sm bg-white border-b border-[var(--color-brand-border)] text-[var(--color-brand-text)]">
            <span>{GMAIL_RESULTS[gmailResult]}</span>
            <button onClick={() => setGmailResult(null)} aria-label="Dismiss" className="p-1 rounded text-[var(--color-brand-text-secondary)] hover:bg-gray-100"><X size={16} /></button>
          </div>
        )}

        {/* 3-Column / 2-Column / 1-Column Responsive Grid Area */}
        <div className="flex-1 min-h-0 overflow-hidden relative grid grid-rows-1 grid-cols-1 md:grid-cols-[minmax(280px,340px)_1fr] lg:grid-cols-[minmax(280px,340px)_1fr_minmax(280px,320px)]">
          
          {/* Conversation List Column */}
          <div className={`
            h-full z-10
            ${selectedConversationId ? 'hidden md:block' : 'block'}
          `}>
            <ConversationList 
              conversations={filteredConversations}
              contacts={contacts}
              getMessages={getMessages}
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
