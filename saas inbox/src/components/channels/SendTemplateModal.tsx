import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { channelApi, type Template } from '../../services/channelApi';

interface Props {
  channelId: string;
  conversationId: string;
  onClose: () => void;
}

const inputClass =
  'w-full mt-1 p-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/30 focus:border-[#00a884] transition-all text-sm';

export function SendTemplateModal({ channelId, conversationId, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState(0);
  const [parameters, setParameters] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    channelApi.listTemplates(channelId).then(setTemplates).catch(err => setError(err.message));
  }, [channelId]);

  const template = templates[selected];
  const preview = template?.body.replace(/\{\{(\d+)\}\}/g, (match, n) => parameters[Number(n) - 1] || match);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await channelApi.sendTemplate(conversationId, template, parameters.slice(0, template.parameter_count));
      onClose(); // the message arrives through the live event stream
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <form onSubmit={send} className="bg-white text-[#111b21] rounded-2xl shadow-2xl w-full max-w-md border border-gray-200">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Send a template</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900 transition-colors"><X size={22} /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-[#667781]">Approved templates can be sent even when the 24-hour window is closed.</p>
          {templates.length > 0 && (
            <>
              <label className="block text-sm font-medium">Template
                <select className={inputClass} value={selected} onChange={e => { setSelected(Number(e.target.value)); setParameters([]); }}>
                  {templates.map((t, i) => <option key={`${t.name}-${t.language}`} value={i}>{t.name} ({t.language})</option>)}
                </select>
              </label>
              {Array.from({ length: template.parameter_count }, (_, i) => (
                <label key={i} className="block text-sm font-medium">{`Parameter {{${i + 1}}}`}
                  <input required className={inputClass} value={parameters[i] ?? ''}
                    onChange={e => { const next = [...parameters]; next[i] = e.target.value; setParameters(next); }} />
                </label>
              ))}
              <div className="rounded-lg bg-[#dcf8c6] px-3 py-2 text-sm whitespace-pre-wrap" aria-label="Template preview">{preview}</div>
            </>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={busy || !template} className="px-5 py-2 text-sm font-medium text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors disabled:opacity-60">
              {busy ? 'Sending…' : 'Send template'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
