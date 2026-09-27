import React, { useState, useEffect } from 'react';
import { Search, Phone, Video, MoreHorizontal, PlusCircle, Image as ImageIcon, Smile, ThumbsUp, Send, Info } from 'lucide-react';
import { useMessaging } from '../context/MessagingContext';
import { Avatar } from '../components/messaging/Avatar';

export default function Messenger() {
  const { getConversations, getMessages, contacts, sendMessage, receiveMessage, markAsRead } = useMessaging();
  
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  
  const conversations = getConversations('messenger');
  const activeMessages = activeConversationId ? getMessages(activeConversationId) : [];
  
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeContact = activeConversation ? contacts.find(c => c.id === activeConversation.contactId) : null;

  useEffect(() => {
    if (activeConversationId) {
      markAsRead(activeConversationId);
    }
  }, [activeConversationId, activeMessages.length, markAsRead]);

  const handleSend = async (content = messageText) => {
    if (content.trim() && activeConversationId) {
      await sendMessage(activeConversationId, content.trim(), 'text');
      if (content === messageText) setMessageText('');
    }
  };

  const handleReceiveSimulated = async () => {
    if (activeConversationId) {
      await receiveMessage(activeConversationId, 'Messenger simulated reply', 'text');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-white font-sans text-black">
      {/* Left Panel */}
      <div className="w-[360px] flex flex-col border-r border-gray-200 shrink-0">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Chats</h1>
          <div className="flex gap-3 text-gray-700">
            <button className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"><MoreHorizontal size={20} /></button>
            <button className="w-9 h-9 bg-gray-100 hover:bg-gray-200 rounded-full flex items-center justify-center"><Video size={20} /></button>
          </div>
        </div>
        
        <div className="px-4 pb-4 mt-2">
          <div className="bg-gray-100 rounded-full flex items-center px-4 py-2 gap-2">
            <Search size={18} className="text-gray-500" />
            <input type="text" placeholder="Search Messenger" className="bg-transparent border-none outline-none w-full text-[15px]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {conversations.map(conv => {
            const contact = contacts.find(c => c.id === conv.contactId);
            const isActive = activeConversationId === conv.id;
            const msgs = getMessages(conv.id);
            const lastMsg = msgs[msgs.length - 1];
            
            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`flex items-center px-2 py-2 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
              >
                <Avatar src={contact?.avatar} alt={contact?.name || ''} size="lg" className="mr-3 w-[52px] h-[52px]" />
                <div className="flex-1 min-w-0">
                  <div className={`text-[15px] ${conv.unreadCount > 0 ? 'font-semibold' : 'font-normal'}`}>
                    {contact?.name}
                  </div>
                  <div className={`text-[13px] truncate ${conv.unreadCount > 0 ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
                    {lastMsg?.direction === 'outbound' ? 'You: ' : ''}{lastMsg?.content || 'Sent an attachment'} • 1h
                  </div>
                </div>
                {conv.unreadCount > 0 && (
                  <div className="w-3 h-3 bg-blue-600 rounded-full ml-2"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 bg-white relative">
        {activeConversation && activeContact ? (
          <>
            <div className="h-[72px] px-4 flex items-center justify-between border-b border-gray-200 shadow-sm shrink-0 z-10">
              <div className="flex items-center gap-3">
                <Avatar src={activeContact.avatar} alt={activeContact.name} size="sm" className="w-10 h-10" />
                <div>
                  <h2 className="text-[15px] font-semibold">{activeContact.name}</h2>
                  <p className="text-[12px] text-gray-500">Active {activeContact.online ? 'now' : 'yesterday'}</p>
                </div>
              </div>
              <div className="flex gap-4 text-[#0084ff]">
                <button onClick={handleReceiveSimulated} className="text-sm border border-gray-300 text-black px-2 py-1 rounded">Simulate</button>
                <button className="hover:bg-gray-100 p-2 rounded-full"><Phone size={20} fill="currentColor" /></button>
                <button className="hover:bg-gray-100 p-2 rounded-full"><Video size={24} fill="currentColor" /></button>
                <button className="hover:bg-gray-100 p-2 rounded-full"><Info size={24} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-1">
              <div className="flex flex-col items-center justify-center py-6 mb-4">
                <Avatar src={activeContact.avatar} alt={activeContact.name} size="xl" className="mb-2 w-16 h-16" />
                <h2 className="text-[17px] font-semibold">{activeContact.name}</h2>
                <p className="text-gray-500 text-[13px] mt-1">Facebook</p>
                <p className="text-gray-500 text-[13px]">You're friends on Facebook</p>
              </div>

              {activeMessages.map((msg, index) => {
                const isMe = msg.direction === 'outbound';
                const isFirst = index === 0 || activeMessages[index - 1].senderId !== msg.senderId;
                const isLast = index === activeMessages.length - 1 || activeMessages[index + 1].senderId !== msg.senderId;
                
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${isFirst ? 'mt-3' : ''}`}>
                    {(!isMe && isLast) ? (
                       <Avatar src={activeContact.avatar} alt={activeContact.name} size="sm" className="mr-2 self-end w-7 h-7" />
                    ) : (!isMe ? <div className="w-9"></div> : null)}
                    
                    <div className={`max-w-[65%] px-4 py-2 text-[15px] ${
                      isMe ? 'bg-[#0084ff] text-white' : 'bg-[#e4e6eb] text-black'
                    } ${isMe && isFirst ? 'rounded-tl-2xl rounded-tr-2xl rounded-bl-2xl rounded-br-md' : ''}
                      ${isMe && !isFirst && !isLast ? 'rounded-l-2xl rounded-r-md' : ''}
                      ${isMe && isLast && !isFirst ? 'rounded-tl-2xl rounded-bl-2xl rounded-tr-md rounded-br-2xl' : ''}
                      ${isMe && isFirst && isLast ? 'rounded-2xl' : ''}
                      ${!isMe && isFirst ? 'rounded-tr-2xl rounded-tl-2xl rounded-br-2xl rounded-bl-md' : ''}
                      ${!isMe && !isFirst && !isLast ? 'rounded-r-2xl rounded-l-md' : ''}
                      ${!isMe && isLast && !isFirst ? 'rounded-tr-2xl rounded-br-2xl rounded-tl-md rounded-bl-2xl' : ''}
                      ${!isMe && isFirst && isLast ? 'rounded-2xl' : ''}
                    `}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
              <button className="text-[#0084ff] hover:bg-gray-100 p-2 rounded-full"><PlusCircle size={24} fill="currentColor" className="text-white bg-[#0084ff] rounded-full" /></button>
              <button className="text-[#0084ff] hover:bg-gray-100 p-2 rounded-full"><ImageIcon size={24} /></button>
              
              <div className="flex-1 bg-[#f0f2f5] rounded-full flex items-center px-3 py-2 mx-1">
                <input
                  type="text"
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Aa"
                  className="flex-1 bg-transparent border-none outline-none text-[15px] px-1"
                />
                <button className="text-[#0084ff] hover:bg-gray-200 p-1.5 rounded-full"><Smile size={20} /></button>
              </div>
              
              {messageText.trim() ? (
                <button onClick={() => handleSend()} className="text-[#0084ff] hover:bg-gray-100 p-2 rounded-full">
                  <Send size={24} fill="currentColor" />
                </button>
              ) : (
                <button onClick={() => handleSend('👍')} className="text-[#0084ff] hover:bg-gray-100 p-2 rounded-full">
                  <ThumbsUp size={24} fill="currentColor" />
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50">
            <h1 className="text-2xl font-bold text-gray-300">Select a conversation</h1>
          </div>
        )}
      </div>
    </div>
  );
}
