import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2, Clock, ChevronDown } from 'lucide-react';
import { apiService } from '../../context/MessagingContext';
import { aiApi, type AgentSummary, type Channel } from '../../services/aiApi';

interface BreakPeriod {
  id: string;
  start: string;
  end: string;
}

interface AiScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

export const AiScheduleModal: React.FC<AiScheduleModalProps> = ({ isOpen, onClose, onSave }) => {
  const [selectedDays, setSelectedDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [isDaysDropdownOpen, setIsDaysDropdownOpen] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [breaks, setBreaks] = useState<BreakPeriod[]>([]);

  // API mode: auto-reply is set per channel with one answering agent (the schedule is mock-only).
  const [channels, setChannels] = useState<Channel[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [agentId, setAgentId] = useState('');
  const [enabledIds, setEnabledIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !apiService) return;
    setError('');
    Promise.all([aiApi.listChannels(), aiApi.listAgents()]).then(([channelList, agentList]) => {
      const enabled = channelList.filter(c => c.ai_enabled);
      setChannels(channelList);
      setAgents(agentList);
      setAgentId(enabled[0]?.ai_agent_id ?? agentList[0]?.id ?? '');
      setEnabledIds((enabled.length ? enabled : channelList).map(c => c.id));
    }).catch(err => setError(err.message));
  }, [isOpen]);

  if (!isOpen) return null;

  const saveAutoReply = async () => {
    try {
      await Promise.all(channels.map(c => aiApi.updateChannel(c.id, enabledIds.includes(c.id)
        ? { ai_enabled: true, ai_agent_id: agentId }
        : { ai_enabled: false })));
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  };

  const addBreak = () => {
    setBreaks([...breaks, { id: Date.now().toString(), start: '12:00', end: '13:00' }]);
  };

  const removeBreak = (id: string) => {
    setBreaks(breaks.filter(b => b.id !== id));
  };

  const updateBreak = (id: string, field: 'start' | 'end', value: string) => {
    setBreaks(breaks.map(b => b.id === id ? { ...b, [field]: value } : b));
  };

  const toggleDay = (day: string) => {
    if (selectedDays.includes(day)) {
      setSelectedDays(selectedDays.filter(d => d !== day));
    } else {
      setSelectedDays([...selectedDays, day]);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 text-[var(--color-brand-text)]">
            <Clock size={20} className="text-blue-600" />
            <h2 className="font-semibold text-lg">{apiService ? 'AI Auto-Reply' : 'AI Automation Schedule'}</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1.5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 flex-1 overflow-y-auto max-h-[60vh]">
          <p className="text-sm text-[var(--color-brand-text-secondary)] mb-6">
            {apiService
              ? 'Choose the agent that answers new customer messages, and the channels it answers on.'
              : 'Configure when the AI should automatically reply to incoming messages.'}
          </p>

          {apiService ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-[var(--color-brand-text)] mb-3">Agent</h3>
                {agents.length ? (
                  <select
                    aria-label="Answering agent"
                    value={agentId}
                    onChange={e => setAgentId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  >
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                ) : (
                  <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg text-center border border-dashed border-gray-200">
                    Create an agent in AI Playground first.
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-[var(--color-brand-text)] mb-3">Channels</h3>
                <div className="space-y-1">
                  {channels.map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enabledIds.includes(c.id)}
                        onChange={() => setEnabledIds(ids => ids.includes(c.id) ? ids.filter(id => id !== c.id) : [...ids, c.id])}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-[var(--color-brand-text)]">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            </div>
          ) : (
          <div className="space-y-6">
            {/* Active Days */}
            <div>
              <h3 className="text-sm font-medium text-[var(--color-brand-text)] mb-3">Active Days</h3>
              <div className="relative">
                <button 
                  onClick={() => setIsDaysDropdownOpen(!isDaysDropdownOpen)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-left flex justify-between items-center bg-white hover:bg-gray-50 transition-colors"
                >
                  <span className="truncate pr-4">
                    {selectedDays.length === 7 ? 'Every day' : 
                     selectedDays.length === 5 && !selectedDays.includes('Saturday') && !selectedDays.includes('Sunday') ? 'Weekdays' :
                     selectedDays.length === 0 ? 'No days selected' :
                     selectedDays.join(', ')}
                  </span>
                  <ChevronDown size={16} className="text-gray-400 shrink-0" />
                </button>
                
                {isDaysDropdownOpen && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden py-1">
                    {DAYS_OF_WEEK.map(day => (
                      <label key={day} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedDays.includes(day)}
                          onChange={() => toggleDay(day)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-[var(--color-brand-text)]">{day}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Active Hours */}
            <div>
              <h3 className="text-sm font-medium text-[var(--color-brand-text)] mb-3">Active Hours</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-[var(--color-brand-text-secondary)] mb-1">Start Time</label>
                  <input 
                    type="time" 
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
                <div className="text-gray-400 mt-5">to</div>
                <div className="flex-1">
                  <label className="block text-xs text-[var(--color-brand-text-secondary)] mb-1">End Time</label>
                  <input 
                    type="time" 
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Breaks */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-[var(--color-brand-text)]">Pause During Breaks</h3>
                <button 
                  onClick={addBreak}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-md transition-colors"
                >
                  <Plus size={14} />
                  Add Break
                </button>
              </div>
              
              {breaks.length === 0 ? (
                <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded-lg text-center border border-dashed border-gray-200">
                  No breaks scheduled. AI will run continuously during active hours.
                </div>
              ) : (
                <div className="space-y-3">
                  {breaks.map((b) => (
                    <div key={b.id} className="flex items-center gap-3">
                      <input 
                        type="time" 
                        value={b.start}
                        onChange={(e) => updateBreak(b.id, 'start', e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <span className="text-gray-400 text-sm">to</span>
                      <input 
                        type="time" 
                        value={b.end}
                        onChange={(e) => updateBreak(b.id, 'end', e.target.value)}
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      />
                      <button 
                        onClick={() => removeBreak(b.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                        title="Remove break"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[var(--color-brand-text)] hover:bg-gray-100 border border-transparent rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={() => {
              if (apiService) return saveAutoReply();
              onSave();
              onClose();
            }}
            disabled={!!apiService && !agents.length}
            className="disabled:opacity-60 px-6 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-sm rounded-lg transition-colors"
          >
            Enable Automation
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
