import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, CheckCheck, Globe, Send } from 'lucide-react';
import { FaFacebookMessenger, FaInstagram, FaWhatsapp } from 'react-icons/fa';
import { SiGmail } from 'react-icons/si';
import {
  apiUrl, clearSession, customerApi, loadSession, SessionExpired,
  type CustomerMessage, type CustomerPlatform, type CustomerSession,
} from '../services/customerApi';

// The demo customer app: a phone where a prospect chats with the demo business from the customer's side.
// Messages go to the demo inbox like real ones; staff and AI replies come back live.

type ChatPlatform = Exclude<CustomerPlatform, 'gmail'>;

const APPS: { id: CustomerPlatform; label: string; icon: ReactNode; tile: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', icon: <FaWhatsapp size={30} />, tile: 'bg-[#25D366]' },
  { id: 'instagram', label: 'Instagram', icon: <FaInstagram size={30} />, tile: 'bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5]' },
  { id: 'messenger', label: 'Messenger', icon: <FaFacebookMessenger size={30} />, tile: 'bg-gradient-to-tr from-[#0695ff] to-[#a334fa]' },
  { id: 'gmail', label: 'Gmail', icon: <SiGmail size={28} className="text-[#ea4335]" />, tile: 'bg-white' },
];

// Only what differs between the chat apps; the layout is shared.
const SKINS: Record<ChatPlatform, {
  header: string; subtitle: string; body: string; footer?: string; mine: string; theirs: string; avatar: string; input: string; send: string;
}> = {
  whatsapp: {
    header: 'bg-[#008069] text-white', subtitle: 'online', body: 'bg-[#efeae2]', footer: 'bg-[#f0f2f5]',
    mine: 'bg-[#d9fdd3] text-[#111b21] rounded-lg rounded-tr-none', theirs: 'bg-white text-[#111b21] rounded-lg rounded-tl-none',
    avatar: 'bg-[#dfe5e7] text-[#54656f]', input: 'bg-white rounded-full', send: 'bg-[#00a884] text-white rounded-full',
  },
  instagram: {
    header: 'bg-white text-gray-900 border-b border-gray-200', subtitle: 'Business account', body: 'bg-white',
    mine: 'bg-[#3797f0] text-white rounded-3xl', theirs: 'bg-[#efefef] text-gray-900 rounded-3xl',
    avatar: 'bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white', input: 'border border-gray-300 rounded-full',
    send: 'text-[#0095f6] font-semibold',
  },
  messenger: {
    header: 'bg-white text-gray-900 shadow-sm', subtitle: 'Active now', body: 'bg-white',
    mine: 'bg-[#0a7cff] text-white rounded-3xl', theirs: 'bg-[#f0f0f0] text-gray-900 rounded-3xl',
    avatar: 'bg-gradient-to-tr from-[#0695ff] to-[#a334fa] text-white', input: 'bg-[#f0f2f5] rounded-full', send: 'text-[#0a7cff]',
  },
};

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

export default function CustomerApp() {
  const [business, setBusiness] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(apiUrl() ? null : 'The customer app needs the backend: set VITE_API_URL in .env.local.');
  const [session, setSession] = useState<CustomerSession | null>(loadSession);
  const [messages, setMessages] = useState<CustomerMessage[]>([]);
  const [open, setOpen] = useState<CustomerPlatform | null>(null);
  const [unread, setUnread] = useState<Partial<Record<CustomerPlatform, number>>>({});
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    if (!apiUrl()) return;
    customerApi.config().then(c => setBusiness(c.business_name)).catch(() => setFatal('The customer app is only available in demo mode.'));
  }, []);

  const expire = (err: unknown) => {
    if (err instanceof SessionExpired) {
      setSession(null);
      setMessages([]);
      setOpen(null);
    }
  };

  useEffect(() => {
    if (!session) return;
    const token = session.customer_token;
    customerApi.history(token).then(setMessages).catch(expire);
    const source = customerApi.events(
      token,
      message => {
        setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
        if (message.direction === 'outbound' && message.platform !== openRef.current) {
          setUnread(prev => ({ ...prev, [message.platform]: (prev[message.platform] ?? 0) + 1 }));
        }
      },
      platform => setMessages(prev => prev.map(m => (m.platform === platform && m.direction === 'inbound' ? { ...m, status: 'read' } : m))),
    );
    return () => source.close();
  }, [session]);

  const openApp = (platform: CustomerPlatform) => {
    setOpen(platform);
    setUnread(prev => ({ ...prev, [platform]: 0 }));
  };

  const send = async (content: string, subject?: string) => {
    if (!session || !open) return;
    const message = await customerApi.send(session.customer_token, open, content, subject).catch(err => { expire(err); throw err; });
    setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
  };

  const thread = messages.filter(m => m.platform === open);
  let screen: ReactNode;
  if (fatal) screen = <Notice text={fatal} />;
  else if (!business) screen = <Notice text="Loading…" />;
  else if (!session) screen = <NameStep business={business} onStart={s => setSession(s)} />;
  else if (!open) screen = <Home business={business} name={session.name} unread={unread} onOpen={openApp} onLeave={() => { clearSession(); setSession(null); setMessages([]); }} />;
  else if (open === 'gmail') screen = <GmailThread business={business} name={session.name} messages={thread} onBack={() => setOpen(null)} onSend={send} />;
  else screen = <ChatThread platform={open} business={business} messages={thread} onBack={() => setOpen(null)} onSend={send} />;

  return (
    <div className="min-h-screen bg-gray-100 sm:flex sm:items-center sm:justify-center sm:py-8">
      <div className="h-[100dvh] sm:h-[780px] w-full sm:w-[390px] bg-white sm:rounded-[2.5rem] sm:border-[10px] sm:border-gray-900 sm:shadow-2xl overflow-hidden flex flex-col">
        {screen}
      </div>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return <div className="flex-1 flex items-center justify-center p-8 text-center text-sm text-gray-600">{text}</div>;
}

