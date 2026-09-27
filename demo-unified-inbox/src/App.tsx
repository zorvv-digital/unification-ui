import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import WhatsApp from './pages/WhatsApp';
import Instagram from './pages/Instagram';
import Messenger from './pages/Messenger';
import UnifiedInbox from './pages/UnifiedInbox';
import { MessagingProvider } from './context/MessagingContext';

function App() {
  return (
    <MessagingProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/whatsapp" element={<WhatsApp />} />
          <Route path="/instagram" element={<Instagram />} />
          <Route path="/messenger" element={<Messenger />} />
          <Route path="/inbox" element={<UnifiedInbox />} />
        </Routes>
      </BrowserRouter>
    </MessagingProvider>
  );
}

export default App;
