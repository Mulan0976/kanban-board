import React, { useState, useMemo, useCallback } from 'react';
import { Clock, Plus, Timer, User } from 'lucide-react';
import { Modal, Input, Button } from './UI';
import { useStore } from '../store';
import { api } from '../api';
import type { Task, TimeLog } from '../types';
import { formatDuration } from '../types';

interface TimeLogModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  permission: 'owner' | 'edit' | 'view';
}

export default function TimeLogModal({ task, isOpen, onClose, permission }: TimeLogModalProps) {
  const updateTaskInStore = useStore((s) => s.updateTask);

  const [userName, setUserName] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [localTimeLogs, setLocalTimeLogs] = useState<TimeLog[]>(task.timeLogs);

  const readOnly = permission === 'view';

  const totalTimeLogged = useMemo(
    () => localTimeLogs.reduce((sum, tl) => sum + tl.minutes, 0),
    [localTimeLogs]
  );

  const handleLog = useCallback(async () => {
    if (readOnly) return;
    setError('');

    const name = userName.trim();
    if (!name) {
      setError('Please enter your name.');
      return;
    }

    const h = parseInt(hours, 10) || 0;
    const m = parseInt(minutes, 10) || 0;
    const totalMins = h * 60 + m;

    if (totalMins <= 0) {
      setError('Duration must be greater than 0.');
      return;
    }

    setLoading(true);
    try {
      const tl = await api.tasks.addTimeLog(task.id, name, totalMins);
      const updatedLogs = [...localTimeLogs, tl];
      setLocalTimeLogs(updatedLogs);
      updateTaskInStore(task.id, { timeLogs: updatedLogs });
      setUserName('');
      setHours('');
      setMinutes('');
    } catch (err: any) {
      setError(err.message || 'Failed to log time.');
    } finally {
      setLoading(false);
    }
  }, [readOnly, userName, hours, minutes, task.id, localTimeLogs, updateTaskInStore]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Time Tracking" width="max-w-md">
      <div className="space-y-5">
        {/* Task title */}
        <div className="flex items-center gap-2 pb-3 border-b border-[rgba(255,255,255,0.06)]">
          <Timer size={16} className="text-emerald-400 flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-sm text-gray-200 font-medium truncate">{task.title}</div>
            <div className="text-xs text-gray-500 font-mono mt-0.5">
              Total logged: {formatDuration(totalTimeLogged)}
            </div>
          </div>
        </div>

        {/* Quick log form */}
        {!readOnly && (
          <div className="space-y-3 p-4 glass rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Plus size={14} className="text-emerald-400" />
              <span
                className="text-sm font-medium text-gray-300"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Quick Log
              </span>
            </div>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[10px] text-gray-600 mb-1 uppercase tracking-wider">
                  Name
                </label>
                <div className="relative">
                  <User
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"
                  />
                  <input
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder="Your name..."
                    className="w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-700 outline-none focus:border-emerald-500/30 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleLog();
                    }}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-600 mb-1 uppercase tracking-wider">
                    Hours
                  </label>
                  <div className="relative">
                    <Clock
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600"
                    />
                    <input
                      type="number"
                      min={0}
                      value={hours}
                      onChange={(e) => setHours(e.target.value)}
                      placeholder="0"
                      className="w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg pl-8 pr-3 py-2 text-sm text-gray-200 placeholder-gray-700 outline-none focus:border-emerald-500/30 font-mono transition-colors"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-600 mb-1 uppercase tracking-wider">
                    Minutes
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    placeholder="0"
                    className="w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-700 outline-none focus:border-emerald-500/30 font-mono transition-colors"
                  />
                </div>
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              <Button onClick={handleLog} disabled={loading} className="w-full">
                {loading ? 'Logging...' : 'Log Time'}
              </Button>
            </div>
          </div>
        )}

        {/* History */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span
              className="text-sm font-medium text-gray-400"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              History
            </span>
            <span className="text-xs text-gray-600">{localTimeLogs.length} entries</span>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1">
            {localTimeLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-gray-600">
                <Clock size={24} className="mb-2 opacity-50" />
                <span className="text-xs">No time logs yet</span>
              </div>
            ) : (
              [...localTimeLogs]
                .sort(
                  (a, b) =>
                    new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
                )
                .map((tl) => (
                  <div
                    key={tl.id}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] text-emerald-400 font-bold uppercase">
                          {tl.userName.charAt(0)}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-gray-300 truncate">{tl.userName}</div>
                        <div className="text-[10px] text-gray-600">
                          {new Date(tl.loggedAt).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-emerald-400 font-mono font-medium flex-shrink-0 ml-3">
                      {formatDuration(tl.minutes)}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>

        {/* Summary bar */}
        {localTimeLogs.length > 0 && (
          <div className="flex items-center justify-between p-3 glass rounded-xl border border-emerald-500/10">
            <span className="text-xs text-gray-500 uppercase tracking-wider">Total Time</span>
            <span
              className="text-lg font-semibold text-emerald-400 font-mono"
              style={{ textShadow: '0 0 12px rgba(34,197,94,0.3)' }}
            >
              {formatDuration(totalTimeLogged)}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
