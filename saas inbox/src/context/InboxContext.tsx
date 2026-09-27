import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Message } from '../types/inbox';
import { mockGmailMessages } from '../data/inboxMockData';

interface InboxContextType {
  messages: Message[];
  addMessage: (message: Message) => void;
}

const InboxContext = createContext<InboxContextType | undefined>(undefined);

export const InboxProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<Message[]>(mockGmailMessages);

  const addMessage = (message: Message) => {
    setMessages((prevMessages) => [message, ...prevMessages]);
  };

  return (
    <InboxContext.Provider value={{ messages, addMessage }}>
      {children}
    </InboxContext.Provider>
  );
};

export const useInbox = () => {
  const context = useContext(InboxContext);
  if (!context) {
    throw new Error('useInbox must be used within an InboxProvider');
  }
  return context;
};
