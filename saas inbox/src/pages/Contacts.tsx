import { useEffect, useMemo, useState } from 'react';
import { Search, Upload, Tags, Trash2, X, Users, Filter } from 'lucide-react';
import { Sidebar } from '../components/inbox/Sidebar';
import { TagChip, formatDay } from '../components/inbox/ContactPanel';
import { crmApi, emptyRules, TAG_COLORS, type ContactListItem, type ImportResult, type Segment, type SegmentMembers, type SegmentRules } from '../services/crmApi';
import type { Consent, ContactTag } from '../types/messaging';

const PLATFORMS = ['whatsapp', 'instagram', 'messenger', 'gmail', 'website'];
const platformLabel = (p: string) => (p === 'whatsapp' ? 'WhatsApp' : p);
const CONSENTS: [Consent, string][] = [['opted_in', 'Opted in'], ['opted_out', 'Opted out'], ['unknown', 'Unknown']];

const inputClass =
  'p-2 rounded-lg border border-[var(--color-brand-border)] bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 text-sm';
const primary = 'px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-60';
const secondary = 'px-3 py-2 text-sm font-medium bg-white border border-[var(--color-brand-border)] hover:bg-gray-50 rounded-lg flex items-center gap-2';

const lastActive = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' }) : '-');

function ContactsTable({ contacts }: { contacts: ContactListItem[] }) {
  return (
    <div className="bg-white border border-[var(--color-brand-border)] rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
          <tr>
            <th className="px-4 py-3">Name</th><th className="px-4 py-3">Channels</th><th className="px-4 py-3">Phone</th>
            <th className="px-4 py-3">Email</th><th className="px-4 py-3">Birthday</th><th className="px-4 py-3">Tags</th><th className="px-4 py-3">Last active</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-brand-border)]">
          {contacts.map(c => (
            <tr key={c.id}>
              <td className="px-4 py-3 font-medium">{c.name}</td>
              <td className="px-4 py-3 capitalize text-[var(--color-brand-text-secondary)]">{c.platforms.map(platformLabel).join(', ') || '-'}</td>
              <td className="px-4 py-3">{c.phone ?? ''}</td>
              <td className="px-4 py-3">{c.email ?? ''}</td>
              <td className="px-4 py-3">{formatDay(c.birthday ?? undefined)}</td>
              <td className="px-4 py-3"><div className="flex flex-wrap gap-1">{(c.tags ?? []).map(t => <TagChip key={t.id} tag={t} />)}</div></td>
              <td className="px-4 py-3 text-[var(--color-brand-text-secondary)]">{lastActive(c.last_activity_at)}</td>
            </tr>
          ))}
          {!contacts.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-[var(--color-brand-text-secondary)]">No contacts match.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ManageTags({ tags, onChanged, onClose }: { tags: ContactTag[]; onChanged: () => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const act = (action: () => Promise<unknown>) => { setError(''); action().then(onChanged).catch(err => setError(err.message)); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[var(--color-brand-border)]">
        <div className="p-5 border-b border-[var(--color-brand-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tags</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900"><X size={22} /></button>
        </div>
        <div className="p-5 space-y-4">
          <ul className="space-y-2">
            {tags.map(tag => (
              <li key={tag.id} className="flex items-center gap-2">
                <input
                  aria-label={`Rename ${tag.name}`}
                  defaultValue={tag.name}
                  className={`${inputClass} flex-1`}
                  onBlur={e => e.target.value.trim() && e.target.value !== tag.name && act(() => crmApi.updateTag(tag.id, { name: e.target.value }))}
                />
                <div className="flex gap-1">
                  {TAG_COLORS.map(color => (
                    <button key={color} aria-label={`Color ${color} for ${tag.name}`} onClick={() => act(() => crmApi.updateTag(tag.id, { color }))}
                      className={`w-4 h-4 rounded-full ${tag.color === color ? 'ring-2 ring-offset-1 ring-gray-900' : ''}`} style={{ backgroundColor: color }} />
                  ))}
                </div>
                <button aria-label={`Delete ${tag.name}`} onClick={() => window.confirm(`Delete tag ${tag.name}? It is removed from all contacts.`) && act(() => crmApi.deleteTag(tag.id))}
                  className="p-1.5 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) act(async () => { await crmApi.createTag(name.trim(), TAG_COLORS[tags.length % TAG_COLORS.length]); setName(''); }); }}>
            <input aria-label="New tag" placeholder="New tag name" className={`${inputClass} flex-1`} value={name} onChange={e => setName(e.target.value)} />
            <button type="submit" className={primary}>Add tag</button>
          </form>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function ContactsTab({ tags, reloadTags }: { tags: ContactTag[]; reloadTags: () => void }) {
  const [q, setQ] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [error, setError] = useState('');

  const load = () => crmApi.listContacts(q, tagFilter).then(setContacts).catch(err => setError(err.message));
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [q, tagFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const importFile = async (file: File) => {
    setError('');
    try {
      setResult(await crmApi.importCsv(await file.text()));
      reloadTags();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 bg-white border border-[var(--color-brand-border)] rounded-lg px-3 flex-1 min-w-[220px]">
          <Search size={16} className="text-gray-400" />
          <input aria-label="Search contacts" placeholder="Search name, phone or email" className="py-2 w-full text-sm outline-none" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <label className={`${secondary} cursor-pointer`}>
          <Upload size={16} /> Import CSV
          <input type="file" accept=".csv,text/csv" aria-label="Import CSV" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        </label>
        <button className={secondary} onClick={() => setManageOpen(true)}><Tags size={16} /> Manage tags</button>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label="Filter by tag">
        <Filter size={14} className="text-gray-400" />
        {tags.map(tag => {
          const on = tagFilter.includes(tag.id);
          return (
            <button key={tag.id} aria-pressed={on} onClick={() => setTagFilter(on ? tagFilter.filter(id => id !== tag.id) : [...tagFilter, tag.id])}
              className={`rounded-md ${on ? 'ring-2 ring-gray-900' : 'opacity-70 hover:opacity-100'}`}>
              <TagChip tag={tag} />
            </button>
          );
        })}
      </div>

      {result && (
        <div role="status" className="bg-white border border-[var(--color-brand-border)] rounded-lg p-3 text-sm">
          <div className="flex justify-between">
            <b>Imported: {result.created} created, {result.updated} updated, {result.skipped.length} skipped</b>
            <button aria-label="Dismiss" onClick={() => setResult(null)}><X size={16} /></button>
          </div>
          {result.skipped.length > 0 && (
            <ul className="mt-2 text-xs text-[var(--color-brand-text-secondary)] list-disc pl-5">
              {result.skipped.map(s => <li key={s.row}>Row {s.row}: {s.reason}</li>)}
            </ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <ContactsTable contacts={contacts} />
      {manageOpen && <ManageTags tags={tags} onChanged={() => { reloadTags(); load(); }} onClose={() => setManageOpen(false)} />}
    </div>
  );
}

function SegmentsTab({ tags }: { tags: ContactTag[] }) {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [rules, setRules] = useState<SegmentRules>(emptyRules());
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<SegmentMembers | null>(null);
  const [error, setError] = useState('');

  const load = () => crmApi.listSegments().then(setSegments).catch(err => setError(err.message));
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const timer = setTimeout(() => crmApi.previewSegment(rules).then(setPreview).catch(err => setError(err.message)), 250);
    return () => clearTimeout(timer);
  }, [rules]);

  const toggle = <K extends 'tags' | 'exclude_tags' | 'platforms' | 'consent'>(key: K, value: SegmentRules[K][number]) => {
    const list = rules[key] as string[];
    setRules({ ...rules, [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] });
  };
  const days = (value: string) => (value === '' ? null : Math.max(0, Number(value)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) await crmApi.updateSegment(editingId, { name, rules });
      else await crmApi.createSegment(name, rules);
      setName('');
      setEditingId(null);
      setRules(emptyRules());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  };

  const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-xs font-medium border ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-[var(--color-brand-border)] hover:bg-gray-50'}`;
  const tagPicker = (key: 'tags' | 'exclude_tags') => (
    <div className="flex flex-wrap gap-1.5">
      {tags.map(tag => (
        <button type="button" key={tag.id} aria-pressed={rules[key].includes(tag.id)} aria-label={`${key === 'tags' ? 'Has' : 'Exclude'} ${tag.name}`}
          onClick={() => toggle(key, tag.id)} className={`rounded-md ${rules[key].includes(tag.id) ? 'ring-2 ring-gray-900' : 'opacity-60 hover:opacity-100'}`}>
          <TagChip tag={tag} />
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
      <form onSubmit={save} className="bg-white border border-[var(--color-brand-border)] rounded-xl p-5 space-y-5 text-sm">
        <h2 className="font-semibold">{editingId ? 'Edit segment' : 'New segment'}</h2>
        <div>
          <div className="font-medium mb-2 flex items-center gap-2">Has tags
            <select aria-label="Tag match" className="p-1 text-xs rounded border border-[var(--color-brand-border)]" value={rules.tags_match}
              onChange={e => setRules({ ...rules, tags_match: e.target.value as 'any' | 'all' })}>
              <option value="any">any of</option><option value="all">all of</option>
            </select>
          </div>
          {tagPicker('tags')}
        </div>
        <div><div className="font-medium mb-2">Doesn't have tags</div>{tagPicker('exclude_tags')}</div>
        <div>
          <div className="font-medium mb-2">Channels</div>
          <div className="flex flex-wrap gap-1.5">
            {PLATFORMS.map(p => <button type="button" key={p} aria-pressed={rules.platforms.includes(p)} onClick={() => toggle('platforms', p)} className={`${chip(rules.platforms.includes(p))} capitalize`}>{platformLabel(p)}</button>)}
          </div>
        </div>
        <div>
          <div className="font-medium mb-2">Marketing consent</div>
          <div className="flex flex-wrap gap-1.5">
            {CONSENTS.map(([value, label]) => <button type="button" key={value} aria-pressed={rules.consent.includes(value)} onClick={() => toggle('consent', value)} className={chip(rules.consent.includes(value))}>{label}</button>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="font-medium">Active in the last (days)
            <input aria-label="Active within days" type="number" min={1} className={`${inputClass} block mt-1 w-40`} value={rules.active_within_days ?? ''}
              onChange={e => setRules({ ...rules, active_within_days: days(e.target.value) || null })} />
          </label>
          <label className="font-medium">Birthday in the next (days)
            <input aria-label="Birthday within days" type="number" min={0} className={`${inputClass} block mt-1 w-40`} value={rules.birthday_within_days ?? ''}
              onChange={e => setRules({ ...rules, birthday_within_days: days(e.target.value) })} />
          </label>
        </div>
        <div className="flex items-end gap-3 border-t border-[var(--color-brand-border)] pt-4">
          <label className="font-medium flex-1">Segment name
            <input aria-label="Segment name" required className={`${inputClass} block w-full mt-1`} value={name} onChange={e => setName(e.target.value)} />
          </label>
          {editingId && <button type="button" className={secondary} onClick={() => { setEditingId(null); setName(''); setRules(emptyRules()); }}>Cancel</button>}
          <button type="submit" className={primary}>{editingId ? 'Update segment' : 'Save segment'}</button>
        </div>
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </form>

      <div className="space-y-4">
        <div className="bg-white border border-[var(--color-brand-border)] rounded-xl p-5" aria-label="Segment preview">
          <div className="text-xs uppercase tracking-wider text-gray-500">Matching contacts</div>
          <div className="text-3xl font-semibold mt-1" aria-label="Segment count">{preview?.count ?? '…'}</div>
          <ul className="mt-3 space-y-1 text-sm">
            {preview?.members.map(m => <li key={m.id} className="flex justify-between"><span>{m.name}</span><span className="text-xs text-gray-500 capitalize">{m.platforms.map(platformLabel).join(', ')}</span></li>)}
          </ul>
        </div>
        <div className="bg-white border border-[var(--color-brand-border)] rounded-xl p-5">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">Saved segments</div>
          <ul className="space-y-2 text-sm">
            {segments.map(s => (
              <li key={s.id} className="flex items-center justify-between gap-2">
                <button className="text-left font-medium hover:underline" onClick={() => { setEditingId(s.id); setName(s.name); setRules(s.rules); }}>{s.name}</button>
                <span className="ml-auto text-xs text-gray-500 flex items-center gap-1"><Users size={12} />{s.count}</span>
                <button aria-label={`Delete segment ${s.name}`} className="p-1 text-gray-400 hover:text-red-600"
                  onClick={() => window.confirm(`Delete segment ${s.name}?`) && crmApi.deleteSegment(s.id).then(load)}><Trash2 size={14} /></button>
              </li>
            ))}
            {!segments.length && <li className="text-[var(--color-brand-text-secondary)]">No saved segments yet.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function Contacts() {
  const [tab, setTab] = useState<'contacts' | 'segments'>('contacts');
  const [tags, setTags] = useState<ContactTag[]>([]);
  const reloadTags = () => { crmApi.listTags().then(setTags).catch(() => {}); };
  useEffect(reloadTags, []);
  const sortedTags = useMemo(() => [...tags].sort((a, b) => a.name.localeCompare(b.name)), [tags]);

  return (
    <div className="h-screen w-full flex bg-[var(--color-brand-surface)] text-[var(--color-brand-text)] font-sans overflow-hidden">
      <Sidebar isMobileOpen={false} onCloseMobile={() => {}} />
      <main className="flex-1 min-w-0 overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Contacts</h1>
          <div className="flex gap-1 bg-white border border-[var(--color-brand-border)] rounded-lg p-1" role="tablist">
            {(['contacts', 'segments'] as const).map(t => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md capitalize ${tab === t ? 'bg-gray-900 text-white' : 'hover:bg-gray-50'}`}>{t}</button>
            ))}
          </div>
        </div>
        {tab === 'contacts' ? <ContactsTab tags={sortedTags} reloadTags={reloadTags} /> : <SegmentsTab tags={sortedTags} />}
      </main>
    </div>
  );
}
