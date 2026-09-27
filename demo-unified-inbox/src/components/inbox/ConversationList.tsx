import React, { useMemo, useState } from 'react';
import { Search, MessageCircle, MessageSquare, Check, CheckCheck, Camera } from 'lucide-react';
import { clsx } from 'clsx';
import { useMessagingContext } from '../../context/MessagingContext';
import { Avatar } from '../messaging/Avatar';
import type { Platform } from '../../types/messaging';

interface ConversationListProps {
  activeConversationId: string | null;
  onSelect: (id: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({ activeConversationId, onSelect }) => {
  const { conversations, contacts, messages } = useMessagingContext();
  const [activeFilter, setActiveFilter] = useState<Platform | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Map to unified format and filter
  const displayConversations = useMemo(() => {
    let filtered = conversations;
    
    if (activeFilter !== 'all') {
      filtered = filtered.filter(c => c.platform === activeFilter);
    }

    const mapped = filtered.map(conv => {
      const contact = contacts.find(c => c.id === conv.contactId);
      const msgs = messages.filter(m => m.conversationId === conv.id);
      const lastMsg = msgs.find(m => m.id === conv.lastMessageId) || msgs[msgs.length - 1];
      
      return {
        ...conv,
        contactName: contact?.name || 'Unknown',
        contactAvatar: contact?.avatar || '',
        lastMessageText: lastMsg?.content || '',
        lastMessageStatus: lastMsg?.status,
        lastMessageDirection: lastMsg?.direction,
      };
    });

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return mapped.filter(c => 
        c.contactName.toLowerCase().includes(q) || 
        c.lastMessageText.toLowerCase().includes(q)
      );
    }

    return mapped;
  }, [conversations, contacts, activeFilter, searchQuery, messages]);

  return (
    <div className="w-full md:w-[320px] lg:w-[360px] bg-white border-r border-gray-200/60 flex flex-col shrink-0 h-full z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">Inbox</h1>
          <button className="bg-black hover:bg-gray-800 text-white p-2 rounded-full shadow-sm transition-colors cursor-pointer">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input 
            type="text" 
            placeholder="Search conversations..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-gray-400"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <FilterPill active={activeFilter === 'all'} onClick={() => setActiveFilter('all')}>All</FilterPill>
          <FilterPill active={activeFilter === 'whatsapp'} onClick={() => setActiveFilter('whatsapp')}>
            <MessageCircle className="w-3.5 h-3.5 mr-1" /> WhatsApp
          </FilterPill>
          <FilterPill active={activeFilter === 'instagram'} onClick={() => setActiveFilter('instagram')}>
            <Camera className="w-3.5 h-3.5 mr-1" /> Instagram
          </FilterPill>
          <FilterPill active={activeFilter === 'messenger'} onClick={() => setActiveFilter('messenger')}>
            <MessageSquare className="w-3.5 h-3.5 mr-1" /> Messenger
          </FilterPill>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {displayConversations.map(conv => {
          const isActive = activeConversationId === conv.id;
          return (
            <div 
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={clsx(
                "flex items-start gap-3 p-3 mb-1 rounded-xl cursor-pointer transition-all border",
                isActive 
                  ? "bg-blue-50/50 border-blue-100 shadow-sm" 
                  : "bg-white border-transparent hover:bg-gray-50"
              )}
            >
              <div className="relative">
                <Avatar src={conv.contactAvatar} alt={conv.contactName} size="md" />
                <PlatformIcon platform={conv.platform} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <span className="font-semibold text-sm text-gray-900 truncate">{conv.contactName}</span>
                  <span className={clsx("text-[11px] font-medium shrink-0", conv.unreadCount ? "text-blue-600" : "text-gray-400")}>
                    {conv.lastMessageAt}
                  </span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-1 text-[13px] text-gray-500 truncate min-w-0">
                    {conv.lastMessageDirection === 'outbound' && (
                      conv.lastMessageStatus === 'read' ? <CheckCheck size={14} className="text-blue-500 shrink-0" /> : <Check size={14} className="shrink-0" />
                    )}
                    <span className={clsx("truncate", conv.unreadCount && "font-medium text-gray-900")}>
                      {conv.lastMessageText}
                    </span>
                  </div>
                  {!!conv.unreadCount && (
                    <span className="bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

function FilterPill({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={clsx(
        "px-3 py-1.5 rounded-full text-[12px] font-medium flex items-center shrink-0 transition-colors border",
        active 
          ? "bg-gray-900 text-white border-gray-900" 
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      )}
    >
      {children}
    </button>
  );
}

function PlatformIcon({ platform }: { platform: Platform }) {
  const styles = {
    whatsapp: "bg-[#25D366] text-white",
    instagram: "bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] text-white",
    messenger: "bg-gradient-to-tr from-[#00c6ff] to-[#0072ff] text-white" // Messenger gradient
  };

  return (
    <div className={clsx(
      "absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center",
      styles[platform]
    )}>
      {platform === 'whatsapp' && <MessageCircle size={10} />}
      {platform === 'instagram' && <Camera size={10} />}
      {platform === 'messenger' && <MessageSquare size={10} fill="currentColor" />}
    </div>
  );
}
