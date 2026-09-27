import React from 'react';
import { X, Phone, Search, UserCircle, Tag, Clock, FileText, Bell, Trash2 } from 'lucide-react';
import { useMessagingContext } from '../../context/MessagingContext';
import { Avatar } from '../messaging/Avatar';

interface ContactPanelProps {
  conversationId: string;
  onClose: () => void;
}

export const ContactPanel: React.FC<ContactPanelProps> = ({ conversationId, onClose }) => {
  const { conversations, contacts } = useMessagingContext();
  
  const conversation = conversations.find(c => c.id === conversationId);
  const contact = contacts.find(c => c.id === conversation?.contactId);

  if (!conversation || !contact) return null;

  return (
    <div className="w-[300px] xl:w-[340px] bg-white border-l border-gray-200/60 shrink-0 h-full flex flex-col overflow-y-auto">
      
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-gray-100 sticky top-0 bg-white z-10">
        <h3 className="font-semibold text-[15px] text-gray-900">Contact Details</h3>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors">
          <X size={18} />
        </button>
      </div>

      <div className="p-6 flex flex-col items-center text-center border-b border-gray-100">
        <Avatar src={contact.avatar} alt={contact.name} size="xl" className="w-20 h-20 mb-3 shadow-sm ring-4 ring-gray-50" />
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">{contact.name}</h2>
        {contact.username && <p className="text-[13px] text-gray-500 mt-1">@{contact.username}</p>}
        
        <div className="flex gap-3 mt-5">
          <button className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors border border-gray-200/50 w-[72px]">
            <UserCircle size={20} className="text-gray-500" />
            <span className="text-[11px] font-medium">Profile</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors border border-gray-200/50 w-[72px]">
            <Phone size={20} className="text-gray-500" />
            <span className="text-[11px] font-medium">Call</span>
          </button>
          <button className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition-colors border border-gray-200/50 w-[72px]">
            <Search size={20} className="text-gray-500" />
            <span className="text-[11px] font-medium">Search</span>
          </button>
        </div>
      </div>

      {/* Info Cards - Rounded Rectangles */}
      <div className="p-4 flex flex-col gap-4">
        
        <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
          <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">About</h4>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100">
                <Tag size={14} className="text-gray-500" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Source</div>
                <div className="text-[13px] font-medium text-gray-900 capitalize">{conversation.platform}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100">
                <Clock size={14} className="text-gray-500" />
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Local Time</div>
                <div className="text-[13px] font-medium text-gray-900">10:45 AM</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-50/80 rounded-2xl p-4 border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Tags</h4>
            <button className="text-[11px] text-blue-600 font-medium hover:underline">Add</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold tracking-wide">LEAD</span>
            <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 text-[11px] font-bold tracking-wide">VIP</span>
          </div>
        </div>

        <div className="bg-gray-50/80 rounded-2xl p-1 border border-gray-100">
          <button className="w-full flex items-center justify-between p-3 hover:bg-gray-100 rounded-xl transition-colors">
            <div className="flex items-center gap-3 text-gray-700">
              <FileText size={18} className="text-gray-400" />
              <span className="text-[13px] font-medium">Shared Media & Docs</span>
            </div>
            <span className="text-gray-400 text-[11px]">12</span>
          </button>
          <button className="w-full flex items-center justify-between p-3 hover:bg-gray-100 rounded-xl transition-colors">
            <div className="flex items-center gap-3 text-gray-700">
              <Bell size={18} className="text-gray-400" />
              <span className="text-[13px] font-medium">Mute Notifications</span>
            </div>
          </button>
          <button className="w-full flex items-center justify-between p-3 hover:bg-red-50 rounded-xl transition-colors group">
            <div className="flex items-center gap-3 text-red-600">
              <Trash2 size={18} className="text-red-400 group-hover:text-red-600 transition-colors" />
              <span className="text-[13px] font-medium">Delete Chat</span>
            </div>
          </button>
        </div>

      </div>

    </div>
  );
};
