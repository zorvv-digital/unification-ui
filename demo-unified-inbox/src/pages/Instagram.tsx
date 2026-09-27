import React, { useState, useEffect } from 'react';
import { Home, Search, Compass, Film, MessageCircle, Heart, PlusSquare, Menu, Image as ImageIcon, Smile, Mic, Info, ArrowLeft, MoreHorizontal, ChevronDown, SquarePen, Send } from 'lucide-react';
import { clsx } from 'clsx';
import { useMessaging } from '../hooks/useMessaging';
import { Avatar } from '../components/messaging/Avatar';
import { EmojiPicker } from '../components/messaging/EmojiPicker';
import { AttachmentMenu } from '../components/messaging/AttachmentMenu';

export default function Instagram() {
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
  } = useMessaging({ platform: 'instagram' });

  const [messageText, setMessageText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [activeTab, setActiveTab] = useState<'Primary' | 'General' | 'Requests'>('Primary');

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
    <div className="flex h-screen bg-white text-black font-sans overflow-hidden">
      {/* Side Navigation (Desktop only) */}
      {!isMobile && (
        <div className="w-[72px] shrink-0 border-r border-gray-200 flex flex-col pt-8 pb-4 px-3">
          <div className="mb-10 flex justify-center"><InstagramIcon /></div>
          
          <nav className="flex flex-col gap-2 flex-1">
            <NavItem icon={<Home />} label="Home" />
            <NavItem icon={<Search />} label="Search" />
            <NavItem icon={<Compass />} label="Explore" />
            <NavItem icon={<Film />} label="Reels" />
            <NavItem icon={<MessageCircle />} label="Messages" active />
            <NavItem icon={<Heart />} label="Notifications" />
            <NavItem icon={<PlusSquare />} label="Create" />
            <NavItem icon={<Avatar src="https://i.pravatar.cc/150?u=me" alt="Me" size="sm" />} label="Profile" />
          </nav>
          
          <div className="mt-auto">
            <NavItem icon={<Menu />} label="More" />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex min-w-0">
        
        {/* Messages List */}
        {showList && (
          <div className={clsx("flex flex-col border-r border-gray-200", isMobile ? "w-full" : "w-[398px] shrink-0")}>
            <div className="h-[75px] px-6 pt-5 pb-3 flex items-center justify-between shrink-0">
              <div className="font-bold text-xl flex items-center gap-2">
                zorvv.ai
                <ChevronDown size={20} className="cursor-pointer" />
              </div>
              <SquarePen size={24} className="cursor-pointer" />
            </div>

            <div className="flex border-b border-gray-200 mt-2 px-6">
              {['Primary', 'General', 'Requests'].map(tab => (
                <div 
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={clsx(
                    "pb-3 pt-2 mr-6 font-semibold text-sm cursor-pointer border-b-2 transition-colors",
                    activeTab === tab ? "border-black text-black" : "border-transparent text-gray-500 hover:text-gray-400"
                  )}
                >
                  {tab}
                </div>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto pt-2">
              <div className="px-6 pt-2 pb-4">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input type="text" placeholder="Search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full bg-gray-100 rounded-lg pl-10 pr-4 py-1.5 text-[15px] font-medium outline-none focus:ring-1 focus:ring-gray-300" />
                </div>
              </div>

              {/* Notes */}
              <div className="px-6 pb-2 flex gap-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                <div className="flex flex-col items-center gap-1 shrink-0 relative cursor-pointer group">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white px-3 py-1.5 rounded-2xl shadow-sm text-xs border border-gray-100 whitespace-nowrap z-10 text-gray-400 group-hover:-top-7 transition-all">
                    Note...
                  </div>
                  <Avatar src="https://i.pravatar.cc/150?u=me" alt="Me" size="xl" className="border-2 border-white ring-2 ring-gray-100" />
                  <span className="text-xs text-gray-500">Your note</span>
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0 relative cursor-pointer group">
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white px-3 py-1.5 rounded-2xl shadow-sm text-xs border border-gray-100 whitespace-nowrap z-10 text-black group-hover:-top-7 transition-all">
                    Weekend plans?
                  </div>
                  <Avatar src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="User" size="xl" />
                  <span className="text-xs text-black truncate w-[72px] text-center font-medium">zorvv.ai</span>
                </div>
              </div>

              {filteredConversations.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={clsx(
                    "flex items-center px-6 py-2 hover:bg-gray-50 cursor-pointer transition-colors",
                    activeConversationId === conv.id && !isMobile ? "bg-gray-100" : ""
                  )}
                >
                  <Avatar src={conv.avatar} alt={conv.name} size="lg" className="mr-3" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{conv.name}</div>
                    <div className="flex items-center text-sm text-gray-500 truncate mt-0.5">
                      <span className={clsx("truncate", conv.unread ? "font-semibold text-black" : "")}>
                        {conv.lastMessage}
                      </span>
                      <span className="mx-1">·</span>
                      <span>{conv.timestamp}</span>
                    </div>
                  </div>
                  {!!conv.unread && (
                    <div className="w-2 h-2 rounded-full bg-blue-500 ml-3"></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chat Area */}
        {showChat && (
          <div className={clsx("flex flex-col flex-1", isMobile ? "w-full" : "w-auto")}>
            {activeConversation ? (
              <>
                {/* Header */}
                <div className="h-[75px] px-6 flex items-center justify-between border-b border-gray-200 shrink-0">
                  <div className="flex items-center gap-3">
                    {isMobile && (
                      <button onClick={() => setActiveConversationId(null)} className="mr-1">
                        <ArrowLeft size={24} />
                      </button>
                    )}
                    <Avatar src={activeConversation.avatar} alt={activeConversation.name} size="md" />
                    <div>
                      <div className="font-semibold text-base">{activeConversation.name}</div>
                      {activeConversation.online && <div className="text-xs text-gray-500">Active now</div>}
                    </div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <Info size={24} className="cursor-pointer" />
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-2">
                  <div className="flex flex-col items-center justify-center pt-8 pb-10">
                    <Avatar src={activeConversation.avatar} alt={activeConversation.name} size="xl" className="mb-4" />
                    <h2 className="text-xl font-semibold">{activeConversation.name}</h2>
                    <p className="text-gray-500">{activeConversation.username} · Instagram</p>
                    <button className="mt-4 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 font-semibold rounded-lg text-sm">View Profile</button>
                  </div>

                  {activeMessages.map((msg, i) => {
                    const isMe = msg.sender === 'me';
                    return (
                      <div key={msg.id} className={clsx("flex items-end gap-2 group", isMe ? "justify-end" : "justify-start")}>
                        {!isMe && (
                          <Avatar src={activeConversation.avatar} alt={activeConversation.name} size="sm" className="mb-0.5" />
                        )}
                        <div className="flex items-center gap-2 max-w-[70%]">
                          {isMe && <MoreHorizontal size={16} className="text-gray-400 opacity-0 group-hover:opacity-100 cursor-pointer" />}
                          <div className={clsx(
                            "px-4 py-2.5 rounded-3xl text-[15px]",
                            isMe ? "bg-[#3797f0] text-white" : "bg-gray-100 text-black",
                            "whitespace-pre-wrap break-words"
                          )}>
                            {msg.content}
                          </div>
                          {!isMe && <MoreHorizontal size={16} className="text-gray-400 opacity-0 group-hover:opacity-100 cursor-pointer" />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Composer */}
                <div className="p-4">
                  <div className="border border-gray-200 rounded-full px-4 py-2 flex items-center gap-3 relative focus-within:border-gray-400 transition-colors">
                    <div className="relative">
                      <button onClick={() => setShowEmoji(!showEmoji)}>
                        <Smile size={24} className="text-black" />
                      </button>
                      {showEmoji && <EmojiPicker onSelect={e => setMessageText(prev => prev + e)} onClose={() => setShowEmoji(false)} />}
                    </div>
                    
                    <textarea
                      rows={1}
                      value={messageText}
                      onChange={e => setMessageText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Message..."
                      className="w-full bg-transparent border-none outline-none resize-none max-h-32 pt-0.5"
                      style={{ minHeight: '24px' }}
                    />
                    
                    {messageText.trim() ? (
                      <button onClick={handleSend} className="text-[#3797f0] font-semibold text-sm">Send</button>
                    ) : (
                      <div className="flex gap-3 text-black">
                        <button onClick={() => setShowAttach(!showAttach)} className="relative">
                          <ImageIcon size={24} />
                          {showAttach && <AttachmentMenu onSelect={() => setShowAttach(false)} onClose={() => setShowAttach(false)} />}
                        </button>
                        <Heart size={24} />
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center h-full">
                <div className="w-[96px] h-[96px] border-[2px] border-black rounded-full flex items-center justify-center mb-4">
                  <Send size={48} className="translate-x-1 translate-y-1" />
                </div>
                <h2 className="text-[22px] font-semibold mb-2">Your messages</h2>
                <p className="text-[#737373] text-[15px] mb-6 text-center max-w-sm">Send a message to start a chat.</p>
                <button className="bg-[#0095f6] hover:bg-[#1877f2] text-white font-semibold px-4 py-1.5 rounded-lg text-sm">Send message</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={clsx(
      "flex items-center justify-center p-3 rounded-lg cursor-pointer transition-all hover:bg-gray-100",
      active ? "font-bold" : ""
    )} title={label}>
      <div className={clsx("transition-transform group-hover:scale-105", active && "scale-105")}>{icon}</div>
    </div>
  );
}

function InstagramIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform hover:scale-105 cursor-pointer">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
    </svg>
  );
}
