import { useEffect, useState } from 'react';
import { Globe, X } from 'lucide-react';
import { apiService } from '../../context/MessagingContext';
import { channelApi, type WidgetSettings } from '../../services/channelApi';

interface Props {
  onClose: () => void;
}

const LEAD_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
] as const;

const inputClass =
  'w-full mt-1 p-2.5 rounded-lg border border-[var(--color-brand-border)] bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all text-sm';

const parseDomains = (text: string) => text.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

export function WebsiteChatModal({ onClose }: Props) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [widget, setWidget] = useState<WidgetSettings | null>(null);
  const [domains, setDomains] = useState('');
  const [greeting, setGreeting] = useState('');
  const [leadFields, setLeadFields] = useState<WidgetSettings['lead_fields']>([]);
  const [isDemo, setIsDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const show = (settings: WidgetSettings) => {
    setWidget(settings);
    setDomains(settings.allowed_domains.join(', '));
    setGreeting(settings.greeting);
    setLeadFields(settings.lead_fields);
  };

  useEffect(() => {
    apiService?.me().then(user => setIsDemo(user.workspace.is_demo)).catch(() => {});
    channelApi.listChannels()
      .then(async channels => {
        const website = channels.find(c => c.adapter_type === 'website');
        if (website) {
          setChannelId(website.id);
          show(await channelApi.getWidget(website.id));
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const create = () => run(async () => {
    const channel = await channelApi.createWebsiteChat({ allowed_domains: parseDomains(domains) });
    setChannelId(channel.id);
    show(await channelApi.getWidget(channel.id));
  });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      show(await channelApi.updateWidget(channelId!, { allowed_domains: parseDomains(domains), greeting, lead_fields: leadFields }));
      setSaved(true);
    });
  };

  const toggleField = (key: WidgetSettings['lead_fields'][number]) =>
    setLeadFields(fields => (fields.includes(key) ? fields.filter(f => f !== key) : [...fields, key]));

  const domainsInput = (
    <label className="block text-sm font-medium">Allowed domains
      <input
        aria-label="Allowed domains"
        className={inputClass}
        placeholder="yourbusiness.com, shop.yourbusiness.com"
        value={domains}
        onChange={e => setDomains(e.target.value)}
      />
      <span className="block mt-1 text-xs text-[var(--color-brand-text-secondary)]">Comma separated. A domain also allows its subdomains.</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white text-[var(--color-brand-text)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col border border-[var(--color-brand-border)]">
        <div className="p-5 border-b border-[var(--color-brand-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Globe size={20} /> Website chat</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900 transition-colors"><X size={22} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          {loading ? (
            <p className="text-sm text-[var(--color-brand-text-secondary)]">Loading…</p>
          ) : !widget ? (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-brand-text-secondary)]">
                Add a chat button to your website. Visitors' messages arrive in this inbox, and your replies reach them live.
              </p>
              {domainsInput}
              <div className="flex justify-end">
                <button onClick={create} disabled={busy} className="px-5 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-60">
                  Create chat widget
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <label className="block text-sm font-medium">Embed code
                <textarea
                  readOnly
                  aria-label="Embed code"
                  rows={3}
                  className={`${inputClass} font-mono text-xs`}
                  value={widget.embed_snippet}
                  onFocus={e => e.target.select()}
                />
                <span className="block mt-1 text-xs text-[var(--color-brand-text-secondary)]">Paste it before <code>&lt;/body&gt;</code> on every page that should show the chat.</span>
              </label>
              {domainsInput}
              <label className="block text-sm font-medium">Greeting
                <input aria-label="Greeting" required className={inputClass} value={greeting} onChange={e => setGreeting(e.target.value)} />
              </label>
              <fieldset>
                <legend className="text-sm font-medium">Ask visitors for</legend>
                <div className="flex gap-4 mt-2">
                  {LEAD_FIELDS.map(f => (
                    <label key={f.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" aria-label={`Ask for ${f.label}`} checked={leadFields.includes(f.key)} onChange={() => toggleField(f.key)} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              {saved && <p role="status" className="text-sm text-green-700">Saved.</p>}
              <div className="flex items-center justify-between gap-3">
                {isDemo ? (
                  <a href={`${import.meta.env.VITE_API_URL}/widget/demo`} target="_blank" rel="noreferrer" className="text-sm font-medium text-gray-900 underline">
                    Open demo page
                  </a>
                ) : <span />}
                <button type="submit" disabled={busy} className="px-5 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-60">
                  Save
                </button>
              </div>
            </form>
          )}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
