import React, { useState, useEffect } from 'react';
import { Info, Phone, Video, Image, Heart, Send } from 'lucide-react';
import { useMessaging } from '../context/MessagingContext';
import { Avatar } from '../components/messaging/Avatar';

export default function Instagram() {
  const { getConversations, getMessages, contacts, sendMessage, receiveMessage, markAsRead } = useMessaging();
  
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  
  const conversations = getConversations('instagram');
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
      await receiveMessage(activeConversationId, 'Instagram simulated reply', 'text');
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
      {/* Left Panel: Chats List */}
      <div className="w-[350px] flex flex-col border-r border-gray-200 shrink-0">
        <div className="px-5 pt-6 pb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">johndoe</h1>
          <button className="text-black font-semibold text-2xl mb-2">...</button>
        </div>
        
        <div className="px-5 pb-4">
          <div className="font-semibold mb-3">Messages</div>
        </div>

        <div className="flex-1 overflow-y-auto px-3">
          {conversations.map(conv => {
            const contact = contacts.find(c => c.id === conv.contactId);
            const isActive = activeConversationId === conv.id;
            const msgs = getMessages(conv.id);
            const lastMsg = msgs[msgs.length - 1];
            
            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={`flex items-center p-2 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              >
                <Avatar src={contact?.avatar} alt={contact?.name || ''} size="lg" className="mr-3" />
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] ${conv.unreadCount > 0 ? 'font-semibold' : 'font-normal'}`}>
                    {contact?.name}
                  </div>
                  <div className={`text-[13px] truncate ${conv.unreadCount > 0 ? 'text-black font-semibold' : 'text-gray-500'}`}>
                    {lastMsg?.content || 'Sent an attachment'} • 1h
                  </div>
                </div>
                {conv.unreadCount > 0 && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full ml-2"></div>
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
            <div className="h-[72px] px-5 flex items-center justify-between border-b border-gray-200 shrink-0">
              <div className="flex items-center gap-3">
                <Avatar src={activeContact.avatar} alt={activeContact.name} size="md" />
                <div>
                  <h2 className="text-[16px] font-semibold">{activeContact.name}</h2>
                  <p className="text-[12px] text-gray-500">Active {activeContact.online ? 'now' : 'yesterday'}</p>
                </div>
              </div>
              <div className="flex gap-4 items-center">
                <button onClick={handleReceiveSimulated} className="text-sm border px-2 py-1 rounded">Simulate</button>
                <Phone size={24} className="text-black" />
                <Video size={26} className="text-black" />
                <Info size={24} className="text-black" />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2">
              <div className="flex flex-col items-center justify-center py-6 mb-4">
                <Avatar src={activeContact.avatar} alt={activeContact.name} size="xl" className="mb-3 w-24 h-24" />
                <h2 className="text-xl font-semibold">{activeContact.name}</h2>
                <p className="text-gray-500 text-sm mt-1">Instagram</p>
                <button className="mt-4 px-4 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold">View Profile</button>
              </div>

              {activeMessages.map((msg, index) => {
                const isMe = msg.direction === 'outbound';
                
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {(!isMe && (index === 0 || activeMessages[index - 1].senderId !== msg.senderId)) ? (
                       <Avatar src={activeContact.avatar} alt={activeContact.name} size="sm" className="mr-2 self-end mb-1 w-7 h-7" />
                    ) : (!isMe ? <div className="w-9"></div> : null)}
                    
                    <div className={`max-w-[65%] px-4 py-2 text-[15px] ${
                      isMe ? 'bg-[#3797f0] text-white rounded-2xl rounded-br-sm' : 'bg-[#efefef] text-black rounded-2xl rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4">
              <div className="border border-gray-300 rounded-full flex items-center px-4 py-2">
                <button className="p-1 text-black"><SmileIcon /></button>
                <input
                  type="text"
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message..."
                  className="flex-1 bg-transparent border-none outline-none text-[15px] px-3"
                />
                {messageText.trim() ? (
                  <button onClick={handleSend} className="text-[#3797f0] font-semibold text-[15px]">Send</button>
                ) : (
                  <div className="flex gap-3 text-black">
                    <button><Image size={24} /></button>
                    <button><Heart size={24} /></button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-24 h-24 border-2 border-black rounded-full flex items-center justify-center mb-4">
              <Send size={48} className="ml-2 rotate-[-20deg]" />
            </div>
            <h1 className="text-2xl font-normal mb-2">Your Messages</h1>
            <p className="text-gray-500 mb-6">Send private photos and messages to a friend or group.</p>
            <button className="bg-[#0095f6] hover:bg-[#1877f2] text-white font-semibold px-4 py-1.5 rounded-lg">Send Message</button>
          </div>
        )}
      </div>
    </div>
  );
}

const SmileIcon = () => (
  <svg aria-label="Emoji" color="currentColor" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24">
    <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09-.036 1 1 0 0 0-1.55-1.227ZM12 16.2238a8.223 8.223 0 1 0-8.223-8.222A8.223 8.223 0 0 0 12 16.224Zm0-18.446a10.223 10.223 0 1 1-10.223 10.223A10.223 10.223 0 0 1 12-2.222Z"></path>
  </svg>
);
