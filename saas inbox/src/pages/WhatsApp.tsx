import React, { useState, useEffect } from 'react';
import { Search, MoreVertical, Plus, Send, CheckCheck } from 'lucide-react';
import { useMessaging } from '../context/MessagingContext';
import { Avatar } from '../components/messaging/Avatar';

export default function WhatsApp() {
  const { getConversations, getMessages, contacts, sendMessage, receiveMessage, markAsRead } = useMessaging();
  
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  
  const conversations = getConversations('whatsapp');
  const activeMessages = activeConversationId ? getMessages(activeConversationId) : [];
  
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const activeContact = activeConversation ? contacts.find(c => c.id === activeConversation.contactId) : null;

  useEffect(() => {
    if (activeConversationId) {
      markAsRead(activeConversationId);
    }
  }, [activeConversationId, activeMessages.length, markAsRead]);

  const handleSend = async () => {
    if (messageText.trim() && activeConversationId) {
      await sendMessage(activeConversationId, messageText.trim(), 'text');
      setMessageText('');
    }
  };

  const handleReceiveSimulated = async () => {
    if (activeConversationId) {
      await receiveMessage(activeConversationId, 'Simulated incoming message', 'text');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-screen bg-white overflow-hidden font-sans text-[#111b21]">
      {/* Left Panel: Chats List */}
      <div className="w-[340px] flex flex-col bg-white border-r border-gray-200 shrink-0">
        <div className="px-4 pt-4 pb-2 flex items-center justify-between bg-[#f0f2f5]">
          <h1 className="text-xl font-bold">WhatsApp Chats</h1>
          <div className="flex gap-2 text-[#54656f]">
            <button className="p-2 hover:bg-gray-200 rounded-full"><Plus size={20} /></button>
            <button className="p-2 hover:bg-gray-200 rounded-full"><MoreVertical size={20} /></button>
          </div>
        </div>
        
        <div className="p-2 bg-white">
          <div className="bg-[#f0f2f5] rounded-lg flex items-center px-3 py-1.5 gap-3">
            <Search size={18} className="text-[#54656f]" />
            <input type="text" placeholder="Search" className="bg-transparent border-none outline-none w-full text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-white">
          {conversations.map(conv => {
            const contact = contacts.find(c => c.id === conv.contactId);
            const isActive = activeConversationId === conv.id;
            const msgs = getMessages(conv.id);
            const lastMsg = msgs[msgs.length - 1];
            
            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`flex items-center px-3 py-2 cursor-pointer transition-colors ${isActive ? 'bg-[#f0f2f5]' : 'hover:bg-gray-50'}`}
              >
                <Avatar src={contact?.avatar} alt={contact?.name || ''} size="lg" className="mr-3" />
                <div className="flex-1 min-w-0 border-b border-gray-100 pb-2 pt-1">
                  <div className="flex justify-between items-baseline mb-0.5">
                    <h3 className="text-base text-[#111b21] truncate">{contact?.name}</h3>
                    <span className={`text-xs ${conv.unreadCount > 0 ? 'text-[#25D366] font-medium' : 'text-[#667781]'}`}>
                      {new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-[#667781] truncate flex items-center gap-1">
                      {lastMsg?.direction === 'outbound' && <CheckCheck size={14} className="text-[#53bdeb]" />}
                      {lastMsg?.content || 'No messages'}
                    </div>
                    {conv.unreadCount > 0 && (
                      <div className="bg-[#25D366] text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center ml-2">
                        {conv.unreadCount}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 bg-[#efeae2] relative">
        {activeConversation && activeContact ? (
          <>
            <div className="h-16 bg-[#f0f2f5] px-4 flex items-center justify-between border-b border-gray-200 z-10">
              <div className="flex items-center gap-3">
                <Avatar src={activeContact.avatar} alt={activeContact.name} size="md" />
                <div>
                  <h2 className="text-base text-[#111b21] font-medium leading-5">{activeContact.name}</h2>
                  <p className="text-xs text-[#667781]">{activeContact.online ? 'Online' : 'Offline'}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleReceiveSimulated} className="px-3 py-1 bg-white border border-gray-300 rounded text-sm hover:bg-gray-50">
                  Simulate Reply
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-[5%] py-4 z-10 flex flex-col gap-1.5">
              {activeMessages.map((msg, index) => {
                const isMe = msg.direction === 'outbound';
                const isFirst = index === 0 || activeMessages[index - 1].senderId !== msg.senderId;
                
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${!isFirst ? 'mt-0.5' : 'mt-2'}`}>
                    <div className={`max-w-[70%] px-3 pt-1.5 pb-2 shadow-sm relative text-[14.5px] leading-[20px] ${
                      isMe ? 'bg-[#dcf8c6]' : 'bg-white'
                    } ${isFirst && isMe ? 'rounded-l-lg rounded-br-lg' : isFirst && !isMe ? 'rounded-r-lg rounded-bl-lg' : 'rounded-lg'}`}>
                      <span className="block pr-14 whitespace-pre-wrap">{msg.content}</span>
                      <span className="absolute bottom-1 right-2 text-[10px] text-[#667781] flex items-center gap-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {isMe && <CheckCheck size={14} className={msg.status === 'read' ? 'text-[#53bdeb]' : ''} />}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-[#f0f2f5] px-4 py-3 flex items-center gap-3 z-10">
              <div className="flex-1 bg-white rounded-lg flex items-center shadow-sm px-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message"
                  className="flex-1 bg-transparent border-none outline-none text-sm py-2.5 px-2"
                />
              </div>
              <button 
                onClick={handleSend}
                disabled={!messageText.trim()}
                className={`p-2 rounded-full transition-colors ${messageText.trim() ? 'bg-[#00a884] text-white hover:bg-[#008f6f]' : 'text-[#54656f]'}`}
              >
                <Send size={20} className={messageText.trim() ? 'ml-0.5' : ''} />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center p-8 text-[#667781]">
            <div>
              <h1 className="text-2xl font-light mb-2">WhatsApp for Windows</h1>
              <p>Select a chat to start messaging.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
