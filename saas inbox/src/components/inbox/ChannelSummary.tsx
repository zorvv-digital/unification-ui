import React from 'react';
import { FaFacebookMessenger, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import type { FilterType } from './FilterBar';

interface SummaryStats {
  whatsapp: { count: number; unread: number };
  instagram: { count: number; unread: number };
  messenger: { count: number; unread: number };
}

interface ChannelSummaryProps {
  stats: SummaryStats;
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
}

export const ChannelSummary: React.FC<ChannelSummaryProps> = ({ stats, activeFilter, onFilterChange }) => {
  return (
    <div className="flex gap-2 p-3 overflow-x-auto no-scrollbar shrink-0 border-b border-[var(--color-brand-border)]">
      <SummaryCard 
        icon={<FaWhatsapp size={15} />}
        name="WhatsApp" 
        count={stats.whatsapp.count} 
        unread={stats.whatsapp.unread}
        color="#25D366"
        active={activeFilter === 'whatsapp'}
        onClick={() => onFilterChange('whatsapp')}
      />
      <SummaryCard 
        icon={<FaInstagram size={15} />}
        name="Instagram" 
        count={stats.instagram.count} 
        unread={stats.instagram.unread}
        color="#E1306C"
        active={activeFilter === 'instagram'}
        onClick={() => onFilterChange('instagram')}
      />
      <SummaryCard 
        icon={<FaFacebookMessenger size={15} />}
        name="Messenger" 
        count={stats.messenger.count} 
        unread={stats.messenger.unread}
        color="#0084FF"
        active={activeFilter === 'messenger'}
        onClick={() => onFilterChange('messenger')}
      />
    </div>
  );
};

interface SummaryCardProps {
  icon: React.ReactNode;
  name: string;
  count: number;
  unread: number;
  color: string;
  active: boolean;
  onClick: () => void;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ icon, name, count, unread, color, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={`Filter inbox by ${name}`}
    className={`flex-1 min-w-[120px] bg-white border rounded-lg p-2.5 flex flex-col text-left shadow-sm transition-all hover:bg-gray-50 hover:shadow ${active ? 'ring-2 ring-gray-900 border-transparent' : 'border-[var(--color-brand-border)]'}`}
  >
    <div className="flex items-center gap-2 mb-1.5">
      <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ color }}>
        {icon}
      </div>
      <span className="text-xs font-semibold text-[var(--color-brand-text)] truncate">{name}</span>
    </div>
    <div className="text-[10px] text-[var(--color-brand-text-secondary)]">
      <span className="font-medium text-[var(--color-brand-text)]">{count}</span> convos
    </div>
    <div className="flex items-center justify-between mt-1">
      <div className="text-[10px] text-gray-500">
        {unread > 0 ? <span className="text-red-500 font-medium">{unread} unread</span> : '0 unread'}
      </div>
      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" title="Connected (Demo)"></div>
    </div>
  </button>
);
