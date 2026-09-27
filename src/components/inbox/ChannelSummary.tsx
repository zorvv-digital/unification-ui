import React from 'react';
import { MessageCircle, MessageSquare } from 'lucide-react';
import { InstagramIcon } from '../icons/InstagramIcon';

interface SummaryStats {
  whatsapp: { count: number; unread: number };
  instagram: { count: number; unread: number };
  messenger: { count: number; unread: number };
}

export const ChannelSummary: React.FC<{ stats: SummaryStats }> = ({ stats }) => {
  return (
    <div className="flex gap-2 p-3 overflow-x-auto no-scrollbar shrink-0 border-b border-[var(--color-brand-border)]">
      <SummaryCard 
        icon={<MessageCircle size={14} className="text-white" />} 
        name="WhatsApp" 
        count={stats.whatsapp.count} 
        unread={stats.whatsapp.unread}
        iconBg="bg-[#25D366]" 
      />
      <SummaryCard 
        icon={<InstagramIcon size={14} className="text-white" />} 
        name="Instagram" 
        count={stats.instagram.count} 
        unread={stats.instagram.unread}
        iconBg="bg-gradient-to-tr from-[#fd5949] to-[#d6249f]" 
      />
      <SummaryCard 
        icon={<MessageSquare size={14} className="text-white" />} 
        name="Messenger" 
        count={stats.messenger.count} 
        unread={stats.messenger.unread}
        iconBg="bg-[#0084FF]" 
      />
    </div>
  );
};

const SummaryCard = ({ icon, name, count, unread, iconBg }: any) => (
  <div className="flex-1 min-w-[120px] bg-white border border-[var(--color-brand-border)] rounded-lg p-2.5 flex flex-col shadow-sm">
    <div className="flex items-center gap-2 mb-1.5">
      <div className={`w-5 h-5 rounded-md flex items-center justify-center ${iconBg}`}>
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
  </div>
);
