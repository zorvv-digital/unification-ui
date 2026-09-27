import React from 'react';
import { X, Mail, Phone, Tag, Calendar, MessageSquare, StickyNote } from 'lucide-react';
import { Avatar } from '../messaging/Avatar';
import type { Contact, Conversation } from '../../types/messaging';
import { MessageCircle } from 'lucide-react';
import { InstagramIcon } from '../icons/InstagramIcon';

interface ContactPanelProps {
  isMobileOpen: boolean;
  onClose: () => void;
  contact?: Contact;
  conversation?: Conversation;
  messageCount?: number;
}

export const ContactPanel: React.FC<ContactPanelProps> = ({ 
  isMobileOpen, 
  onClose,
  contact,
  conversation,
  messageCount = 0
}) => {
  return (
    <>
      {/* Mobile/Tablet Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 lg:hidden" 
          onClick={onClose}
        />
      )}

      {/* Panel Container */}
      <div className={`
        fixed inset-y-0 right-0 z-50 lg:static lg:z-auto
        w-[280px] sm:w-[320px] lg:w-full bg-white lg:border-l border-[var(--color-brand-border)]
        flex flex-col transform transition-transform duration-200 ease-in-out shadow-xl lg:shadow-none
        ${isMobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-14 border-b border-[var(--color-brand-border)] flex items-center justify-between px-4 shrink-0">
          <h3 className="font-semibold text-sm">Contact Details</h3>
          <button 
            onClick={onClose}
            className="lg:hidden p-1 text-[var(--color-brand-text-secondary)] hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {!contact || !conversation ? (
            <div className="text-center text-sm text-[var(--color-brand-text-secondary)] mt-8">
              Select a conversation to view contact details.
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="text-center py-4">
                <Avatar src={contact.avatar} alt={contact.name} size="xl" className="mx-auto mb-3" />
                <h4 className="font-semibold text-lg">{contact.name}</h4>
                <p className="text-sm text-[var(--color-brand-text-secondary)] mt-0.5">{contact.username || 'Customer'}</p>
                <div className="mt-3 flex justify-center gap-2">
                  <button className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-medium rounded-md transition-colors">Profile</button>
                  <button className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-medium rounded-md transition-colors">Edit</button>
                </div>
              </div>
              
              <div className="border-t border-[var(--color-brand-border)] my-2"></div>

              {/* Contact Details */}
              <div className="py-2">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Contact Info</h5>
                <div className="flex flex-col gap-3 text-sm">
                  {contact.phone && (
                    <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                      <Phone size={16} />
                      <span className="text-[var(--color-brand-text)]">{contact.phone}</span>
                    </div>
                  )}
                  {contact.email && (
                    <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                      <Mail size={16} />
                      <span className="text-[var(--color-brand-text)]">{contact.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                    {conversation.platform === 'whatsapp' ? <MessageCircle size={16} /> : 
                     conversation.platform === 'instagram' ? <InstagramIcon size={16} /> : 
                     <MessageSquare size={16} />}
                    <span className="text-[var(--color-brand-text)] capitalize">{conversation.platform}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--color-brand-border)] my-2"></div>

              {/* Conversation Info */}
              <div className="py-2">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Conversation</h5>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--color-brand-text-secondary)]"><Calendar size={16}/> Created</div>
                    <div className="font-medium">Oct 12, 2023</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--color-brand-text-secondary)]"><MessageSquare size={16}/> Total Messages</div>
                    <div className="font-medium">{messageCount}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--color-brand-border)] my-2"></div>

              {/* Tags */}
              <div className="py-2">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tags</h5>
                  <button className="text-[var(--color-brand-text)] hover:underline text-xs">Add</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-md border border-blue-100 flex items-center gap-1"><Tag size={12}/> Customer</span>
                  <span className="px-2 py-1 bg-orange-50 text-orange-700 text-xs font-medium rounded-md border border-orange-100 flex items-center gap-1"><Tag size={12}/> VIP</span>
                </div>
              </div>

              <div className="border-t border-[var(--color-brand-border)] my-2"></div>

              {/* Notes */}
              <div className="py-2">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Notes</h5>
                  <button className="text-[var(--color-brand-text)] hover:underline text-xs">Add</button>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg text-sm text-yellow-900 shadow-sm relative">
                  <StickyNote size={14} className="absolute top-2 right-2 text-yellow-400 opacity-50" />
                  <p>Follow up next week regarding the new contract terms.</p>
                  <p className="text-[10px] text-yellow-600 mt-2 font-medium">Added 2 days ago</p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};
