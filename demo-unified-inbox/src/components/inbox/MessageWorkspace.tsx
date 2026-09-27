import React, { useState, useEffect, useRef } from 'react';
import { MoreHorizontal, Paperclip, Smile, Send, ArrowLeft, Check, CheckCheck, Sidebar as SidebarIcon, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { useMessagingContext } from '../../context/MessagingContext';
import { Avatar } from '../messaging/Avatar';

interface MessageWorkspaceProps {
  conversationId: string;
  onBack: () => void;
  onToggleContact: () => void;
}

export const MessageWorkspace: React.FC<MessageWorkspaceProps> = ({ conversationId, onBack, onToggleContact }) => {
  const { conversations, contacts, messages: allMessages, markAsRead, sendMessage } = useMessagingContext();
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversation = conversations.find(c => c.id === conversationId);
  const contact = contacts.find(c => c.id === conversation?.contactId);
  const messages = allMessages.filter(m => m.conversationId === conversationId);

  // Mark as read when opening or receiving new messages
  useEffect(() => {
    if (conversationId) {
      markAsRead(conversationId);
    }
  }, [conversationId, messages.length, markAsRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!conversation || !contact) return null;

  const handleSend = () => {
    if (messageText.trim()) {
      sendMessage(conversationId, messageText.trim(), 'text', 'me', conversation.platform);
      setMessageText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* Header */}
      <div className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="md:hidden text-gray-400 hover:text-gray-900 transition-colors p-1 -ml-2 rounded-lg">
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-3">
            <Avatar src={contact.avatar} alt={contact.name} size="md" />
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900 leading-tight">{contact.name}</h2>
              <p className="text-[12px] text-green-500 font-medium">
                {contact.online ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 text-gray-400">
          <button className="p-2 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors hidden sm:block">
            <Search size={18} />
          </button>
          <button onClick={onToggleContact} className="p-2 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors hidden md:block">
            <SidebarIcon size={18} />
          </button>
          <button className="p-2 hover:bg-gray-100 hover:text-gray-900 rounded-full transition-colors">
            <MoreHorizontal size={18} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 flex flex-col gap-4 bg-[#F9FAFB]/50">
        
        <div className="flex justify-center mb-2">
          <span className="bg-gray-100 text-gray-500 text-[11px] font-medium px-3 py-1 rounded-full border border-gray-200/60">
            Today
          </span>
        </div>

        {messages.map((msg, index) => {
          const isMe = msg.direction === 'outbound';
          const isFirst = index === 0 || messages[index - 1].direction !== msg.direction;
          
          return (
            <div key={msg.id} className={clsx("flex", isMe ? "justify-end" : "justify-start")}>
              {!isMe && isFirst && (
                <div className="w-8 h-8 mr-2 mt-auto shrink-0 hidden sm:block">
                  <Avatar src={contact.avatar} alt={contact.name} size="sm" />
                </div>
              )}
              {(!isMe && !isFirst) && <div className="w-8 mr-2 hidden sm:block"></div>}
              
              <div className={clsx(
                "relative max-w-[85%] sm:max-w-[70%] px-4 py-2.5 text-[14px] leading-relaxed shadow-sm",
                isMe ? "bg-black text-white" : "bg-white text-gray-900 border border-gray-100",
                isFirst && isMe ? "rounded-2xl rounded-br-sm" : "rounded-2xl",
                isFirst && !isMe ? "rounded-2xl rounded-bl-sm" : "rounded-2xl"
              )}>
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                <div className={clsx(
                  "flex items-center justify-end gap-1 mt-1 text-[10px]",
                  isMe ? "text-gray-400" : "text-gray-400"
                )}>
                  {msg.timestamp}
                  {isMe && (
                    msg.status === 'read' ? <CheckCheck size={12} className="text-blue-400" /> : <Check size={12} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer Area - Highly Rounded */}
      <div className="p-4 bg-white border-t border-gray-100">
        <div className="bg-gray-50 border border-gray-200/80 rounded-full flex items-end px-2 py-1.5 focus-within:ring-2 focus-within:ring-black/5 focus-within:border-gray-300 transition-all shadow-sm">
          
          <div className="flex gap-1 text-gray-400 shrink-0 pb-1 pl-1">
            <button className="p-2 hover:bg-white hover:shadow-sm rounded-full transition-all">
              <Paperclip size={18} />
            </button>
          </div>
          
          <textarea
            rows={1}
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message..."
            className="flex-1 bg-transparent border-none outline-none resize-none max-h-32 text-[14px] px-3 py-2.5 placeholder:text-gray-400"
            style={{ minHeight: '40px' }}
          />
          
          <div className="shrink-0 pb-1 pr-1 flex gap-1 items-center text-gray-400">
            <button className="p-2 hover:bg-white hover:shadow-sm rounded-full transition-all hidden sm:block">
              <Smile size={18} />
            </button>
            <button 
              onClick={handleSend}
              disabled={!messageText.trim()}
              className={clsx(
                "p-2.5 rounded-full transition-all flex items-center justify-center",
                messageText.trim() 
                  ? "bg-blue-600 text-white shadow-md hover:bg-blue-700" 
                  : "bg-gray-100 text-gray-400"
              )}
            >
              <Send size={16} className="ml-0.5" />
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
};
