import React from 'react';
import { Layers, MessageSquare, Users, BarChart3, Settings, HelpCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { Avatar } from '../messaging/Avatar';

export const Sidebar: React.FC = () => {
  return (
    <div className="w-[240px] bg-[#F9FAFB] border-r border-gray-200/80 flex flex-col justify-between py-4 shrink-0 h-full">
      
      {/* Brand */}
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center shadow-sm">
          <Layers className="text-white w-4 h-4" />
        </div>
        <span className="font-semibold text-[15px] tracking-tight">Unified</span>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-3 flex flex-col gap-6 overflow-y-auto no-scrollbar">
        
        {/* Main Section */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Main</div>
          <div className="flex flex-col gap-1">
            <NavItem icon={<MessageSquare size={18} />} label="Inbox" badge="14" active />
            <NavItem icon={<Users size={18} />} label="Contacts" />
          </div>
        </div>

        {/* Workspace Section */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Workspace</div>
          <div className="flex flex-col gap-1">
            <NavItem icon={<BarChart3 size={18} />} label="Analytics" />
            <NavItem icon={<Settings size={18} />} label="Settings" />
          </div>
        </div>

      </div>

      {/* Bottom Actions */}
      <div className="px-3 pt-4 border-t border-gray-200/60 mt-auto flex flex-col gap-1">
        <NavItem icon={<HelpCircle size={18} />} label="Help & Docs" />
        
        <div className="mt-2 p-2 flex items-center gap-3 hover:bg-gray-100 rounded-xl cursor-pointer transition-colors">
          <Avatar src="https://i.pravatar.cc/150?u=me" alt="User" size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-gray-900 truncate">Alex Developer</div>
            <div className="text-[11px] text-gray-500 truncate">Workspace Admin</div>
          </div>
        </div>
      </div>

    </div>
  );
};

function NavItem({ icon, label, badge, active }: { icon: React.ReactNode, label: string, badge?: string, active?: boolean }) {
  return (
    <button className={clsx(
      "w-full flex items-center px-3 py-2 rounded-xl text-[14px] font-medium transition-all group",
      active ? "bg-white shadow-sm text-black border border-gray-200/50" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900 border border-transparent"
    )}>
      <span className={clsx("mr-3", active ? "text-blue-500" : "text-gray-400 group-hover:text-gray-600")}>
        {icon}
      </span>
      {label}
      {badge && (
        <span className={clsx(
          "ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full",
          active ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"
        )}>
          {badge}
        </span>
      )}
    </button>
  );
}
