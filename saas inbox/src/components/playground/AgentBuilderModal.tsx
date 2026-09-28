import { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { aiApi, type Agent, type BusinessProfile, type ProfilerField } from '../../services/aiApi';

interface Props {
  onClose: () => void;
  onCreated: (agent: Agent) => void;
}

const inputClass =
  'w-full p-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm';

export function AgentBuilderModal({ onClose, onCreated }: Props) {
  const [profile, setProfile] = useState({ business_name: '', business_type: '', location: '', offerings: '', working_hours: '' });
  const [setup, setSetup] = useState({ agent_name: '', personality: '' });
  const [fields, setFields] = useState<ProfilerField[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const businessProfile = (): BusinessProfile => ({
    business_name: profile.business_name,
    business_type: profile.business_type,
    location: profile.location || undefined,
    working_hours: profile.working_hours || undefined,
    offerings: profile.offerings.split(',').map(s => s.trim()).filter(Boolean),
  });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const loadQuestions = () => run(async () => {
    setFields((await aiApi.profilerQuestions(businessProfile())).fields);
  });

  const generate = () => run(async () => {
    const agent = await aiApi.generate(businessProfile(), answers, {
      agent_name: setup.agent_name || undefined,
      personality: setup.personality || undefined,
    });
    onCreated(agent);
  });

  const toggleOption = (fieldId: string, option: string) => {
    const current = (answers[fieldId] as string[] | undefined) ?? [];
    setAnswers({ ...answers, [fieldId]: current.includes(option) ? current.filter(o => o !== option) : [...current, option] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white text-gray-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col border border-gray-200">
        <div className="p-6 pb-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2"><Sparkles size={20} className="text-blue-600" /> Create your AI agent</h2>
            <p className="text-sm text-gray-500 mt-1">
              {fields ? 'Answer a few questions tailored to your business.' : 'Tell us about your business.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900 transition-colors"><X size={24} /></button>
        </div>

        <form
          className="p-6 overflow-y-auto flex-1 space-y-4"
          onSubmit={e => { e.preventDefault(); if (fields) generate(); else loadQuestions(); }}
        >
          {!fields ? (
            <>
              <label className="block text-sm font-medium">Business name
                <input required className={`${inputClass} mt-1`} value={profile.business_name} onChange={e => setProfile({ ...profile, business_name: e.target.value })} />
              </label>
              <label className="block text-sm font-medium">Business type
                <input required placeholder="e.g. Dental Clinic, Cafe, Salon" className={`${inputClass} mt-1`} value={profile.business_type} onChange={e => setProfile({ ...profile, business_type: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">Location
                  <input className={`${inputClass} mt-1`} value={profile.location} onChange={e => setProfile({ ...profile, location: e.target.value })} />
                </label>
                <label className="block text-sm font-medium">Working hours
                  <input className={`${inputClass} mt-1`} value={profile.working_hours} onChange={e => setProfile({ ...profile, working_hours: e.target.value })} />
                </label>
              </div>
              <label className="block text-sm font-medium">Offerings <span className="text-gray-400 font-normal">(comma separated)</span>
                <input className={`${inputClass} mt-1`} value={profile.offerings} onChange={e => setProfile({ ...profile, offerings: e.target.value })} />
              </label>
            </>
          ) : (
            <>
              {fields.map(field => (
                <div key={field.field_id} className="text-sm">
                  <div className="font-medium mb-1">{field.question_text}{field.is_required && <span className="text-red-500"> *</span>}</div>
                  {field.ui_type === 'select' && field.options ? (
                    <select required={field.is_required} className={inputClass} value={(answers[field.field_id] as string) ?? ''} onChange={e => setAnswers({ ...answers, [field.field_id]: e.target.value })}>
                      <option value="">Choose…</option>
                      {field.options.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : field.ui_type === 'multiselect' && field.options ? (
                    <div className="flex flex-wrap gap-2">
                      {field.options.map(o => {
                        const on = ((answers[field.field_id] as string[] | undefined) ?? []).includes(o);
                        return (
                          <button type="button" key={o} onClick={() => toggleOption(field.field_id, o)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${on ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  ) : field.ui_type === 'textarea' ? (
                    <textarea required={field.is_required} rows={2} className={`${inputClass} resize-none`} value={(answers[field.field_id] as string) ?? ''} onChange={e => setAnswers({ ...answers, [field.field_id]: e.target.value })} />
                  ) : (
                    <input required={field.is_required} className={inputClass} value={(answers[field.field_id] as string) ?? ''} onChange={e => setAnswers({ ...answers, [field.field_id]: e.target.value })} />
                  )}
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <label className="block text-sm font-medium">Agent name <span className="text-gray-400 font-normal">(optional)</span>
                  <input className={`${inputClass} mt-1`} value={setup.agent_name} onChange={e => setSetup({ ...setup, agent_name: e.target.value })} />
                </label>
                <label className="block text-sm font-medium">Personality <span className="text-gray-400 font-normal">(optional)</span>
                  <input placeholder="e.g. warm and friendly" className={`${inputClass} mt-1`} value={setup.personality} onChange={e => setSetup({ ...setup, personality: e.target.value })} />
                </label>
              </div>
            </>
          )}

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            {fields && (
              <button type="button" onClick={() => setFields(null)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Back</button>
            )}
            <button type="submit" disabled={busy} className="px-5 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-black rounded-lg transition-colors disabled:opacity-60">
              {busy ? (fields ? 'Building agent…' : 'Thinking…') : fields ? 'Generate agent' : 'Next'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
