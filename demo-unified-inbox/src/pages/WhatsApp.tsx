import React, { useState, useEffect } from 'react';
import { Search, MoreVertical, Paperclip, Smile, Mic, Send, ArrowLeft, Check, CheckCheck, Video, Phone, Plus, MessageCircle, Target, Users, Archive, Settings, Sparkles, Filter, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { useMessaging } from '../hooks/useMessaging';
import { Avatar } from '../components/messaging/Avatar';
import { EmojiPicker } from '../components/messaging/EmojiPicker';
import { AttachmentMenu } from '../components/messaging/AttachmentMenu';

export default function WhatsApp() {
  const {
    filteredConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    activeMessages,
    searchQuery,
    setSearchQuery,
    sendMessage,
    markAsRead
  } = useMessaging({ platform: 'whatsapp' });

  const [messageText, setMessageText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (activeConversationId) {
      markAsRead(activeConversationId);
    }
  }, [activeConversationId, activeMessages.length, markAsRead]);

  const handleSend = () => {
    if (messageText.trim()) {
      sendMessage(messageText.trim(), 'text');
      setMessageText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showList = !isMobile || (isMobile && !activeConversationId);
  const showChat = !isMobile || (isMobile && activeConversationId);

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans text-[#111b21]">
      {/* 1. Far Left Navigation Rail (Desktop Only) */}
      {!isMobile && (
        <div className="w-[60px] bg-[#f0f2f5] border-r border-gray-200 flex flex-col justify-between py-3 shrink-0 z-20">
          <div className="flex flex-col gap-4 items-center">
            <button className="p-2 relative bg-gray-200 rounded-lg text-[#54656f] hover:bg-gray-300">
              <MessageCircle size={22} fill="currentColor" />
              <div className="absolute -top-1 -right-1 bg-[#25D366] text-white text-[10px] font-bold px-1 rounded-full border-2 border-[#f0f2f5]">99+</div>
            </button>
            <button className="p-2 rounded-lg text-[#54656f] hover:bg-gray-200">
              <Phone size={22} />
            </button>
            <button className="p-2 relative rounded-lg text-[#54656f] hover:bg-gray-200">
              <Target size={22} />
              <div className="absolute top-1 right-1 w-2 h-2 bg-[#25D366] rounded-full border-2 border-[#f0f2f5]"></div>
            </button>
            <button className="p-2 relative rounded-lg text-[#54656f] hover:bg-gray-200">
              <MessageSquare size={22} />
              <div className="absolute top-1 right-1 w-2 h-2 bg-[#25D366] rounded-full border-2 border-[#f0f2f5]"></div>
            </button>
            <button className="p-2 rounded-lg text-[#54656f] hover:bg-gray-200">
              <Users size={22} />
            </button>
            <div className="w-8 border-b border-gray-300 my-1"></div>
            <button className="p-2 relative rounded-lg text-[#54656f] hover:bg-gray-200">
              <Archive size={22} />
              <div className="absolute -top-1 -right-1 bg-[#25D366] text-white text-[10px] font-bold px-1 rounded-full border-2 border-[#f0f2f5]">1</div>
            </button>
            <button className="p-2 rounded-lg text-[#a855f7] hover:bg-gray-200">
              <Sparkles size={22} />
            </button>
          </div>
          <div className="flex flex-col gap-4 items-center">
            <button className="p-2 rounded-lg text-[#54656f] hover:bg-gray-200">
              <Settings size={22} />
            </button>
            <button className="p-1 rounded-full hover:bg-gray-200">
              <Avatar src="https://i.pravatar.cc/150?u=me" alt="Me" size="sm" className="w-7 h-7" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Middle Panel: Chats List */}
      {showList && (
        <div className={clsx("flex flex-col bg-white border-r border-gray-200 z-10", isMobile ? "w-full" : "w-[340px] shrink-0")}>
          {/* Header */}
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Chats</h1>
            <div className="flex gap-2">
              <button className="p-2 hover:bg-gray-100 rounded-full text-[#54656f]">
                <MoreVertical size={20} />
              </button>
              <button className="p-1.5 bg-[#25D366] text-white rounded-full hover:bg-[#20b858]">
                <Plus size={22} />
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div className="px-3 pb-3">
            <div className="bg-[#f0f2f5] rounded-xl flex items-center px-3 py-1.5 gap-3 border-b-2 border-transparent focus-within:border-[#25D366] transition-colors">
              <Search size={18} className="text-[#54656f]" />
              <input
                type="text"
                placeholder="Search or start a new chat"
                className="bg-transparent border-none outline-none w-full text-sm text-[#111b21] placeholder-[#54656f]"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Chips */}
          <div className="px-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar items-center">
            <button className="px-3 py-1 bg-[#d8fdd2] text-[#0f5132] text-sm rounded-full font-medium shrink-0">
              All
            </button>
            <button className="px-3 py-1 bg-[#f0f2f5] text-[#54656f] hover:bg-gray-200 text-sm rounded-full font-medium shrink-0">
              Unread <span className="ml-1 text-xs opacity-80">380</span>
            </button>
            <button className="px-3 py-1 bg-[#f0f2f5] text-[#54656f] hover:bg-gray-200 text-sm rounded-full font-medium shrink-0">
              Favourites
            </button>
            <button className="p-1.5 bg-[#f0f2f5] text-[#54656f] hover:bg-gray-200 rounded-full shrink-0">
              <Filter size={16} />
            </button>
          </div>

          {/* Chat List Items */}
          <div className="flex-1 overflow-y-auto bg-white px-2">
            {filteredConversations.map(conv => {
              const isActive = activeConversationId === conv.id && !isMobile;
              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={clsx(
                    "flex items-center p-2.5 rounded-xl cursor-pointer transition-colors mb-1",
                    isActive ? "bg-[#f0f2f5]" : "hover:bg-gray-50"
                  )}
                >
                  <Avatar src={conv.avatar} alt={conv.name} size="lg" className="mr-3 shrink-0" />
                  <div className="flex-1 min-w-0 border-b border-gray-100 pb-2 pt-1 group-last:border-none">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h3 className="text-[16px] font-normal text-[#111b21] truncate">{conv.name}</h3>
                      <span className={clsx("text-xs font-medium", conv.unread ? "text-[#25D366]" : "text-[#667781]")}>
                        {conv.timestamp}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center text-[14px] text-[#667781] truncate gap-1">
                        {conv.lastMessage.startsWith('✓✓') ? (
                          <CheckCheck size={16} className="text-[#53bdeb] shrink-0" />
                        ) : null}
                        <span className="truncate">{conv.lastMessage.replace('✓✓ ', '')}</span>
                      </div>
                      {!!conv.unread && (
                        <div className="bg-[#25D366] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ml-2 flex items-center justify-center shrink-0">
                          {conv.unread}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Main Chat Area */}
      {showChat && (
        <div className={clsx("flex flex-col flex-1 relative bg-[#efeae2]", isMobile ? "w-full" : "w-auto")}>
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="h-16 bg-white px-4 flex items-center justify-between shrink-0 border-b border-gray-200 z-10">
                <div className="flex items-center gap-3">
                  {isMobile && (
                    <button onClick={() => setActiveConversationId(null)} className="mr-1 text-[#54656f]">
                      <ArrowLeft size={24} />
                    </button>
                  )}
                  <Avatar src={activeConversation.avatar} alt={activeConversation.name} size="md" />
                  <div>
                    <h2 className="text-[16px] text-[#111b21] font-medium leading-5">{activeConversation.name}</h2>
                    <p className="text-[13px] text-[#667781]">
                      Business Account
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-[#54656f]">
                  <button className="hover:bg-gray-100 p-2 rounded-lg transition-colors"><Video size={20} /></button>
                  <button className="hover:bg-gray-100 p-2 rounded-lg transition-colors"><Phone size={20} /></button>
                  <div className="w-[1px] h-6 bg-gray-200 my-auto mx-1"></div>
                  <button className="hover:bg-gray-100 p-2 rounded-lg transition-colors"><Search size={20} /></button>
                  <button className="hover:bg-gray-100 p-2 rounded-lg transition-colors"><MoreVertical size={20} /></button>
                </div>
              </div>

              {/* Chat Background Pattern */}
              <div className="absolute inset-0 opacity-[0.4] pointer-events-none z-0" style={{ backgroundImage: 'url("/whatsapp_bg.jpg")', backgroundRepeat: 'repeat' }}></div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-[5%] py-4 z-10 flex flex-col gap-1.5">
                
                {/* Date Pill */}
                <div className="flex justify-center my-3">
                  <span className="bg-white text-[12px] text-[#54656f] px-3 py-1 rounded-lg shadow-sm">
                    Yesterday
                  </span>
                </div>

                {/* Encrypted Notice */}
                <div className="flex justify-center mb-4">
                  <div className="bg-[#ffeecd] text-[#54656f] text-[12.5px] px-4 py-2 rounded-lg shadow-sm text-center max-w-[85%] leading-5">
                    🔒 Messages and calls are end-to-end encrypted. Only people in this chat can read, listen to, or share them. Click to learn more
                  </div>
                </div>

                {/* Mock Messages */}
                {activeMessages.map((msg, index) => {
                  const isMe = msg.sender === 'me';
                  const isFirst = index === 0 || activeMessages[index - 1].sender !== msg.sender;
                  return (
                    <div key={msg.id} className={clsx("flex", isMe ? "justify-end" : "justify-start", !isFirst && "mt-0.5")}>
                      <div className={clsx(
                        "max-w-[70%] px-2.5 pt-1.5 pb-2 shadow-sm relative text-[14.5px] leading-[20px]",
                        isMe ? "bg-[#dcf8c6] text-[#111b21]" : "bg-white text-[#111b21]",
                        // Border radius logic for tails
                        isFirst && isMe ? "rounded-l-lg rounded-br-lg rounded-tr-none" : "",
                        isFirst && !isMe ? "rounded-r-lg rounded-bl-lg rounded-tl-none" : "",
                        !isFirst ? "rounded-lg" : ""
                      )}>
                        <span className="block pr-16 whitespace-pre-wrap break-words">{msg.content}</span>
                        <span className="absolute bottom-1 right-2 text-[10.5px] text-[#667781] flex items-center gap-1 leading-none">
                          {msg.timestamp}
                          {isMe && (
                            msg.status === 'read' ? <CheckCheck size={14} className="text-[#53bdeb]" /> : <Check size={14} />
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Composer */}
              <div className="bg-[#f0f2f5] px-4 py-3 flex items-center gap-3 z-10 w-full shrink-0">
                <div className="flex-1 bg-white rounded-2xl flex items-center shadow-sm px-1 py-1 relative">
                  <div className="flex gap-1 text-[#54656f] px-2 shrink-0">
                    <button onClick={() => setShowAttach(!showAttach)} type="button" className="p-2 hover:bg-gray-100 rounded-full transition-colors relative">
                      <Plus size={22} />
                      {showAttach && <AttachmentMenu onSelect={() => setShowAttach(false)} onClose={() => setShowAttach(false)} />}
                    </button>
                    <button onClick={() => setShowEmoji(!showEmoji)} type="button" className="p-2 hover:bg-gray-100 rounded-full transition-colors relative">
                      <Smile size={22} />
                      {showEmoji && <EmojiPicker onSelect={e => setMessageText(prev => prev + e)} onClose={() => setShowEmoji(false)} />}
                    </button>
                  </div>
                  
                  <textarea
                    rows={1}
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message"
                    className="flex-1 bg-transparent border-none outline-none resize-none max-h-32 text-[15px] pt-2.5 px-2"
                    style={{ minHeight: '40px' }}
                  />
                </div>
                
                <div className="text-[#54656f] shrink-0">
                  {messageText.trim() ? (
                    <button onClick={handleSend} type="button" className="p-3 bg-[#00a884] text-white hover:bg-[#008f6f] rounded-full shadow-sm transition-colors">
                      <Send size={20} className="ml-0.5" />
                    </button>
                  ) : (
                    <button type="button" className="p-3 hover:bg-gray-200 rounded-full transition-colors text-[#54656f]">
                      <Mic size={24} />
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[#f0f2f5] z-10">
              <h1 className="text-3xl font-light text-[#41525d] mb-4">WhatsApp for Windows</h1>
              <p className="text-[#667781] max-w-md">Send and receive messages without keeping your phone online. Use WhatsApp on up to 4 linked devices and 1 phone at the same time.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