function NameStep({ business, onStart }: { business: string; onStart: (s: CustomerSession) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      onStart(await customerApi.start(name.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start');
    }
  };
  return (
    <form onSubmit={start} className="flex-1 flex flex-col justify-center gap-4 p-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">Customer view</p>
        <h1 className="text-2xl font-semibold text-gray-900 mt-1">Chat with {business}</h1>
        <p className="text-sm text-gray-600 mt-2">You're the customer. Your messages go to the business's inbox, and their replies come back here.</p>
      </div>
      <input aria-label="Your name" value={name} onChange={e => setName(e.target.value)} maxLength={60} autoFocus
        placeholder="Your name" className="border border-gray-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-gray-900" />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={!name.trim()} className="bg-gray-900 text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40">
        Start chatting
      </button>
    </form>
  );
}

function Home({ business, name, unread, onOpen, onLeave }: {
  business: string; name: string; unread: Partial<Record<CustomerPlatform, number>>;
  onOpen: (p: CustomerPlatform) => void; onLeave: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col bg-gradient-to-b from-slate-700 to-slate-900 text-white p-6">
      <p className="text-center text-5xl font-light mt-8">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      <p className="text-center text-sm text-white/70 mt-2">Message {business} as {name}</p>
      <div className="grid grid-cols-4 gap-y-6 mt-auto mb-10">
        {APPS.map(app => (
          <button key={app.id} aria-label={`Open ${app.label}`} onClick={() => onOpen(app.id)} className="flex flex-col items-center gap-1.5">
            <span className={`relative w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow ${app.tile}`}>
              {app.icon}
              {!!unread[app.id] && (
                <span aria-label={`${unread[app.id]} new in ${app.label}`} className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-[11px] font-semibold flex items-center justify-center">
                  {unread[app.id]}
                </span>
              )}
            </span>
            <span className="text-xs">{app.label}</span>
          </button>
        ))}
        <a aria-label="Open website chat" href={`${apiUrl()}/widget/demo`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5">
          <span className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white text-gray-900 shadow"><Globe size={28} /></span>
          <span className="text-xs">Website</span>
        </a>
      </div>
      <button onClick={onLeave} className="text-xs text-white/60 hover:text-white self-center">Not {name}? Start over</button>
    </div>
  );
}

function useAutoScroll(count: number) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight }); }, [count]);
  return ref;
}

function Composer({ className, sendClass, sendLabel, placeholder, footer = '', onSend }: {
  className: string; footer?: string; sendClass: string; sendLabel: ReactNode; placeholder: string; onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await onSend(text.trim());
      setText('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not sent');
    }
  };
  return (
    <form onSubmit={submit} className={`p-2 flex flex-col gap-1 ${footer}`}>
      {error && <p role="alert" className="text-xs text-red-600 px-2">{error}</p>}
      <div className="flex items-center gap-2">
        <input aria-label="Message" value={text} onChange={e => setText(e.target.value)} placeholder={placeholder}
          className={`flex-1 px-4 py-2.5 text-sm focus:outline-none ${className}`} />
        <button type="submit" aria-label="Send" className={`shrink-0 h-10 min-w-10 px-2 flex items-center justify-center ${sendClass}`}>{sendLabel}</button>
      </div>
    </form>
  );
}

