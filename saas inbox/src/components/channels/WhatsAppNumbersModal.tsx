import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { FaWhatsapp } from 'react-icons/fa';
import { channelApi, type Channel, type WebhookInfo, type WhatsAppCredentials } from '../../services/channelApi';

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

const inputClass =
  'w-full mt-1 p-2.5 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00a884]/30 focus:border-[#00a884] transition-all text-sm';

const FIELDS: { key: keyof WhatsAppCredentials; label: string; secret?: boolean }[] = [
  { key: 'phone_number_id', label: 'Phone number ID' },
  { key: 'waba_id', label: 'WhatsApp Business Account ID' },
  { key: 'access_token', label: 'Access token', secret: true },
  { key: 'app_secret', label: 'App secret', secret: true },
];

export function WhatsAppNumbersModal({ onClose, onChanged }: Props) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [form, setForm] = useState<WhatsAppCredentials>({ phone_number_id: '', waba_id: '', access_token: '', app_secret: '' });
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => channelApi.listChannels().then(all => setChannels(all.filter(c => c.platform === 'whatsapp')));
  useEffect(() => { load().catch(err => setError(err.message)); }, []);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const channel = await channelApi.connectWhatsApp(form);
      setWebhook({ webhook_url: channel.webhook_url, verify_token: channel.verify_token });
      setForm({ phone_number_id: '', waba_id: '', access_token: '', app_secret: '' });
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
          <h2 className="text-lg font-semibold flex items-center gap-2"><FaWhatsapp className="text-[#25D366]" size={22} /> WhatsApp numbers</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900 transition-colors"><X size={22} /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <ul className="space-y-2">
            {channels.map(c => (
              <li key={c.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-[#667781]">
                    {c.adapter_type === 'simulated' ? 'Demo number (simulated)' : c.status === 'connected' ? 'Connected' : 'Disconnected'}
                  </div>
                </div>
                {c.adapter_type === 'whatsapp' && c.status === 'connected' && (
                  <button onClick={() => disconnect(c)} className="text-xs font-medium text-red-600 hover:bg-red-50 px-2 py-1 rounded-md">
                    Disconnect
                  </button>
                )}
              </li>
            ))}
          </ul>

          {webhook && (
            <div role="status" className="rounded-lg bg-[#e7fce3] border border-[#b7ebb0] p-3 text-sm space-y-2">
              <p className="font-medium">Connected! Register this webhook in the Meta App Dashboard (WhatsApp → Configuration) and subscribe to <b>messages</b>.</p>
              <label className="block text-xs font-medium">Webhook URL
                <input readOnly aria-label="Webhook URL" value={webhook.webhook_url} className={inputClass} onFocus={e => e.target.select()} />
              </label>
              <label className="block text-xs font-medium">Verify token
                <input readOnly aria-label="Verify token" value={webhook.verify_token} className={inputClass} onFocus={e => e.target.select()} />
              </label>
            </div>
          )}

          <form onSubmit={connect} className="space-y-3">
            <h3 className="text-sm font-semibold">Connect a WhatsApp Business number</h3>
            <p className="text-xs text-[#667781]">From your app in Meta for Developers: WhatsApp → API Setup, and App settings → Basic for the app secret.</p>
            {FIELDS.map(f => (
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
              <button type="submit" disabled={busy} className="px-5 py-2 text-sm font-medium text-white bg-[#00a884] hover:bg-[#008f6f] rounded-lg transition-colors disabled:opacity-60">
                {busy ? 'Checking with Meta…' : 'Connect'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
