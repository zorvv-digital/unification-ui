import React from 'react';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
};

export const Avatar: React.FC<AvatarProps> = ({ src, alt, size = 'md', className = '' }) => {
  return (
    <div className={`relative inline-block rounded-full overflow-hidden bg-gray-200 shrink-0 ${sizeClasses[size]} ${className}`}>
      {src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-300 text-gray-500 font-medium">
          {alt.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
};