function ChatThread({ platform, business, messages, onBack, onSend }: {
  platform: ChatPlatform; business: string; messages: CustomerMessage[]; onBack: () => void; onSend: (text: string) => Promise<void>;
}) {
  const skin = SKINS[platform];
  const scroller = useAutoScroll(messages.length);
  const lastMine = [...messages].reverse().find(m => m.direction === 'inbound');
  return (
    <>
      <header className={`flex items-center gap-3 px-3 py-3 ${skin.header}`}>
        <button aria-label="Back" onClick={onBack}><ArrowLeft size={22} /></button>
        <span className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold ${skin.avatar}`}>{initial(business)}</span>
        <div className="min-w-0">
          <p className="font-semibold text-[15px] truncate">{business}</p>
          <p className="text-xs opacity-75">{skin.subtitle}</p>
        </div>
      </header>
      <div ref={scroller} aria-label={`${platform} chat`} className={`flex-1 overflow-y-auto px-3 py-4 space-y-1.5 ${skin.body}`}>
        {messages.length === 0 && <p className="text-center text-xs text-gray-500 mt-6">Say hi to {business}.</p>}
        {messages.map(m => {
          const mine = m.direction === 'inbound';
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[80%] px-3 py-1.5 text-sm whitespace-pre-wrap shadow-sm ${mine ? skin.mine : skin.theirs}`}>
                {m.content}
                {platform === 'whatsapp' && (
                  <span className="float-right ml-2 mt-1.5 text-[10px] text-gray-500 flex items-center gap-0.5">
                    {time(m.timestamp)}
                    {mine && (m.status === 'read'
                      ? <CheckCheck aria-label="Read" size={14} className="text-[#53bdeb]" />
                      : m.status === 'delivered' ? <CheckCheck aria-label="Delivered" size={14} /> : <Check aria-label="Sent" size={14} />)}
                  </span>
                )}
              </div>
              {platform !== 'whatsapp' && m === lastMine && m.status === 'read' && <span className="text-[11px] text-gray-500 mt-0.5 mr-2">Seen</span>}
            </div>
          );
        })}
      </div>
      <Composer className={skin.input} sendClass={skin.send} footer={skin.footer} placeholder={platform === 'messenger' ? 'Aa' : 'Message…'}
        sendLabel={platform === 'instagram' ? 'Send' : <Send size={18} />} onSend={text => onSend(text)} />
    </>
  );
}

function GmailThread({ business, name, messages, onBack, onSend }: {
  business: string; name: string; messages: CustomerMessage[]; onBack: () => void; onSend: (text: string, subject?: string) => Promise<void>;
}) {
  const [subject, setSubject] = useState('');
  const [firstSubject, setFirstSubject] = useState<string | null>(null);
  const scroller = useAutoScroll(messages.length);
  const first = messages.length === 0;
  return (
    <>
      <header className="flex items-center gap-3 px-3 py-3 border-b border-gray-200">
        <button aria-label="Back" onClick={onBack}><ArrowLeft size={22} /></button>
        <p className="font-medium text-gray-900 truncate">{first ? 'New email' : firstSubject ?? `Email with ${business}`}</p>
      </header>
      <div ref={scroller} aria-label="gmail chat" className="flex-1 overflow-y-auto divide-y divide-gray-100">
        {first && <p className="text-center text-xs text-gray-500 mt-6">Write your first email to {business}.</p>}
        {messages.map(m => {
          const mine = m.direction === 'inbound';
          return (
            <article key={m.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white ${mine ? 'bg-[#1a73e8]' : 'bg-[#ea4335]'}`}>
                  {initial(mine ? name : business)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{mine ? 'me' : business}</p>
                  <p className="text-xs text-gray-500">{mine ? `to ${business}` : 'to me'} · {time(m.timestamp)}{mine && m.status === 'read' ? ' · Read' : ''}</p>
                </div>
              </div>
              <p className="text-sm text-gray-800 whitespace-pre-wrap mt-2 ml-12">{m.content}</p>
            </article>
          );
        })}
      </div>
      {first && (
        <input aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" maxLength={200}
          className="mx-2 mt-2 px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b57d0]" />
      )}
      <Composer className="border border-gray-300 rounded-full" sendClass="bg-[#0b57d0] text-white rounded-full px-4 text-sm font-medium"
        placeholder={first ? 'Compose email' : 'Reply'} sendLabel="Send"
        onSend={async text => {
          await onSend(text, first ? subject.trim() : undefined);
          if (first) setFirstSubject(subject.trim());
        }} />
    </>
  );
}
