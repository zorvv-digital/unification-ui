import React from 'react';

export type FilterType = 'all' | 'whatsapp' | 'instagram' | 'messenger' | 'gmail' | 'website' | 'unread' | 'needs-human' | 'assigned';
export type SortType = 'latest' | 'oldest' | 'unread-first';

interface FilterBarProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  activeSort: SortType;
  onSortChange: (sort: SortType) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({ 
  activeFilter, 
  onFilterChange,
  activeSort,
  onSortChange
}) => {
  const filters: { id: FilterType; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'messenger', label: 'Messenger' },
    { id: 'gmail', label: 'Gmail' },
    { id: 'website', label: 'Website' },
    { id: 'unread', label: 'Unread' },
    { id: 'needs-human', label: 'Needs human' },
    { id: 'assigned', label: 'Assigned to me' },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-brand-border)] shrink-0 gap-4">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {filters.map(f => (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className={`
              px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors
              ${activeFilter === f.id 
                ? 'bg-[var(--color-brand-text)] text-white' 
                : 'bg-white border border-gray-300 text-[var(--color-brand-text-secondary)] hover:bg-gray-50'
              }
            `}
          >
            {f.label}
          </button>
        ))}
      </div>
      
      <div className="shrink-0 flex items-center">
        <select 
          value={activeSort}
          onChange={(e) => onSortChange(e.target.value as SortType)}
          className="text-xs font-medium text-[var(--color-brand-text-secondary)] bg-transparent border-none outline-none cursor-pointer hover:text-[var(--color-brand-text)] transition-colors"
          aria-label="Sort conversations"
        >
          <option value="latest">Latest</option>
          <option value="oldest">Oldest</option>
          <option value="unread-first">Unread First</option>
        </select>
      </div>
    </div>
  );
};
