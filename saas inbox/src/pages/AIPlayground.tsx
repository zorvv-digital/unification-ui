import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Sidebar } from '../components/inbox/Sidebar';
import { Header } from '../components/inbox/Header';
import { ArrowLeft, Phone, Video, MoreVertical, Send, Bot, Plus, Book, ChevronRight, X, Mail, FileText, Settings, Briefcase } from 'lucide-react';
import { FaWhatsapp, FaDesktop } from 'react-icons/fa';
import { SiShopify, SiGmail, SiGoogledrive, SiGithub } from 'react-icons/si';
import { RotateCcw } from 'lucide-react';
import { apiService } from '../context/MessagingContext';
import { aiApi, type Agent, type AgentSummary, type AgentVersion, type KnowledgeItem } from '../services/aiApi';
import { AgentBuilderModal } from '../components/playground/AgentBuilderModal';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
}

export default function AIPlayground() {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isConnectorsModalOpen, setIsConnectorsModalOpen] = useState(false);

  // Modal state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  // Settings state
  const [instructions, setInstructions] = useState('');

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hi! I am your AI chatbot. Test your prompts and workflows here.',
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Live agent (API mode) ---
  const live = !!apiService;
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [testVersion, setTestVersion] = useState<number | undefined>();
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [feedback, setFeedback] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [newSkill, setNewSkill] = useState<{ title: string; category: string; content: string } | null>(null);

  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const startChat = (greeting: string) => {
    setSessionId(undefined);
    setMessages([{ id: 'greeting', text: greeting, isUser: false, timestamp: now() }]);
  };

  const loadAgent = useCallback(async (id: string, keepChat = false) => {
    const [a, v, k] = await Promise.all([aiApi.getAgent(id), aiApi.listVersions(id), aiApi.listKnowledge()]);
    setAgent(a);
    setVersions(v);
    setKnowledge(k);
    setInstructions(a.active_version.system_prompt);
    if (!keepChat) {
      setTestVersion(undefined);
      setSessionId(undefined);
      setMessages([{
        id: 'greeting',
        text: a.active_version.greeting_message,
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }]);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    aiApi.listAgents().then(list => {
      setAgents(list);
      if (list.length) loadAgent(list[0].id);
      else setIsBuilderOpen(true);
    }).catch(err => setNotice(err.message));
  }, [live, loadAgent]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice('');
    try {
      await fn();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const saveInstructions = () => act(async () => {
    if (!agent) return;
    const version = await aiApi.saveVersion(agent.id, { system_prompt: instructions });
    await loadAgent(agent.id, true);
    setTestVersion(undefined);
    setNotice(`Saved as v${version.version_number}. It is now live.`);
  });

  const createDraft = () => act(async () => {
    if (!agent || !feedback.trim()) return;
    const draft = await aiApi.refine(agent.id, feedback.trim());
    await loadAgent(agent.id, true);
    setFeedback('');
    setTestVersion(draft.version_number);
    startChat(agent.active_version.greeting_message);
    setNotice(`Draft v${draft.version_number} is ready. You are now testing it; activate it when you are happy.`);
  });

  const activateVersion = (versionNumber: number) => act(async () => {
    if (!agent) return;
    await aiApi.activate(agent.id, versionNumber);
    await loadAgent(agent.id, true);
    setTestVersion(undefined);
    setNotice(`v${versionNumber} is now live.`);
  });

  const toggleAttached = (item: KnowledgeItem) => act(async () => {
    if (!agent) return;
    if (agent.knowledge_ids.includes(item.id)) await aiApi.detach(agent.id, item.id);
    else await aiApi.attach(agent.id, item.id);
    await loadAgent(agent.id, true);
  });

  const toggleEnabled = (item: KnowledgeItem) => act(async () => {
    await aiApi.updateKnowledge(item.id, { enabled: !item.enabled });
    if (agent) await loadAgent(agent.id, true);
  });

  const createSkill = () => act(async () => {
    if (!agent || !newSkill) return;
    const item = await aiApi.createKnowledge({ ...newSkill, description: '' });
    await aiApi.attach(agent.id, item.id);
    await loadAgent(agent.id, true);
    setNewSkill(null);
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!inputText.trim()) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInputText('');
    setIsTyping(true);

    if (live && agent) {
      const reply = (text: string) =>
        setMessages(prev => [...prev, { id: `${Date.now()}-bot`, text, isUser: false, timestamp: now() }]);
      aiApi.chat(agent.id, newUserMessage.text, sessionId, testVersion)
        .then(res => { setSessionId(res.session_id); reply(res.reply); })
        .catch(err => reply(`⚠️ ${err instanceof Error ? err.message : 'The AI could not answer'}`))
        .finally(() => setIsTyping(false));
      return;
    }

    setTimeout(() => {
      const botResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: `AI simulated reply to: "${newUserMessage.text}"`,
        isUser: false,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const connectedConnectors = [
    { id: 1, name: 'Knowledge Base', icon: Book, color: 'text-purple-600', bg: 'bg-purple-100', category: 'Docs' },
    { id: 2, name: 'Shopify', icon: SiShopify, color: 'text-[#96bf48]', bg: 'bg-[#96bf48]/20', category: 'E-commerce' },
  ];

  const popularConnectors = [
    { id: 3, name: 'Gmail', desc: 'Read and manage Gmail', icon: SiGmail, color: 'text-[#EA4335]', bg: 'bg-[#EA4335]/20', category: 'Email' },
    { id: 4, name: 'Google Drive', desc: 'Drive, Docs, Sheets or Slides', icon: SiGoogledrive, color: 'text-[#4285F4]', bg: 'bg-[#4285F4]/20', category: 'Storage' },
    { id: 5, name: 'Outlook Email', desc: 'Triage Outlook inboxes', icon: Mail, color: 'text-[#0078D4]', bg: 'bg-[#0078D4]/20', category: 'Email' },
    { id: 6, name: 'Remote Desktop', desc: 'Build and automate, anywhere', icon: FaDesktop, color: 'text-gray-700', bg: 'bg-gray-200', category: 'IT' },
    { id: 7, name: 'GitHub', desc: 'Triage PRs, issues, CI, and publish flows', icon: SiGithub, color: 'text-gray-900', bg: 'bg-gray-200', category: 'Dev' },
  ];

  const mockSkills = [
    { id: 101, name: 'About Us', desc: 'Company history, mission, and team.', content: 'Our company was founded in 2024 to revolutionize...', icon: Briefcase, color: 'text-indigo-600', bg: 'bg-indigo-100', category: 'General' },
    { id: 102, name: 'Brand Tone', desc: 'Guidelines for professional yet friendly tone.', content: 'Always reply warmly and avoid jargon.', icon: FileText, color: 'text-rose-600', bg: 'bg-rose-100', category: 'Formatting' },
    { id: 103, name: 'Pricing Plans', desc: 'Current subscription tiers.', content: 'Basic: $10/mo. Pro: $30/mo. Enterprise: Custom.', icon: Settings, color: 'text-emerald-600', bg: 'bg-emerald-100', category: 'Sales' }
  ];

  const categories = ['All', 'Email', 'Storage', 'CRM', 'Chat', 'Finance', 'Dev', 'IT', 'General', 'Formatting', 'Sales'];

  const filteredPopular = useMemo(() => {
    return popularConnectors.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === 'All' || c.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  const filteredSkills = useMemo(() => {
    return mockSkills.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) || c.desc.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = activeCategory === 'All' || c.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, activeCategory]);

  return (
    <div className="h-screen w-full flex bg-[var(--color-brand-surface)] text-[var(--color-brand-text)] font-sans overflow-hidden">

      {/* 1. Sidebar */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <Header
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          showMobileMenu={true}
          searchQuery={""}
          onSearchChange={() => {}}
        />

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

          {/* Main Area: Mobile Chat Mockup */}
          <div className="flex-1 bg-gray-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-[360px] h-[640px] bg-white rounded-[32px] overflow-hidden shadow-2xl flex flex-col border-[8px] border-gray-900 relative">
              {/* WhatsApp Mobile Header */}
              <div className="bg-[#075e54] text-white p-3 flex items-center gap-2 shrink-0">
                <button className="flex items-center">
                  <ArrowLeft size={20} />
                </button>
                <div className="w-9 h-9 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden shrink-0">
                  <div className="bg-green-500 w-full h-full flex items-center justify-center">
                    <FaWhatsapp size={20} className="text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-sm">{agent?.name ?? 'AI Chatbot'}</div>
                  <div className="text-[10px] text-green-100 truncate">
                    {isTyping ? 'typing...' : testVersion ? `testing draft v${testVersion}` : 'online'}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-white">
                  <Video size={18} />
                  <Phone size={18} />
                  <MoreVertical size={18} />
                </div>
              </div>

              {/* Chat Background */}
              <div
                className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 bg-[#efeae2]"
                style={{ backgroundImage: 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")', backgroundSize: 'cover' }}
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`max-w-[85%] flex flex-col ${msg.isUser ? 'self-end' : 'self-start'}`}
                  >
                    <div
                      className={`px-3 py-1.5 rounded-lg relative text-[14px] leading-snug shadow-sm ${
                        msg.isUser
                          ? 'bg-[#d9fdd3] rounded-tr-none text-gray-800'
                          : 'bg-white rounded-tl-none text-gray-800'
                      }`}
                    >
                      <div className="whitespace-pre-line">{msg.text}</div>
                      <div className="text-[10px] text-gray-500 text-right mt-1 flex justify-end items-center gap-1">
                        {msg.timestamp}
                        {msg.isUser && (
                          <span className="text-blue-500">✓✓</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="self-start max-w-[85%] px-3 py-2 rounded-lg bg-white rounded-tl-none shadow-sm flex gap-1 items-center h-8">
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="bg-[#f0f2f5] p-2 flex items-end gap-2 shrink-0">
                <div className="flex-1 bg-white rounded-3xl flex items-center px-4 py-1.5 min-h-[40px] shadow-sm">
                  <input
                    type="text"
                    placeholder="Message"
                    className="flex-1 outline-none bg-transparent text-sm"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                  />
                </div>
                <button
                  className="w-[40px] h-[40px] bg-[#00a884] rounded-full flex items-center justify-center text-white shrink-0 shadow-sm"
                  onClick={handleSend}
                >
                  <Send size={18} className="ml-0.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Menu for Connectors */}
          <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-[var(--color-brand-border)] bg-white overflow-y-auto">
            <div className="p-4 border-b border-[var(--color-brand-border)]">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Bot className="text-blue-600" size={20} />
                AI Configuration
              </h2>
            </div>

            {live && (
              <div className="p-4 border-b border-[var(--color-brand-border)] space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <select
                    aria-label="Agent"
                    className="min-w-0 flex-1 text-sm font-semibold text-gray-900 bg-transparent focus:outline-none truncate"
                    value={agent?.id ?? ''}
                    onChange={e => loadAgent(e.target.value)}
                  >
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <button onClick={() => setIsBuilderOpen(true)} className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors shrink-0">
                    <Plus size={16} /> New agent
                  </button>
                </div>
                {agent && (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label="Testing version"
                      className="flex-1 p-2 rounded-xl border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={testVersion ?? agent.active_version_number}
                      onChange={e => {
                        const n = Number(e.target.value);
                        setTestVersion(n === agent.active_version_number ? undefined : n);
                        startChat(agent.active_version.greeting_message);
                      }}
                    >
                      {versions.map(v => (
                        <option key={v.id} value={v.version_number}>
                          Testing v{v.version_number} · {v.is_active ? 'live' : v.source === 'feedback' ? 'draft' : v.source}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => startChat(agent.active_version.greeting_message)}
                      title="New chat" aria-label="New chat"
                      className="p-2 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                    >
                      <RotateCcw size={16} />
                    </button>
                  </div>
                )}
                {notice && <p role="status" className="text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2">{notice}</p>}
              </div>
            )}

            <div className="p-4 border-b border-[var(--color-brand-border)]">
              <div
                className="p-4 rounded-2xl flex items-center justify-between cursor-pointer group/connectors bg-gradient-to-br from-white to-gray-50 border border-gray-200 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_12px_-4px_rgba(0,0,0,0.12)] hover:border-blue-100 transition-all duration-300"
                onClick={() => setIsConnectorsModalOpen(true)}
              >
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Connectors and skills</h3>
                  </div>
                  <div className="flex items-center">
                    {connectedConnectors.map((connector, index) => {
                      const Icon = connector.icon;
                      return (
                        <div
                          key={connector.id}
                          className={`w-9 h-9 rounded-full flex items-center justify-center border-[2px] border-white ${connector.bg} ${connector.color} ${index > 0 ? '-ml-3' : ''} shadow-sm relative z-[${10 - index}] transition-transform duration-300 group-hover/connectors:-translate-y-1`}
                          title={connector.name}
                          style={{ zIndex: 10 - index }}
                        >
                          <Icon size={16} />
                        </div>
                      );
                    })}
                    <div className="text-xs font-medium text-gray-500 ml-3 group-hover/connectors:text-blue-600 transition-colors">
                      {connectedConnectors.length} active
                    </div>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-50 group-hover/connectors:bg-blue-50 flex items-center justify-center transition-colors">
                  <ChevronRight size={18} className="text-gray-400 group-hover/connectors:text-blue-600 transition-colors group-hover/connectors:translate-x-0.5" />
                </div>
              </div>
            </div>

            <div className="p-4 border-b border-[var(--color-brand-border)]">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Instructions</h3>
              <p className="text-xs text-gray-500 mb-3">Add custom instructions to guide the AI's behavior.</p>
              <textarea
                className="w-full h-40 p-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm text-gray-800 resize-none shadow-sm"
                placeholder="E.g., Always reply in a professional tone and summarize long threads..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
              {live && agent && (
                <button
                  onClick={saveInstructions}
                  disabled={busy || instructions === agent.active_version.system_prompt}
                  className="mt-2 w-full px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg transition-colors disabled:opacity-40"
                >
                  Save as new version
                </button>
              )}
            </div>

            {live && agent && (
              <div className="p-4 border-b border-[var(--color-brand-border)]">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Improve with feedback</h3>
                <p className="text-xs text-gray-500 mb-3">Describe what to change. The AI rewrites the instructions as a draft you can test first.</p>
                <textarea
                  aria-label="Feedback"
                  className="w-full h-20 p-3 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm text-gray-800 resize-none shadow-sm"
                  placeholder="E.g., Always mention free parking and keep replies under 3 lines."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
                <button
                  onClick={createDraft}
                  disabled={busy || !feedback.trim()}
                  className="mt-2 w-full px-4 py-2 text-sm font-medium text-gray-900 border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-40"
                >
                  {busy ? 'Working…' : 'Create draft'}
                </button>
              </div>
            )}

            {live && agent && (
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Versions</h3>
                <ul className="space-y-1.5">
                  {versions.map(v => (
                    <li key={v.id} className="flex items-center justify-between gap-2 text-sm p-2 rounded-lg hover:bg-gray-50">
                      <div className="min-w-0 truncate">
                        <span className="font-medium">v{v.version_number}</span>
                        <span className="text-xs text-gray-500 ml-2">{v.source}{v.feedback ? `: ${v.feedback}` : ''}</span>
                      </div>
                      {v.is_active ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-50 px-2 py-0.5 rounded-full shrink-0">Live</span>
                      ) : (
                        <button onClick={() => activateVersion(v.version_number)} disabled={busy} aria-label={`Activate v${v.version_number}`} className="text-xs font-medium text-blue-600 hover:text-blue-700 shrink-0">
                          Activate
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Connectors & Skills Modal */}
      {isConnectorsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-gray-200">

            {/* Modal Header & Sticky Search */}
            <div className="p-6 pb-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">Integrations Marketplace</h2>
                <button onClick={() => setIsConnectorsModalOpen(false)} className="text-gray-400 hover:text-gray-900 transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="relative mb-4">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-xl leading-5 bg-gray-50 placeholder-gray-500 focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all"
                  placeholder="Search connectors or skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                      activeCategory === cat
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-8 py-8 overflow-y-auto flex-1">
              {/* Connected Section */}
              <div className="mb-10">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-1">
                  Connected <ChevronRight size={14} className="text-gray-500" />
                </h3>
                <div className="flex gap-4">
                  {connectedConnectors.map(c => {
                    const Icon = c.icon;
                    return (
                      <div key={c.id} className={`w-14 h-14 rounded-xl flex items-center justify-center ${c.bg} ${c.color} cursor-pointer relative group/connected overflow-hidden border border-transparent hover:border-gray-200 transition-all shadow-sm hover:shadow-md`}>
                        <Icon size={28} className="group-hover/connected:opacity-10 transition-opacity duration-300" />
                        <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover/connected:opacity-100 transition-opacity duration-300">
                          <span className="text-[10px] font-bold text-gray-900 bg-white/95 px-2 py-1 rounded shadow-sm uppercase tracking-wider">Manage</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Connectors Section */}
              {filteredPopular.length > 0 && (
                <div className="mb-10">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4">Connectors</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {filteredPopular.map(c => {
                      const Icon = c.icon;
                      return (
                        <div key={c.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.bg} ${c.color} shrink-0`}>
                              <Icon size={24} />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{c.name}</div>
                              <div className="text-[13px] text-gray-500">{c.desc}</div>
                            </div>
                          </div>
                          <button className="flex items-center overflow-hidden text-gray-400 hover:text-blue-600 p-2 group-hover:bg-blue-50 rounded-lg transition-all duration-300 border border-transparent group-hover:border-blue-100">
                            <Plus size={18} className="shrink-0" />
                            <span className="w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-300 group-hover:w-[68px] group-hover:pl-1">Connect</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Skills Section: live knowledge items */}
              {live && agent && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Custom Skills</h3>
                    <button onClick={() => setNewSkill({ title: '', category: 'General', content: '' })} className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                      <Plus size={16} /> Create New
                    </button>
                  </div>
                  {newSkill && (
                    <form onSubmit={e => { e.preventDefault(); createSkill(); }} className="p-4 mb-3 rounded-xl border border-blue-200 bg-blue-50/40 space-y-2">
                      <div className="grid grid-cols-3 gap-2">
                        <input required aria-label="Skill title" placeholder="Title, e.g. Gift Vouchers" className="col-span-2 p-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={newSkill.title} onChange={e => setNewSkill({ ...newSkill, title: e.target.value })} />
                        <input aria-label="Skill category" placeholder="Category" className="p-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={newSkill.category} onChange={e => setNewSkill({ ...newSkill, category: e.target.value })} />
                      </div>
                      <textarea required aria-label="Skill content" placeholder="What the AI should know…" rows={3} maxLength={20000} className="w-full p-2 rounded-lg border border-gray-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" value={newSkill.content} onChange={e => setNewSkill({ ...newSkill, content: e.target.value })} />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setNewSkill(null)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                        <button type="submit" disabled={busy} className="px-4 py-1.5 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg disabled:opacity-60">Add skill</button>
                      </div>
                    </form>
                  )}
                  <div className="grid grid-cols-1 gap-3">
                    {knowledge
                      .filter(k => `${k.title} ${k.description} ${k.content}`.toLowerCase().includes(searchQuery.toLowerCase()))
                      .filter(k => activeCategory === 'All' || k.category === activeCategory)
                      .map(k => {
                        const attached = agent.knowledge_ids.includes(k.id);
                        return (
                          <div key={k.id} className={`p-4 rounded-xl border transition-all bg-white ${attached && k.enabled ? 'border-gray-200' : 'border-dashed border-gray-200 opacity-70'}`}>
                            <div className="flex items-start justify-between mb-2 gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-100 text-indigo-600 shrink-0">
                                  <FileText size={20} />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900 truncate">{k.title}</div>
                                  <div className="text-xs font-medium text-gray-500">{k.category}</div>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-xs font-medium text-gray-600">
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input type="checkbox" checked={attached} disabled={busy} onChange={() => toggleAttached(k)} aria-label={`Use ${k.title}`} />
                                  Used by agent
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                  <input type="checkbox" checked={k.enabled} disabled={busy} onChange={() => toggleEnabled(k)} aria-label={`Enable ${k.title}`} />
                                  Enabled
                                </label>
                              </div>
                            </div>
                            {k.description && <div className="text-[13px] text-gray-600 mb-2">{k.description}</div>}
                            <div className="text-xs text-gray-400 font-mono bg-gray-50 p-2 rounded border border-gray-100 line-clamp-2">{k.content}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Skills Section: mock */}
              {!live && filteredSkills.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Custom Skills</h3>
                    <button className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors">
                      <Plus size={16} /> Create New
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {filteredSkills.map(c => {
                      const Icon = c.icon;
                      return (
                        <div key={c.id} className="p-4 rounded-xl border border-gray-200 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer group bg-white">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.bg} ${c.color} shrink-0`}>
                                <Icon size={20} />
                              </div>
                              <div>
                                <div className="text-sm font-semibold text-gray-900">{c.name}</div>
                                <div className="text-xs font-medium text-gray-500">{c.category}</div>
                              </div>
                            </div>
                            <button className="text-gray-400 hover:text-blue-600 p-1.5 rounded bg-gray-50 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100">
                              <Settings size={16} />
                            </button>
                          </div>
                          <div className="text-[13px] text-gray-600 mb-2">
                            {c.desc}
                          </div>
                          <div className="text-xs text-gray-400 font-mono bg-gray-50 p-2 rounded border border-gray-100 truncate">
                            {c.content}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isBuilderOpen && (
        <AgentBuilderModal
          onClose={() => setIsBuilderOpen(false)}
          onCreated={async created => {
            setIsBuilderOpen(false);
            setAgents(await aiApi.listAgents());
            await loadAgent(created.id);
            setNotice(`${created.name} is ready. Say hi!`);
          }}
        />
      )}

    </div>
  );
}
