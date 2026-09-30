import React, { useEffect, useState } from 'react';
import { X, Mail, Phone, Tag, Calendar, MessageSquare, StickyNote, Cake, Heart, ShieldCheck, Plus, GitMerge } from 'lucide-react';
import { Avatar } from '../messaging/Avatar';
import type { Consent, Contact, ContactTag, Conversation } from '../../types/messaging';
import { MessageCircle } from 'lucide-react';
import { InstagramIcon } from '../icons/InstagramIcon';
import { apiService } from '../../context/MessagingContext';
import { crmApi, TAG_COLORS, type ContactChanges, type ContactListItem } from '../../services/crmApi';

interface ContactPanelProps {
  isMobileOpen: boolean;
  onClose: () => void;
  contact?: Contact;
  conversation?: Conversation;
  messageCount?: number;
}

const CONSENT_LABELS: Record<Consent, string> = { opted_in: 'Opted in', opted_out: 'Opted out', unknown: 'Unknown' };

export const formatDay = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export const TagChip: React.FC<{ tag: ContactTag; onRemove?: () => void }> = ({ tag, onRemove }) => (
  <span
    className="px-2 py-1 text-xs font-medium rounded-md border flex items-center gap-1"
    style={{ color: tag.color, borderColor: `${tag.color}40`, backgroundColor: `${tag.color}14` }}
  >
    <Tag size={12} /> {tag.name}
    {onRemove && (
      <button onClick={onRemove} aria-label={`Remove tag ${tag.name}`} className="ml-0.5 hover:opacity-70"><X size={12} /></button>
    )}
  </span>
);

const inputClass =
  'w-full mt-1 p-2 rounded-lg border border-[var(--color-brand-border)] bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 text-sm';

