import React from 'react';
import { MessageSquare, Mail, Globe } from 'lucide-react';
import { InstagramIcon } from '../icons/InstagramIcon';
import { FaWhatsapp } from 'react-icons/fa';
import { ChannelSummary } from './ChannelSummary';
import { FilterBar } from './FilterBar';
import type { FilterType } from './FilterBar';
import type { Product } from '../../services/productApi';
import { Avatar } from '../messaging/Avatar';
import type { Conversation, Contact, Message } from '../../types/messaging';

interface ConversationListProps {
  conversations: Conversation[];
  contacts: Contact[];
  getMessages: (id: string) => Message[];
  activeFilter: FilterType;
  onFilterChange: (f: FilterType) => void;
  products: Product[];
  activeProductId?: string;
  onProductChange: (productId?: string) => void;
  onCreateProduct: (name: string, description: string, keywords: string[]) => Promise<void>;
  selectedConversationId?: string;
  onSelectConversation: (id: string) => void;
  stats: any;
}

export const ConversationList: React.FC<ConversationListProps> = ({ 
  conversations, contacts, getMessages,
  activeFilter, onFilterChange,
  products, activeProductId, onProductChange, onCreateProduct,
  selectedConversationId, onSelectConversation,
  stats
}) => {
  return (
    <div className="h-full bg-white border-r border-[var(--color-brand-border)] flex flex-col z-0">
      <ChannelSummary
        stats={stats}
        activeFilter={activeFilter}
        onFilterChange={filter => { onFilterChange(filter); onProductChange(undefined); }}
      />
      <FilterBar 
        activeFilter={activeFilter} 
        onFilterChange={onFilterChange} 
        products={products}
        activeProductId={activeProductId}
        onProductChange={onProductChange}
        onCreateProduct={onCreateProduct}
      />
      
      <div className="flex-1 overflow-y-auto flex flex-col">
        {conversations.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-brand-text-secondary)]">
            No conversations found.
          </div>
        ) : (
          conversations.map(conv => {
            const contact = contacts.find(c => c.id === conv.contactId);
            if (!contact) return null;
            
            const msgs = getMessages(conv.id);
            const lastMsg = msgs[msgs.length - 1];
            const isActive = selectedConversationId === conv.id;
            
            let PlatformIcon: React.ElementType = FaWhatsapp;
            let iconColor = 'text-[#25D366]';
            if (conv.platform === 'instagram') {
              PlatformIcon = InstagramIcon as any;
              iconColor = 'text-[#E1306C]';
            } else if (conv.platform === 'messenger') {
              PlatformIcon = MessageSquare;
              iconColor = 'text-[#0084FF]';
            } else if (conv.platform === 'gmail') {
              PlatformIcon = Mail;
              iconColor = 'text-red-500';
            } else if (conv.platform === 'website') {
              PlatformIcon = Globe;
              iconColor = 'text-gray-900';
            }

            return (
              <button 
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`
                  flex items-center px-4 py-3 border-b border-gray-100 text-left transition-colors relative
                  ${isActive ? 'bg-gray-50' : 'hover:bg-gray-50'}
                `}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-800 rounded-r"></div>}
                
                <div className="relative mr-3 shrink-0">
                  <Avatar src={contact.avatar} alt={contact.name} size="lg" />
                  <div className={`absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm ${iconColor}`}>
                    <PlatformIcon size={12} />
                  </div>
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className="font-semibold text-[14px] text-[var(--color-brand-text)] truncate">{contact.name}</h3>
                    <span className={`text-[11px] whitespace-nowrap ml-2 ${conv.unreadCount > 0 ? 'text-[var(--color-brand-text)] font-semibold' : 'text-gray-500'}`}>
                      {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {conv.subject && (
                    <p className="text-[13px] font-medium text-[var(--color-brand-text)] truncate">{conv.subject}</p>
                  )}
                  <div className="flex justify-between items-center">
                    <p className={`text-[13px] truncate ${conv.unreadCount > 0 ? 'text-[var(--color-brand-text)] font-medium' : 'text-gray-500'}`}>
                      {lastMsg?.author === 'agent' ? 'AI: ' : lastMsg?.direction === 'outbound' ? 'You: ' : ''}{lastMsg?.content || 'Attachment'}
                    </p>
                    {conv.needsHuman && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100 ml-2 shrink-0">Needs human</span>
                    )}
                    {conv.unreadCount > 0 && (
                      <div className="bg-gray-900 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-2 shrink-0 min-w-[20px] text-center">
                        {conv.unreadCount}
                      </div>
                    )}
                  </div>
                  {!!contact.productInterests?.length && (
                    <div className="flex gap-1 mt-1 overflow-hidden">
                      {contact.productInterests.slice(0, 2).map(product => (
                        <span key={product.product_id} className="px-1.5 py-0.5 rounded text-[9px] font-semibold whitespace-nowrap" style={{ color: product.color, backgroundColor: `${product.color}14` }}>{product.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
