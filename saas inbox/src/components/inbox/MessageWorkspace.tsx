import React, { useEffect, useState } from 'react';
import { ArrowLeft, PanelRight, Phone, Search, MoreVertical, Paperclip, Smile, Send, Mail, Bot, Sparkles, Globe } from 'lucide-react';
import { Avatar } from '../messaging/Avatar';
import { apiService } from '../../context/MessagingContext';
import { aiApi } from '../../services/aiApi';
import type { Conversation, Contact, Message } from '../../types/messaging';
import { MessageSquare } from 'lucide-react';
import { InstagramIcon } from '../icons/InstagramIcon';
import { FaWhatsapp } from 'react-icons/fa';

interface MessageWorkspaceProps {
  conversation?: Conversation;
  contact?: Contact;
  messages: Message[];
  onBackToConversations: () => void;
  onToggleContactPanel: () => void;
  onSendMessage: (content: string) => void;
}

export const MessageWorkspace: React.FC<MessageWorkspaceProps> = ({ 
  conversation,
  contact,
  messages,
  onBackToConversations, 
  onToggleContactPanel,
  onSendMessage
}) => {
  const [inputText, setInputText] = useState('');
  const [localAi, setLocalAi] = useState(false); // mock mode only; in API mode the conversation's mode is the source
  const [aiError, setAiError] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    apiService?.me().then(user => setIsDemo(user.workspace.is_demo)).catch(() => {});
  }, []);
  useEffect(() => setAiError(''), [conversation?.id]);

  if (!conversation || !contact) {
    return (
      <div className="h-full bg-[var(--color-brand-surface)] flex flex-col items-center justify-center p-8 text-center relative z-0">
        <div className="w-16 h-16 bg-white border border-gray-200 rounded-full flex items-center justify-center mb-4 shadow-sm">
          <MessageSquareIcon />
        </div>
        <h2 className="text-lg font-medium text-[var(--color-brand-text)] mb-2">Select a conversation</h2>
        <p className="text-sm text-[var(--color-brand-text-secondary)] max-w-sm">
          Choose a conversation from the inbox to view messages.
        </p>
      </div>
    );
  }

  const handleSend = () => {
    if (inputText.trim()) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const isAiEnabled = apiService ? conversation.mode === 'ai' : localAi;
  const showError = (err: unknown) => setAiError(err instanceof Error ? err.message : 'Something went wrong');

  // The new mode arrives through the live conversation.updated event.
  const toggleAi = async () => {
    if (!apiService) return setLocalAi(!localAi);
    setAiError('');
    await aiApi.setConversationMode(conversation.id, isAiEnabled ? 'human' : 'ai').catch(showError);
  };

  const suggestReply = async () => {
    setSuggesting(true);
    setAiError('');
    try {
      setInputText((await aiApi.suggestReply(conversation.id)).suggestion);
    } catch (err) {
      showError(err);
    } finally {
      setSuggesting(false);
    }
  };

  const simulateCustomer = async () => {
    setMenuOpen(false);
    const content = window.prompt(`Message from ${contact.name}`, 'Do you open on Sunday?');
    if (content?.trim()) await aiApi.simulateCustomer(conversation.id, content.trim()).catch(showError);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  let PlatformIcon: React.ElementType = FaWhatsapp;
  let iconColor = 'text-[#25D366]';
  if (conversation.platform === 'instagram') {
    PlatformIcon = InstagramIcon as any;
    iconColor = 'text-[#E1306C]';
  } else if (conversation.platform === 'messenger') {
    PlatformIcon = MessageSquare;
    iconColor = 'text-[#0084FF]';
  } else if (conversation.platform === 'gmail') {
    PlatformIcon = Mail;
    iconColor = 'text-red-500';  } else if (conversation.platform === 'website') {
    PlatformIcon = Globe;
    iconColor = 'text-gray-900';
  }

  return (
    <div className="h-full bg-[var(--color-brand-surface)] flex flex-col relative z-0">
      {/* Workspace Header */}
      <div className="h-14 bg-white border-b border-[var(--color-brand-border)] flex items-center justify-between px-4 shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBackToConversations}
            className="md:hidden p-1.5 -ml-1.5 text-[var(--color-brand-text-secondary)] hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="relative">
            <Avatar src={contact.avatar} alt={contact.name} size="md" />
            <div className={`absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm ${iconColor}`}>
              <PlatformIcon size={10} />
            </div>
          </div>
          
          <div>
            <div className="font-semibold text-sm text-[var(--color-brand-text)] flex items-center gap-2">
              {contact.name}
              {conversation.needsHuman && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-100">Needs human</span>
              )}
            </div>
            <div className="text-[11px] text-[var(--color-brand-text-secondary)]">
              {conversation.subject ?? (apiService && isAiEnabled ? 'AI is replying' : contact.online ? 'Active now' : 'Last seen recently')}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 text-[var(--color-brand-text-secondary)]">
          <div className="flex items-center gap-2 mr-2" title="Contact AI Automation">
            <Bot size={16} className={isAiEnabled ? "text-blue-600" : "text-gray-400"} />
            <button 
              aria-label="AI replies for this conversation"
              aria-pressed={isAiEnabled}
              className={`w-8 h-4.5 rounded-full p-0.5 transition-colors ${isAiEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
              onClick={toggleAi}
            >
              <div className={`w-3.5 h-3.5 bg-white rounded-full shadow-sm transition-transform ${isAiEnabled ? 'translate-x-3.5' : 'translate-x-0'}`} />
            </button>
          </div>
          <button aria-label="Search" className="p-1.5 hover:bg-gray-100 hover:text-[var(--color-brand-text)] rounded-full transition-colors hidden sm:block"><Search size={18} /></button>
          <button aria-label="Call" className="p-1.5 hover:bg-gray-100 hover:text-[var(--color-brand-text)] rounded-full transition-colors hidden sm:block"><Phone size={18} /></button>
          <div className="w-px h-5 bg-gray-200 mx-1 hidden sm:block"></div>
          <button 
            onClick={onToggleContactPanel}
            aria-label="Contact Info"
            className="p-1.5 hover:bg-gray-100 hover:text-[var(--color-brand-text)] rounded-full transition-colors"
            title="Contact Info"
          >
            <PanelRight size={18} />
          </button>
          <div className="relative">
            <button aria-label="More options" onClick={() => setMenuOpen(!menuOpen)} className="p-1.5 hover:bg-gray-100 hover:text-[var(--color-brand-text)] rounded-full transition-colors"><MoreVertical size={18} /></button>
            {menuOpen && isDemo && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-20">
                <button onClick={simulateCustomer} className="w-full text-left px-3 py-2 text-sm text-[var(--color-brand-text)] hover:bg-gray-50">
                  Simulate customer message
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {aiError && <div role="alert" className="px-4 py-2 text-xs text-red-600 bg-red-50 border-b border-red-100">{aiError}</div>}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-[5%] py-6 flex flex-col gap-2">
        {messages.map((msg, index) => {
          const isMe = msg.direction === 'outbound';
          const isFirst = index === 0 || messages[index - 1].senderId !== msg.senderId;
          
          let bubbleStyle = isMe ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-[var(--color-brand-text)] shadow-sm';
          
          if (isMe) {
            if (conversation.platform === 'whatsapp') bubbleStyle = 'bg-[#128C7E] text-white';
            else if (conversation.platform === 'messenger') bubbleStyle = 'bg-[#0084FF] text-white';
            else if (conversation.platform === 'instagram') bubbleStyle = 'bg-[#3797f0] text-white';
          }
          
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isFirst ? 'mt-2' : ''}`}>
              {(() => {
                let displayContent = msg.content;
                let displayAdContext = msg.adContext;
                if (displayContent.startsWith('{"text":') && displayContent.includes('"adContext":')) {
                  try {
                    const parsed = JSON.parse(displayContent);
                    displayContent = parsed.text;
                    displayAdContext = parsed.adContext;
                  } catch (e) {}
                }

                const bubbleClasses = `
                  max-w-[75%] px-3 py-2 text-[14px] leading-relaxed relative
                  ${bubbleStyle}
                  ${isFirst && isMe ? 'rounded-l-2xl rounded-br-2xl rounded-tr-sm' : ''}
                  ${!isFirst && isMe ? 'rounded-l-2xl rounded-r-sm' : ''}
                  ${isFirst && !isMe ? 'rounded-r-2xl rounded-bl-2xl rounded-tl-sm' : ''}
                  ${!isFirst && !isMe ? 'rounded-r-2xl rounded-l-sm' : ''}
                `;

                return (
                  <div className={`flex flex-col gap-1 max-w-full ${isMe ? 'items-end' : 'items-start'}`}>
                    {displayAdContext && (
                      <div className="flex mt-1 mb-0.5">
                        <div className="w-[3px] bg-gray-300 rounded-full mr-3 ml-1" style={{ opacity: 0.6 }}></div>
                        <div className="flex flex-col pb-1">
                          <span className="text-[12px] text-gray-500 font-medium mb-2">
                            Replied to {displayAdContext.source.toLowerCase()}
                          </span>
                          <img 
                            src={displayAdContext.imageUrl} 
                            alt="Story" 
                            className="h-44 w-28 object-cover rounded-xl shadow-sm border border-gray-200"
                          />
                        </div>
                      </div>
                    )}
                    <div className={bubbleClasses}>
                      <div className="whitespace-pre-wrap">{displayContent}</div>
                      <div className={`text-[9px] mt-1 text-right opacity-70 ${!isMe ? 'text-gray-500' : ''}`}>
                        {msg.author === 'agent' && <span className="inline-flex items-center gap-0.5 mr-1.5 font-semibold"><Bot size={10} /> AI</span>}
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
      
      {/* Composer */}
      <div className="p-3 bg-white border-t border-[var(--color-brand-border)]">
        <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-2 py-1.5 focus-within:border-gray-300 focus-within:bg-white transition-colors">
          <button className="p-1.5 mb-0.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors" aria-label="Attach file"><Paperclip size={18} /></button>
          <textarea
            placeholder="Type a message..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-sm px-1 py-1.5 resize-none max-h-32 min-h-[36px]"
          />
          {apiService && (
            <button
              onClick={suggestReply}
              disabled={suggesting}
              aria-label="Suggest reply"
              title="Suggest a reply with AI"
              className={`p-1.5 mb-0.5 text-gray-400 hover:text-blue-600 rounded-full transition-colors ${suggesting ? 'animate-pulse text-blue-600' : ''}`}
            >
              <Sparkles size={18} />
            </button>
          )}
          <button className="p-1.5 mb-0.5 text-gray-400 hover:text-gray-600 rounded-full transition-colors" aria-label="Add emoji"><Smile size={18} /></button>
          <button 
            onClick={handleSend}
            disabled={!inputText.trim()}
            aria-label="Send message"
            className={`p-1.5 mb-0.5 rounded-full transition-colors flex items-center justify-center shrink-0 w-8 h-8 ${
              inputText.trim() ? 'bg-gray-900 text-white hover:bg-black' : 'bg-gray-200 text-gray-400'
            }`}
          >
            <Send size={14} className={inputText.trim() ? 'ml-0.5' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
};

const MessageSquareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

