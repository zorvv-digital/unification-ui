import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface AvatarProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  online?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
};

export function Avatar({ src, alt, size = 'md', online, className }: AvatarProps) {
  return (
    <div className={twMerge('relative inline-block shrink-0', className)}>
      <img 
        src={src} 
        alt={alt} 
        className={twMerge('rounded-full object-cover', sizeClasses[size])} 
      />
      {online && (
        <span className="absolute bottom-0 right-0 block w-3 h-3 rounded-full bg-green-500 ring-2 ring-white" />
      )}
    </div>
  );
}
