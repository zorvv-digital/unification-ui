import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MessagingProvider } from './context/MessagingContext';
import WhatsApp from './pages/WhatsApp';
import Instagram from './pages/Instagram';
import Messenger from './pages/Messenger';
import UnifiedInbox from './pages/UnifiedInbox';
import AIPlayground from './pages/AIPlayground';
import Login from './pages/Login';
import Contacts from './pages/Contacts';
import CustomerApp from './pages/CustomerApp';
import UserAdPage from './pages/UserAdPage';

function App() {
  // The demo customer app is public: no staff login, so it stays outside the inbox's provider.
  if (window.location.pathname.startsWith('/phone')) return <CustomerApp />;
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
          <Route path="/user" element={<UserAdPage />} />
          <Route path="/" element={<Navigate to="/inbox" replace />} />
        </Routes>
      </Router>
    </MessagingProvider>
  );
}

export default App;
