import React from 'react';
import { Smile, ThumbsUp, Heart, Star, Laugh, Frown } from 'lucide-react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const emojis = ['😀', '😂', '😍', '👍', '❤️', '🔥', '🎉', '😢'];

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  return (
    <div className="absolute bottom-full mb-2 right-0 bg-white dark:bg-gray-800 shadow-xl rounded-lg p-2 flex gap-2 border border-gray-200 dark:border-gray-700 z-50">
      {emojis.map(e => (
        <button
          key={e}
          onClick={() => {
            onSelect(e);
            onClose();
          }}
          className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded transition-colors"
          type="button"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
