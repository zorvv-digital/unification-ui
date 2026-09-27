import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { MessagingProvider } from './context/MessagingContext';
import { InboxProvider } from './context/InboxContext';
import WhatsApp from './pages/WhatsApp';
import Instagram from './pages/Instagram';
import Messenger from './pages/Messenger';
import UnifiedInbox from './pages/UnifiedInbox';
import AIPlayground from './pages/AIPlayground';

function App() {
  return (
    <MessagingProvider>
      <InboxProvider>
        <Router>
          <Routes>
            <Route path="/inbox" element={<UnifiedInbox />} />
            <Route path="/whatsapp" element={<WhatsApp />} />
            <Route path="/instagram" element={<Instagram />} />
            <Route path="/messenger" element={<Messenger />} />
            <Route path="/ai-playground" element={<AIPlayground />} />
            <Route path="/" element={
              <div className="min-h-screen bg-[var(--color-brand-surface)] text-[var(--color-brand-text)] flex flex-col items-center justify-center p-4">
                <div className="text-center mb-8">
                  <h1 className="text-3xl font-semibold mb-2">Unification UI</h1>
                  <p className="text-[var(--color-brand-text-secondary)]">Phase 7: Final Demo Polish</p>
                </div>
                <div className="flex gap-4 flex-wrap justify-center">
                  <Link to="/inbox" className="px-6 py-3 bg-gray-900 text-white rounded-lg font-medium shadow hover:opacity-90">SaaS Inbox</Link>
                  <Link to="/whatsapp" className="px-6 py-3 bg-[#25D366] text-white rounded-lg font-medium shadow hover:opacity-90">WhatsApp</Link>
                  <Link to="/instagram" className="px-6 py-3 bg-gradient-to-tr from-[#fd5949] to-[#d6249f] text-white rounded-lg font-medium shadow hover:opacity-90">Instagram</Link>
                  <Link to="/messenger" className="px-6 py-3 bg-[#0084FF] text-white rounded-lg font-medium shadow hover:opacity-90">Messenger</Link>
                </div>
              </div>
            } />
          </Routes>
        </Router>
      </InboxProvider>
    </MessagingProvider>
  );
}

export default App;