export const ContactPanel: React.FC<ContactPanelProps> = ({
  isMobileOpen,
  onClose,
  contact,
  conversation,
  messageCount = 0
}) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ContactChanges>({});
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [allTags, setAllTags] = useState<ContactTag[]>([]);
  const [newTag, setNewTag] = useState('');
  const [mergeOpen, setMergeOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setEditing(false); setTagPickerOpen(false); setMergeOpen(false); setError(''); }, [contact?.id]);

  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      return false;
    }
  };

  const startEdit = () => {
    if (!contact) return;
    setForm({
      name: contact.name, phone: contact.phone ?? '', email: contact.email ?? '', birthday: contact.birthday ?? '',
      anniversary: contact.anniversary ?? '', notes: contact.notes ?? '', consent: contact.consent ?? 'unknown',
    });
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact) return;
    // Empty inputs clear the field on the server.
    const changes = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v])) as ContactChanges;
    if (await run(() => crmApi.updateContact(contact.id, changes))) setEditing(false);
  };

  const openTagPicker = () => {
    setTagPickerOpen(open => !open);
    run(() => crmApi.listTags().then(setAllTags));
  };

  const addTag = (tagId: string) => contact && run(async () => { await crmApi.addTag(contact.id, tagId); setTagPickerOpen(false); });

  const createTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact || !newTag.trim()) return;
    run(async () => {
      const tag = await crmApi.createTag(newTag.trim(), TAG_COLORS[allTags.length % TAG_COLORS.length]);
      await crmApi.addTag(contact.id, tag.id);
      setNewTag('');
      setTagPickerOpen(false);
    });
  };

  const tags = contact?.tags ?? [];
  const available = allTags.filter(t => !tags.some(own => own.id === t.id));

  return (
    <>
      {/* Mobile/Tablet Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel Container */}
      <div className={`
        fixed inset-y-0 right-0 z-50 lg:static lg:z-auto
        w-[280px] sm:w-[320px] lg:w-full bg-white lg:border-l border-[var(--color-brand-border)]
        flex flex-col transform transition-transform duration-200 ease-in-out shadow-xl lg:shadow-none
        ${isMobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-14 border-b border-[var(--color-brand-border)] flex items-center justify-between px-4 shrink-0">
          <h3 className="font-semibold text-sm">Contact Details</h3>
          <button
            onClick={onClose}
            className="lg:hidden p-1 text-[var(--color-brand-text-secondary)] hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          {!contact || !conversation ? (
            <div className="text-center text-sm text-[var(--color-brand-text-secondary)] mt-8">
              Select a conversation to view contact details.
            </div>
          ) : editing ? (
            <form onSubmit={save} className="flex flex-col gap-3 text-sm" aria-label="Edit contact">
              <label className="font-medium">Name<input aria-label="Name" required className={inputClass} value={form.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
              <label className="font-medium">Phone<input aria-label="Phone" className={inputClass} value={form.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
              <label className="font-medium">Email<input aria-label="Email" type="email" className={inputClass} value={form.email ?? ''} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
              <label className="font-medium">Birthday<input aria-label="Birthday" type="date" className={inputClass} value={form.birthday ?? ''} onChange={e => setForm({ ...form, birthday: e.target.value })} /></label>
              <label className="font-medium">Anniversary<input aria-label="Anniversary" type="date" className={inputClass} value={form.anniversary ?? ''} onChange={e => setForm({ ...form, anniversary: e.target.value })} /></label>
              <label className="font-medium">Marketing consent
                <select aria-label="Marketing consent" className={inputClass} value={form.consent} onChange={e => setForm({ ...form, consent: e.target.value as Consent })}>
                  {Object.entries(CONSENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="font-medium">Notes<textarea aria-label="Notes" rows={3} className={inputClass} value={form.notes ?? ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
              {error && <p role="alert" className="text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 hover:bg-gray-200">Cancel</button>
                <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800">Save contact</button>
              </div>
            </form>
          ) : (
            <>
              {/* Header */}
              <div className="text-center py-4">
                <Avatar src={contact.avatar} alt={contact.name} size="xl" className="mx-auto mb-3" />
                <h4 className="font-semibold text-lg">{contact.name}</h4>
                <p className="text-sm text-[var(--color-brand-text-secondary)] mt-0.5">{contact.username || 'Customer'}</p>
                {apiService && (
                  <div className="mt-3 flex justify-center gap-2">
                    <button onClick={startEdit} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-medium rounded-md transition-colors">Edit</button>
                    <button onClick={() => setMergeOpen(true)} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-xs font-medium rounded-md transition-colors flex items-center gap-1"><GitMerge size={12} /> Merge</button>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--color-brand-border)] my-2"></div>

              {/* Contact Details */}
              <div className="py-2">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Contact Info</h5>
                <div className="flex flex-col gap-3 text-sm">
                  {contact.phone && (
                    <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                      <Phone size={16} />
                      <span className="text-[var(--color-brand-text)]">{contact.phone}</span>
                    </div>
                  )}
                  {contact.email && (
                    <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                      <Mail size={16} />
                      <span className="text-[var(--color-brand-text)]">{contact.email}</span>
                    </div>
                  )}
                  {contact.birthday && (
                    <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                      <Cake size={16} />
                      <span className="text-[var(--color-brand-text)]">Birthday {formatDay(contact.birthday)}</span>
                    </div>
                  )}
                  {contact.anniversary && (
                    <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                      <Heart size={16} />
                      <span className="text-[var(--color-brand-text)]">Anniversary {formatDay(contact.anniversary)}</span>
                    </div>
                  )}
                  {contact.consent && (
                    <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                      <ShieldCheck size={16} />
                      <span className="text-[var(--color-brand-text)]">Marketing: {CONSENT_LABELS[contact.consent]}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-[var(--color-brand-text-secondary)]">
                    {conversation.platform === 'whatsapp' ? <MessageCircle size={16} /> :
                     conversation.platform === 'instagram' ? <InstagramIcon size={16} /> :
                     <MessageSquare size={16} />}
                    <span className="text-[var(--color-brand-text)] capitalize">{conversation.platform}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--color-brand-border)] my-2"></div>

              {/* Conversation Info */}
              <div className="py-2">
                <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Conversation</h5>
                <div className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--color-brand-text-secondary)]"><Calendar size={16}/> Last activity</div>
                    <div className="font-medium">{conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[var(--color-brand-text-secondary)]"><MessageSquare size={16}/> Total Messages</div>
                    <div className="font-medium">{messageCount}</div>
                  </div>
                </div>
              </div>

              <div className="border-t border-[var(--color-brand-border)] my-2"></div>

              {/* Tags */}
              <div className="py-2 relative">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Tags</h5>
                  {apiService && <button onClick={openTagPicker} aria-label="Add tag" className="text-[var(--color-brand-text)] hover:underline text-xs">Add</button>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => (
                    <TagChip key={tag.id} tag={tag} onRemove={apiService ? () => run(() => crmApi.removeTag(contact.id, tag.id)) : undefined} />
                  ))}
                  {!tags.length && <span className="text-xs text-[var(--color-brand-text-secondary)]">No tags yet</span>}
                </div>
                {tagPickerOpen && (
                  <div role="listbox" aria-label="Tags to add" className="mt-3 border border-[var(--color-brand-border)] rounded-lg p-2 bg-white shadow-sm">
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {available.map(tag => (
                        <button key={tag.id} role="option" onClick={() => addTag(tag.id)} className="hover:opacity-80"><TagChip tag={tag} /></button>
                      ))}
                      {!available.length && <span className="text-xs text-[var(--color-brand-text-secondary)]">No other tags</span>}
                    </div>
                    <form onSubmit={createTag} className="flex gap-1.5">
                      <input aria-label="New tag name" placeholder="Create tag…" className="flex-1 px-2 py-1 text-xs rounded-md border border-[var(--color-brand-border)] focus:outline-none focus:border-gray-900" value={newTag} onChange={e => setNewTag(e.target.value)} />
                      <button type="submit" aria-label="Create tag" className="px-2 py-1 rounded-md bg-gray-900 text-white"><Plus size={12} /></button>
                    </form>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--color-brand-border)] my-2"></div>

              {/* Notes */}
              <div className="py-2">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Notes</h5>
                  {apiService && <button onClick={startEdit} className="text-[var(--color-brand-text)] hover:underline text-xs">{contact.notes ? 'Edit' : 'Add'}</button>}
                </div>
                {contact.notes ? (
                  <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg text-sm text-yellow-900 shadow-sm relative whitespace-pre-wrap">
                    <StickyNote size={14} className="absolute top-2 right-2 text-yellow-400 opacity-50" />
                    <p className="pr-4">{contact.notes}</p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-brand-text-secondary)]">No notes yet</p>
                )}
              </div>
              {error && <p role="alert" className="text-sm text-red-600 mt-2">{error}</p>}
            </>
          )}
        </div>
      </div>

      {mergeOpen && contact && <MergeModal contact={contact} onClose={() => setMergeOpen(false)} />}
    </>
  );
};

/** Pick another contact to merge into this one (same customer on another channel). */
function MergeModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [others, setOthers] = useState<ContactListItem[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      crmApi.listContacts(q).then(list => setOthers(list.filter(c => c.id !== contact.id))).catch(err => setError(err.message));
    }, 200);
    return () => clearTimeout(timer);
  }, [q, contact.id]);

  const merge = async (source: ContactListItem) => {
    if (!window.confirm(`Merge ${source.name} into ${contact.name}? Their conversations and tags move to ${contact.name}.`)) return;
    try {
      await crmApi.merge(contact.id, source.id);
      window.location.reload(); // the merged contact is gone; reload the inbox from the server
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not merge');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-[var(--color-brand-border)]">
        <div className="p-5 border-b border-[var(--color-brand-border)] flex items-center justify-between">
          <h2 className="text-lg font-semibold">Merge into {contact.name}</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900"><X size={22} /></button>
        </div>
        <div className="p-5 flex flex-col gap-3 overflow-hidden">
          <input aria-label="Search contacts to merge" placeholder="Search by name, phone or email" className={inputClass} value={q} onChange={e => setQ(e.target.value)} />
          <ul className="overflow-y-auto divide-y divide-[var(--color-brand-border)]">
            {others.map(c => (
              <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-[var(--color-brand-text-secondary)] capitalize">{[c.platforms.join(', '), c.phone, c.email].filter(Boolean).join(' · ')}</div>
                </div>
                <button onClick={() => merge(c)} aria-label={`Merge ${c.name}`} className="px-3 py-1 text-xs font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800">Merge</button>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
