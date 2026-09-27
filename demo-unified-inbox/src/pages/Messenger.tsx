import React, { useState, useEffect } from 'react';
import { Search, Edit, MoreHorizontal, Phone, Video, Info, Smile, PlusCircle, Image as ImageIcon, ThumbsUp, ArrowLeft, Mic } from 'lucide-react';
import { clsx } from 'clsx';
import { useMessaging } from '../hooks/useMessaging';
import { Avatar } from '../components/messaging/Avatar';
import { EmojiPicker } from '../components/messaging/EmojiPicker';
import { AttachmentMenu } from '../components/messaging/AttachmentMenu';

export default function Messenger() {
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
  } = useMessaging({ platform: 'messenger' });

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
    <div className="flex h-screen bg-white font-sans overflow-hidden">
      {/* Sidebar */}
      {showList && (
        <div className={clsx("flex flex-col border-r border-gray-200", isMobile ? "w-full" : "w-[360px] shrink-0")}>
          <div className="p-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold text-black">Chats</h1>
            <div className="flex gap-2 text-gray-500">
              <button className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                <MoreHorizontal size={20} />
              </button>
              <button className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                <Video size={20} />
              </button>
              <button className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                <Edit size={20} />
              </button>
            </div>
          </div>

          <div className="px-4 pb-4">
            <div className="bg-gray-100 rounded-full flex items-center px-4 py-2 gap-2 focus-within:ring-2 ring-blue-100">
              <Search size={18} className="text-gray-500" />
              <input
                type="text"
                placeholder="Search Messenger"
                className="bg-transparent border-none outline-none w-full text-[15px]"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredConversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={clsx(
                  "flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors mx-2 rounded-xl",
                  activeConversationId === conv.id && !isMobile ? "bg-gray-100" : ""
                )}
              >
                <div className="relative mr-3">
                  <Avatar src={conv.avatar} alt={conv.name} size="lg" online={conv.online} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium text-black">{conv.name}</div>
                  <div className="flex items-center text-[13px] text-gray-500 truncate mt-0.5">
                    <span className={clsx("truncate", conv.unread ? "font-bold text-black" : "")}>
                      {conv.lastMessage}
                    </span>
                    <span className="mx-1">·</span>
                    <span className="shrink-0">{conv.timestamp}</span>
                  </div>
                </div>
                {!!conv.unread && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[#0084FF] ml-3 shrink-0"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      {showChat && (
        <div className={clsx("flex flex-col flex-1", isMobile ? "w-full" : "w-auto")}>
          {activeConversation ? (
            <>
              {/* Chat Header */}
              <div className="h-[70px] px-4 flex items-center justify-between border-b border-gray-200 shrink-0 shadow-sm z-10 relative">
                <div className="flex items-center gap-3">
                  {isMobile && (
                    <button onClick={() => setActiveConversationId(null)} className="text-[#0084FF] p-2 -ml-2 rounded-full hover:bg-gray-100">
                      <ArrowLeft size={24} />
                    </button>
                  )}
                  <Avatar src={activeConversation.avatar} alt={activeConversation.name} size="md" online={activeConversation.online} />
                  <div>
                    <h2 className="text-[15px] font-semibold text-black leading-tight">{activeConversation.name}</h2>
                    <p className="text-[12px] text-gray-500">
                      {activeConversation.online ? 'Active now' : 'Active recently'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 text-[#0084FF]">
                  <button className="p-2 rounded-full hover:bg-gray-100 transition-colors"><Phone size={20} /></button>
                  <button className="p-2 rounded-full hover:bg-gray-100 transition-colors"><Video size={20} /></button>
                  <button className="p-2 rounded-full hover:bg-gray-100 transition-colors"><Info size={20} /></button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1.5">
                <div className="flex flex-col items-center justify-center pt-8 pb-6">
                  <Avatar src={activeConversation.avatar} alt={activeConversation.name} size="xl" className="mb-2" />
                  <h2 className="text-xl font-bold">{activeConversation.name}</h2>
                  <p className="text-sm text-gray-500 mt-1">Facebook</p>
                  <p className="text-sm text-gray-500 mt-1">You're friends on Facebook</p>
                </div>

                {activeMessages.map((msg, index) => {
                  const isMe = msg.sender === 'me';
                  const isFirst = index === 0 || activeMessages[index - 1].sender !== msg.sender;
                  const isLast = index === activeMessages.length - 1 || activeMessages[index + 1].sender !== msg.sender;

                  return (
                    <div key={msg.id} className={clsx("flex items-end gap-2", isMe ? "justify-end" : "justify-start", !isLast && "mb-0.5")}>
                      {!isMe && (
                        <div className="w-7 h-7 shrink-0">
                          {isLast && <Avatar src={activeConversation.avatar} alt={activeConversation.name} size="sm" className="w-7 h-7" />}
                        </div>
                      )}
                      <div className={clsx(
                        "px-4 py-2 text-[15px] max-w-[65%]",
                        isMe ? "bg-[#0084FF] text-white" : "bg-[#e4e6eb] text-black",
                        "whitespace-pre-wrap break-words"
                      )}
                      style={{
                        borderTopLeftRadius: !isMe && !isFirst ? '4px' : '18px',
                        borderBottomLeftRadius: !isMe && !isLast ? '4px' : '18px',
                        borderTopRightRadius: isMe && !isFirst ? '4px' : '18px',
                        borderBottomRightRadius: isMe && !isLast ? '4px' : '18px',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Composer */}
              <div className="p-3 flex items-end gap-2 bg-white">
                <div className="flex gap-1 text-[#0084FF] pb-2 relative">
                  <button onClick={() => setShowAttach(!showAttach)} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                    <PlusCircle size={22} />
                  </button>
                  {showAttach && <AttachmentMenu onSelect={() => setShowAttach(false)} onClose={() => setShowAttach(false)} />}
                  <button className="p-2 rounded-full hover:bg-gray-100 transition-colors hidden sm:block">
                    <ImageIcon size={22} />
                  </button>
                </div>

                <div className="flex-1 bg-[#f0f2f5] rounded-3xl px-3 py-2 flex items-center gap-2">
                  <textarea
                    rows={1}
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Aa"
                    className="w-full bg-transparent border-none outline-none resize-none max-h-32 text-[15px] pt-1"
                    style={{ minHeight: '24px' }}
                  />
                  <div className="relative shrink-0">
                    <button onClick={() => setShowEmoji(!showEmoji)} className="text-[#0084FF] p-1 rounded-full hover:bg-gray-200">
                      <Smile size={24} />
                    </button>
                    {showEmoji && <EmojiPicker onSelect={e => setMessageText(prev => prev + e)} onClose={() => setShowEmoji(false)} />}
                  </div>
                </div>

                <div className="pb-1.5 text-[#0084FF] shrink-0">
                  {messageText.trim() ? (
                    <button onClick={handleSend} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                        <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.994623095,21.8998071 2.25032649,22.2139634 C3.19218622,22.5281196 4.13404595,22.2139634 4.76192095,21.5855217 L21.7142475,12.9458925 C22.499092,12.6317363 22.8129759,11.8461538 22.8129759,11.2177121 C22.8129759,10.5892704 22.499092,9.80368794 21.7142475,9.4895317 L4.76192095,0.849902509 C4.13404595,0.221460775 3.19218622,-0.0926954605 2.25032649,0.221460775 C0.994623095,0.53561701 0.8376543,1.6347876 1.15159189,2.42027455 L3.03521743,8.8612675 C3.03521743,9.01836486 3.19218622,9.17546223 3.50612381,9.17546223 L16.6915026,9.96094921 C17.3193776,9.96094921 17.7899401,10.4322471 17.7899401,11.2177121 C17.7899401,12.0031771 17.3193776,12.4744748 16.6915026,12.4744748 Z"></path>
                      </svg>
                    </button>
                  ) : (
                    <button className="p-2 rounded-full hover:bg-gray-100 transition-colors">
                      <ThumbsUp size={24} />
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <h2 className="text-2xl font-semibold mb-2">No Chat Selected</h2>
              <p className="text-gray-500">Select a conversation to start messaging</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
