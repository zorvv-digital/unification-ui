import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, MessageSquare } from 'lucide-react';

const InstagramIcon = ({ size, className }: { size: number, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-center mb-4 text-gray-900">Messaging Interface Demo</h1>
        <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
          Explore three distinct, high-fidelity messaging interfaces built with React and Tailwind CSS.
          Select a platform to experience the demo.
        </p>
        
        <div className="grid md:grid-cols-3 gap-6">
          <Link to="/whatsapp" className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all border border-gray-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#25D366]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <MessageCircle size={32} className="text-[#25D366]" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">WhatsApp</h2>
            <p className="text-gray-500 mb-6">Classic two-panel layout, solid color bubbles, and a structured sidebar.</p>
            <span className="mt-auto px-6 py-2 bg-[#25D366] text-white rounded-full font-medium hover:bg-[#20b858] transition-colors w-full">
              Open WhatsApp
            </span>
          </Link>

          <Link to="/instagram" className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all border border-gray-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-gradient-to-tr from-[#f09433] via-[#e6683c] to-[#bc1888] rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <InstagramIcon size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Instagram</h2>
            <p className="text-gray-500 mb-6">Minimal, modern design with rounded bubbles and clean aesthetics.</p>
            <span className="mt-auto px-6 py-2 bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white rounded-full font-medium hover:opacity-90 transition-opacity w-full">
              Open Instagram
            </span>
          </Link>

          <Link to="/messenger" className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all border border-gray-100 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-[#0084FF]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <MessageSquare size={32} className="text-[#0084FF]" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Messenger</h2>
            <p className="text-gray-500 mb-6">Bright blue gradients, spacious layout, and dynamic interactions.</p>
            <span className="mt-auto px-6 py-2 bg-[#0084FF] text-white rounded-full font-medium hover:bg-[#0073e6] transition-colors w-full">
              Open Messenger
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
