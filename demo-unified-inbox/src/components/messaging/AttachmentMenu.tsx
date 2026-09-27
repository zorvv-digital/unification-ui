import React from 'react';
import { Image, FileText, MapPin, Camera } from 'lucide-react';

interface AttachmentMenuProps {
  onSelect: (type: string) => void;
  onClose: () => void;
}

const attachments = [
  { id: 'photo', label: 'Photo & Video', icon: Image, color: 'text-blue-500' },
  { id: 'camera', label: 'Camera', icon: Camera, color: 'text-pink-500' },
  { id: 'document', label: 'Document', icon: FileText, color: 'text-purple-500' },
  { id: 'location', label: 'Location', icon: MapPin, color: 'text-green-500' },
];

export function AttachmentMenu({ onSelect, onClose }: AttachmentMenuProps) {
  return (
    <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-gray-800 shadow-xl rounded-2xl py-2 w-48 border border-gray-200 dark:border-gray-700 z-50">
      {attachments.map(item => (
        <button
          key={item.id}
          onClick={() => {
            onSelect(item.id);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
          type="button"
        >
          <item.icon className={item.color} size={20} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
