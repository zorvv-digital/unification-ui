import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { channelApi, type Channel, type WebhookInfo } from '../../services/channelApi';

export interface ChannelField {
  key: string;
  label: string;
  secret?: boolean;
}

interface Props {
  title: string;
  icon: ReactNode;
  platforms: string[];
  simulatedLabel: string;
  formTitle: string;
  formHelp: string;
  fields: ChannelField[];
  connect: (form: Record<string, string>) => Promise<(Channel & WebhookInfo)[]>;
  /** Where in the Meta App Dashboard the channel's webhook is registered. */
  registerHint: (channel: Channel) => string;
  /** Tailwind classes for the accent: [focus ring + border, button]. */
  accent: [string, string];
  /** Submit button text; with no `fields` the form is just this button. */
  connectLabel?: string;
  busyLabel?: string;
  onClose: () => void;
  onChanged: () => void;
}

const PLATFORM_LABELS: Record<string, string> = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram' };

export function ChannelsModal({ title, icon, platforms, simulatedLabel, formTitle, formHelp, fields, connect, registerHint, accent, connectLabel = 'Connect', busyLabel = 'Checking with Meta…', onClose, onChanged }: Props) {
  const empty = Object.fromEntries(fields.map(f => [f.key, '']));
  const [channels, setChannels] = useState<Channel[]>([]);
  const [form, setForm] = useState<Record<string, string>>(empty);
  const [connected, setConnected] = useState<(Channel & WebhookInfo)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputClass = `w-full mt-1 p-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 transition-all text-sm ${accent[0]}`;
  const platformPrefix = (c: Channel) => (platforms.length > 1 ? `${PLATFORM_LABELS[c.platform] ?? c.platform} · ` : '');

  const load = () => channelApi.listChannels().then(all => setChannels(all.filter(c => platforms.includes(c.platform))));
  useEffect(() => { load().catch(err => setError(err.message)); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setConnected(await connect(form));
      setForm(empty);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (channel: Channel) => {
    if (!window.confirm(`Disconnect ${channel.name}? Its conversations stay in the inbox.`)) return;
    await channelApi.disconnect(channel.id).catch(err => setError(err.message));
    await load();
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white text-[#111b21] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col border border-gray-200">
        <div className="p-5 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">{icon} {title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900 transition-colors"><X size={22} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <ul className="space-y-2">
            {channels.map(c => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-[#667781]">
                    {c.adapter_type === 'simulated' ? simulatedLabel : platformPrefix(c) + (c.status === 'connected' ? 'Connected' : 'Disconnected')}
                  </div>
                </div>
                {c.adapter_type !== 'simulated' && c.status === 'connected' && (
                  <button onClick={() => disconnect(c)} className="text-xs font-medium text-red-600 hover:bg-red-50 px-2 py-1 rounded-md">
                    Disconnect
                  </button>
                )}
              </li>
            ))}
          </ul>

          {connected.length > 0 && (
            <div role="status" className="rounded-lg bg-[#e7fce3] border border-[#b7ebb0] p-3 text-sm space-y-3">
              <p className="font-medium">
                Connected! Register {connected.length > 1 ? 'these webhooks' : `this webhook`} in the Meta App Dashboard
                {connected.length === 1 && ` (${registerHint(connected[0])})`} and subscribe to <b>messages</b>.
              </p>
              {connected.map(c => {
                const label = connected.length > 1 ? `${PLATFORM_LABELS[c.platform] ?? c.platform} webhook URL` : 'Webhook URL';
                return (
                  <div key={c.id} className="space-y-1">
                    {connected.length > 1 && <p className="text-xs text-[#667781]">{registerHint(c)}</p>}
                    <label className="block text-xs font-medium">{label}
                      <input readOnly aria-label={label} value={c.webhook_url} className={inputClass} onFocus={e => e.target.select()} />
                    </label>
                    <label className="block text-xs font-medium">Verify token
                      <input readOnly aria-label={connected.length > 1 ? `${label.replace(' webhook URL', '')} verify token` : 'Verify token'} value={c.verify_token} className={inputClass} onFocus={e => e.target.select()} />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <h3 className="text-sm font-semibold">{formTitle}</h3>
            <p className="text-xs text-[#667781]">{formHelp}</p>
            {fields.map(f => (
              <label key={f.key} className="block text-sm font-medium">{f.label}
                <input
                  required
                  type={f.secret ? 'password' : 'text'}
                  className={inputClass}
                  value={form[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                />
              </label>
            ))}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={busy} className={`px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 ${accent[1]}`}>
                {busy ? busyLabel : connectLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
