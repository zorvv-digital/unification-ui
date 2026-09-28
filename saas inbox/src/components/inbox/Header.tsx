import React, { useEffect, useState } from 'react';
import { Search, Bell, HelpCircle, Menu, Bot } from 'lucide-react';
import { AiScheduleModal } from './AiScheduleModal';
import { Avatar } from '../messaging/Avatar';
import { apiService } from '../../context/MessagingContext';
import { aiApi } from '../../services/aiApi';
import { channelApi } from '../../services/channelApi';

// On when any channel has AI auto-reply.
const loadAutoReply = () => channelApi.listChannels().then(channels => channels.some(c => c.ai_enabled));

interface HeaderProps {
  onOpenMobileSidebar: () => void;
  showMobileMenu: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onOpenMobileSidebar, 
  showMobileMenu,
  searchQuery,
  onSearchChange
}) => {
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (apiService) loadAutoReply().then(setIsAiEnabled).catch(() => {});
  }, []);

  const handleToggle = async () => {
    if (!isAiEnabled) return setIsModalOpen(true);
    if (apiService) {
      const channels = await channelApi.listChannels();
      await Promise.all(channels.filter(c => c.ai_enabled).map(c => aiApi.updateChannel(c.id, { ai_enabled: false })));
    }
    setIsAiEnabled(false);
  };

  return (
    <header className="h-14 bg-white border-b border-[var(--color-brand-border)] flex items-center justify-between px-4 shrink-0 z-20 relative">
      {/* Left: Breadcrumbs / Mobile Menu Toggle */}
      <div className="flex items-center gap-3 w-1/4">
        {showMobileMenu && (
          <button 
            onClick={onOpenMobileSidebar}
            className="md:hidden p-1.5 -ml-1.5 text-[var(--color-brand-text-secondary)] hover:bg-gray-100 rounded-lg"
          >
            <Menu size={20} />
          </button>
        )}
        <div className="hidden md:flex items-center text-sm font-medium text-[var(--color-brand-text-secondary)]">
          <span>Unified</span>
          <span className="mx-2">/</span>
          <span className="text-[var(--color-brand-text)]">Inbox</span>
        </div>
      </div>

      {/* Center: Global Search */}
      <div className="flex-1 max-w-xl hidden sm:flex justify-center px-4">
        <div className="w-full relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={16} className="text-gray-400" />
          </div>
          <input 
            type="text" 
            placeholder="Search conversations, contacts, messages..." 
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="block w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-transparent hover:border-gray-200 focus:bg-white focus:border-gray-300 focus:ring-0 rounded-full text-sm transition-colors outline-none"
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center justify-end gap-2 w-1/4">
        <div className="flex items-center gap-2 mr-2" title="Global AI Automation">
          <Bot size={18} className={isAiEnabled ? "text-blue-600" : "text-gray-400"} />
          <button 
            aria-label="AI auto-reply"
            aria-pressed={isAiEnabled}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors ${isAiEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
            onClick={handleToggle}
          >
            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${isAiEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
        <button className="p-2 text-[var(--color-brand-text-secondary)] hover:bg-gray-100 hover:text-[var(--color-brand-text)] rounded-full transition-colors">
          <HelpCircle size={20} />
        </button>
        <button className="p-2 text-[var(--color-brand-text-secondary)] hover:bg-gray-100 hover:text-[var(--color-brand-text)] rounded-full transition-colors relative">
          <Bell size={20} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>
        <div className="w-px h-6 bg-[var(--color-brand-border)] mx-1 hidden sm:block"></div>
        <button className="p-1 rounded-full hover:bg-gray-100 transition-colors hidden sm:block">
          <Avatar alt="Jane Doe" size="sm" src="https://i.pravatar.cc/150?u=admin" className="w-7 h-7" />
        </button>
      </div>
      
      <AiScheduleModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={() => apiService ? loadAutoReply().then(setIsAiEnabled) : setIsAiEnabled(true)}
      />
    </header>
  );
};
