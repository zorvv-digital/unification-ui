import React, { useEffect, useState } from 'react';
import { 
  Inbox, MessageSquare, Users, BarChart2, Zap, Settings,
  ChevronDown, X, Mail, LogOut, RotateCcw
} from 'lucide-react';
import { apiService } from '../../context/MessagingContext';
import { clearToken, type ApiUser } from '../../services/messaging/HttpMessageService';
import { Avatar } from '../messaging/Avatar';
import { GmailModal } from '../channels/GmailModal';
import { WebsiteChatModal } from '../channels/WebsiteChatModal';
import { InstagramIcon } from '../icons/InstagramIcon';
import { FaWhatsapp } from 'react-icons/fa';
import { Bot, Globe } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

interface SidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isMobileOpen, onCloseMobile }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [gmailOpen, setGmailOpen] = useState(false);
  const [websiteOpen, setWebsiteOpen] = useState(false);

  useEffect(() => {
    apiService?.me().then(setUser).catch(() => setUser(null));
  }, []);

  const logout = () => {
    clearToken();
    window.location.href = '/login';
  };

  const resetDemo = async () => {
    if (!apiService || !window.confirm('Reset the demo workspace to its original conversations?')) return;
    await apiService.resetDemo();
    window.location.reload();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden" 
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed md:static inset-y-0 left-0 z-50
        w-[240px] bg-[var(--color-brand-surface)] border-r border-[var(--color-brand-border)]
        flex flex-col transform transition-transform duration-200 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Header / Workspace Selector */}
        <div className="h-14 px-4 flex items-center justify-between border-b border-[var(--color-brand-border)] shrink-0">
          <button className="flex items-center gap-2 text-[var(--color-brand-text)] font-medium hover:bg-gray-100 p-1.5 -ml-1.5 rounded-lg transition-colors w-full">
            <div className="w-6 h-6 bg-gray-800 text-white rounded-md flex items-center justify-center text-xs font-bold">U</div>
            <span className="flex-1 text-left">Unified</span>
            <ChevronDown size={16} className="text-[var(--color-brand-text-secondary)]" />
          </button>
          <button onClick={onCloseMobile} className="md:hidden p-1 text-[var(--color-brand-text-secondary)]">
            <X size={20} />
          </button>
        </div>

        {/* Navigation Area */}
        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-6 no-scrollbar">
          
          {/* Main Section */}
          <div>
            <div className="text-xs font-medium text-[var(--color-brand-text-secondary)] uppercase tracking-wider mb-2 px-2">Main</div>
            <nav className="flex flex-col gap-0.5">
              <SidebarItem icon={<Inbox size={18} />} label="Inbox" active={location.pathname === '/inbox'} badge="12" onClick={() => navigate('/inbox')} />
              <SidebarItem icon={<MessageSquare size={18} />} label="Messages" />
              <SidebarItem icon={<Users size={18} />} label="Contacts" active={location.pathname === '/contacts'} onClick={() => navigate('/contacts')} />
            </nav>
          </div>

          {/* Channels Section */}
          <div>
            <div className="text-xs font-medium text-[var(--color-brand-text-secondary)] uppercase tracking-wider mb-2 px-2">Channels</div>
            <nav className="flex flex-col gap-0.5">
              <SidebarItem icon={<FaWhatsapp size={18} className="text-[#25D366]" />} label="WhatsApp" badge="3" />
              <SidebarItem icon={<InstagramIcon size={18} className="text-[#E1306C]" />} label="Instagram" />
              <SidebarItem icon={<MessageSquare size={18} className="text-[#0084FF]" />} label="Messenger" badge="1" />
              <SidebarItem icon={<Mail size={18} className="text-red-500" />} label="Gmail" onClick={() => apiService && setGmailOpen(true)} />
              <SidebarItem icon={<Globe size={18} className="text-gray-900" />} label="Website chat" onClick={() => apiService && setWebsiteOpen(true)} />
            </nav>
          </div>

          {/* Workspace Section */}
          <div>
            <div className="text-xs font-medium text-[var(--color-brand-text-secondary)] uppercase tracking-wider mb-2 px-2">Workspace</div>
            <nav className="flex flex-col gap-0.5">
              <SidebarItem icon={<BarChart2 size={18} />} label="Analytics" />
              <SidebarItem icon={<Zap size={18} />} label="Automations" />
              <SidebarItem icon={<Settings size={18} />} label="Settings" />
              <SidebarItem 
                icon={<Bot size={18} />} 
                label="AI Playground" 
                active={location.pathname === '/ai-playground'}
                onClick={() => navigate('/ai-playground')}
              />
            </nav>
          </div>

        </div>

        {/* Bottom User Area */}
        <div className="p-4 border-t border-[var(--color-brand-border)] shrink-0">
          <div className="flex items-center gap-3 w-full p-2 -mx-2 rounded-lg">
            <Avatar alt={user?.name ?? 'Jane Doe'} size="sm" src={user ? undefined : 'https://i.pravatar.cc/150?u=admin'} className="w-8 h-8" />
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm font-medium text-[var(--color-brand-text)] truncate">{user?.name ?? 'Jane Doe'}</div>
              <div className="text-xs text-[var(--color-brand-text-secondary)] truncate">{user?.workspace.name ?? 'Admin'}</div>
            </div>
            {user && (
              <button onClick={logout} title="Log out" aria-label="Log out" className="p-1.5 rounded-lg text-[var(--color-brand-text-secondary)] hover:bg-gray-100 hover:text-[var(--color-brand-text)] transition-colors">
                <LogOut size={16} />
              </button>
            )}
          </div>
          {user?.workspace.is_demo && (
            <button onClick={resetDemo} className="mt-2 flex items-center justify-center gap-2 w-full px-3 py-1.5 rounded-lg border border-[var(--color-brand-border)] text-xs font-medium text-[var(--color-brand-text-secondary)] hover:bg-gray-50 hover:text-[var(--color-brand-text)] transition-colors">
              <RotateCcw size={14} />
              Reset demo data
            </button>
          )}
        </div>
      </aside>
      {gmailOpen && <GmailModal onClose={() => setGmailOpen(false)} onChanged={() => {}} />}
      {websiteOpen && <WebsiteChatModal onClose={() => setWebsiteOpen(false)} />}
    </>
  );
};

// Subcomponent for sidebar items
function SidebarItem({ icon, label, active, badge, onClick }: { icon: React.ReactNode, label: string, active?: boolean, badge?: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`
        flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors text-sm font-medium
        ${active 
          ? 'bg-gray-100 text-[var(--color-brand-text)]' 
          : 'text-[var(--color-brand-text-secondary)] hover:bg-gray-50 hover:text-[var(--color-brand-text)]'}
      `}
    >
      <div className="flex items-center gap-3">
        {icon}
        <span>{label}</span>
      </div>
      {badge && (
        <span className="bg-gray-200 text-[var(--color-brand-text)] text-xs font-semibold px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
}
