import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/inbox/Sidebar';
import { ConversationList } from '../components/inbox/ConversationList';
import { MessageWorkspace } from '../components/inbox/MessageWorkspace';
import { ContactPanel } from '../components/inbox/ContactPanel';


export default function UnifiedInbox() {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [showContactPanel, setShowContactPanel] = useState(false);
  
  // Track viewport for responsive design
  useEffect(() => {
    const checkViewport = () => {
      const width = window.innerWidth;
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
      // Automatically hide contact panel on tablet/mobile unless toggled
      if (width < 1024) setShowContactPanel(false);
      else setShowContactPanel(true);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  return (
    <div className="flex h-screen bg-[#F9FAFB] font-sans text-gray-900 overflow-hidden">
      {/* 
        Responsive Layout Rules:
        Mobile: Sidebar (Drawer/Hidden) -> Conv List (Full) -> Message (Full) -> Contact (Drawer)
        Tablet: Sidebar + Conv List + Message (Contact hidden by default)
        Desktop: Sidebar + Conv List + Message + Contact
      */}

      {/* Sidebar: hidden on mobile, visible on tablet+ */}
      {!isMobile && <Sidebar />}

      {/* Middle/Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* On mobile, show either list or chat. On tablet/desktop, show both */}
        {(!isMobile || !activeConversationId) && (
          <ConversationList 
            activeConversationId={activeConversationId} 
            onSelect={setActiveConversationId} 
          />
        )}

        {/* Message Workspace */}
        {(!isMobile || activeConversationId) && (
          <div className="flex-1 flex flex-col min-w-0 bg-white border-l border-gray-200/60 shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-10 rounded-tl-2xl sm:rounded-none">
            {activeConversationId ? (
              <MessageWorkspace 
                conversationId={activeConversationId} 
                onBack={() => setActiveConversationId(null)}
                onToggleContact={() => setShowContactPanel(prev => !prev)}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gray-50/50">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">Unified Inbox</h3>
                  <p className="text-gray-500 mt-2 max-w-sm">Select a conversation to start messaging across WhatsApp, Instagram, and Messenger.</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Contact Panel */}
        {showContactPanel && activeConversationId && !isMobile && (
          <ContactPanel conversationId={activeConversationId} onClose={() => setShowContactPanel(false)} />
        )}
      </div>
    </div>
  );
}
