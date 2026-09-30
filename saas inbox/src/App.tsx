import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MessagingProvider } from './context/MessagingContext';
import WhatsApp from './pages/WhatsApp';
import Instagram from './pages/Instagram';
import Messenger from './pages/Messenger';
import UnifiedInbox from './pages/UnifiedInbox';
import AIPlayground from './pages/AIPlayground';
import Login from './pages/Login';
import Contacts from './pages/Contacts';

function App() {
  return (
    <MessagingProvider>
      <Router>
        <Routes>
          <Route path="/inbox" element={<UnifiedInbox />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/instagram" element={<Instagram />} />
          <Route path="/messenger" element={<Messenger />} />
          <Route path="/ai-playground" element={<AIPlayground />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </Router>
    </MessagingProvider>
  );
}

export default App;
