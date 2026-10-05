import React, { useState } from 'react';
import { useMessaging } from '../context/MessagingContext';

export default function UserAdPage() {
  const { receiveMessage, conversations } = useMessaging();
  const [message, setMessage] = useState("Wow this looks amazing! 😍 Is it still available?");
  const [isSending, setIsSending] = useState(false);
  
  const handleSimulateAdClick = async () => {
    if (!message.trim()) return;
    
    try {
      setIsSending(true);
      // Always create a new lead using the customer API so it has the correct name
      const { customerApi, apiUrl, clearSession } = await import('../services/customerApi');
      if (apiUrl()) {
        clearSession();
        const session = await customerApi.start('Sarah Mitchell');
        const contentString = JSON.stringify({
          text: message,
          adContext: {
            imageUrl: '/story_dm.jpg',
            title: 'Summer Sale Promotion',
            source: 'Your Story'
          }
        });
        await customerApi.send(session.customer_token, 'instagram', contentString);
        alert('Message sent to the Instagram inbox as a new lead!');
      } else {
        alert('Backend is not connected, cannot simulate message.');
      }
    } catch (e) {
      console.error(e);
      alert('Failed to simulate message: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsSending(false);
      setMessage(''); // Clear after sending
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
        <h1 className="text-3xl font-bold mb-4 text-gray-900">Instagram Story Reply</h1>
        <p className="text-gray-600 mb-6">
          Type a message to simulate a client who saw your story and decided to reply.
        </p>
        
        <div className="mb-6 text-left">
          <label className="block text-sm font-medium text-gray-700 mb-2">Message Content</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#833ab4] focus:border-transparent resize-none h-32 text-gray-800"
            placeholder="Type what the customer should say..."
          ></textarea>
        </div>

        <button
          onClick={handleSimulateAdClick}
          disabled={!message.trim() || isSending}
          className="bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] hover:opacity-90 disabled:opacity-50 text-white font-semibold py-3 px-8 rounded-full shadow-lg transition-all transform hover:scale-105 disabled:hover:scale-100 w-full flex items-center justify-center gap-2"
        >
          {isSending ? 'Sending...' : 'Send Story Reply'}
        </button>
      </div>
    </div>
  );
}

