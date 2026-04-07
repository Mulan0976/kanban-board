import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Clock,
  Users,
  Palette,
  CheckSquare,
  Link2,
  Calendar,
  Timer,
  AlertCircle,
  ArrowRight,
  GripVertical,
  Check,
} from 'lucide-react';
import { Modal, Input, TextArea, Button, Badge, ColorPicker } from './UI';
import { useStore } from '../store';
import { api } from '../api';
import type { Task, Column, Checkpoint, TimeLog, Assignee, Board } from '../types';
import { formatDuration, getTaskProgress, hexToRgba } from '../types';

interface TaskModalProps {
  task: Task;
  columnId: string;
  board: Board;
  onClose: () => void;
  permission: 'owner' | 'edit' | 'view';
}

export default function TaskModal({ task: initialTask, columnId, board, onClose, permission }: TaskModalProps) {
  const updateTaskInStore = useStore((s) => s.updateTask);
  const removeTaskFromStore = useStore((s) => s.removeTask);
  const moveTask = useStore((s) => s.moveTask);

  const [task, setTask] = useState<Task>(initialTask);
  const [title, setTitle] = useState(initialTask.title);
  const [content, setContent] = useState(initialTask.content);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [newCheckpointTitle, setNewCheckpointTitle] = useState('');
  const [editingCheckpointId, setEditingCheckpointId] = useState<string | null>(null);
  const [editingCheckpointTitle, setEditingCheckpointTitle] = useState('');
  const [newAssigneeName, setNewAssigneeName] = useState('');
  const [durationDays, setDurationDays] = useState(Math.floor(initialTask.durationMinutes / 1440));
  const [durationHours, setDurationHours] = useState(Math.floor((initialTask.durationMinutes % 1440) / 60));
  const [durationMins, setDurationMins] = useState(initialTask.durationMinutes % 60);
  const [timeLogUser, setTimeLogUser] = useState('');
  const [timeLogMinutes, setTimeLogMinutes] = useState('');
  const [showTimeLogForm, setShowTimeLogForm] = useState(false);
  const [depSearch, setDepSearch] = useState('');
  const [showDepSearch, setShowDepSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  const readOnly = permission === 'view';
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Current column info
  const currentColumn = useMemo(
    () => board.columns.find((c) => c.id === columnId),
    [board.columns, columnId]
  );

  // All tasks across board (for dependencies)
  const allTasks = useMemo(() => {
    const tasks: { task: Task; columnTitle: string }[] = [];
    for (const col of board.columns) {
      for (const t of col.tasks) {
        if (t.id !== task.id) {
          tasks.push({ task: t, columnTitle: col.title });
        }
      }
    }
    return tasks;
  }, [board.columns, task.id]);

  // Filtered dependency search results
  const depSearchResults = useMemo(() => {
    if (!depSearch.trim()) return allTasks.slice(0, 10);
    const q = depSearch.toLowerCase();
    return allTasks.filter(
      (t) =>
        t.task.title.toLowerCase().includes(q) ||
        t.columnTitle.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [allTasks, depSearch]);

  // Dependency task info
  const dependencyTasks = useMemo(() => {
    return (task.dependencyIds || [])
      .map((depId) => {
        for (const col of board.columns) {
          const t = col.tasks.find((t) => t.id === depId);
          if (t) return { task: t, columnTitle: col.title };
        }
        return null;
      })
      .filter(Boolean) as { task: Task; columnTitle: string }[];
  }, [task.dependencyIds, board.columns]);

  // Done column detection
  const doneColumn = useMemo(
    () => board.columns.find((c) => c.isDoneColumn),
    [board.columns]
  );

  // Checkpoint progress
  const progress = getTaskProgress(task);
  const allCheckpointsDone =
    task.checkpoints.length > 0 && task.checkpoints.every((cp) => cp.isCompleted);
  const isInDoneColumn = currentColumn?.isDoneColumn === true;

  // Total time logged
  const totalTimeLogged = useMemo(
    () => task.timeLogs.reduce((sum, tl) => sum + tl.minutes, 0),
    [task.timeLogs]
  );

  // Debounced title save
  useEffect(() => {
    if (readOnly) return;
    if (title === task.title) return;
    if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    titleDebounceRef.current = setTimeout(async () => {
      try {
        await api.tasks.update(task.id, { title });
        updateTaskInStore(task.id, { title });
        setTask((prev) => ({ ...prev, title }));
      } catch (err) {
        console.error('Failed to update title:', err);
      }
    }, 500);
    return () => {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
    };
  }, [title, task.id, task.title, readOnly, updateTaskInStore]);

  // Debounced content save
  useEffect(() => {
    if (readOnly) return;
    if (content === task.content) return;
    if (contentDebounceRef.current) clearTimeout(contentDebounceRef.current);
    contentDebounceRef.current = setTimeout(async () => {
      try {
        await api.tasks.update(task.id, { content });
        updateTaskInStore(task.id, { content });
        setTask((prev) => ({ ...prev, content }));
      } catch (err) {
        console.error('Failed to update content:', err);
      }
    }, 500);
    return () => {
      if (contentDebounceRef.current) clearTimeout(contentDebounceRef.current);
    };
  }, [content, task.id, task.content, readOnly, updateTaskInStore]);

  // Color change
  const handleColorChange = useCallback(
    async (color: string | null) => {
      if (readOnly) return;
      try {
        await api.tasks.update(task.id, { color });
        updateTaskInStore(task.id, { color });
        setTask((prev) => ({ ...prev, color }));
      } catch (err) {
        console.error('Failed to update color:', err);
      }
    },
    [task.id, readOnly, updateTaskInStore]
  );

  // Assignee management
  const handleAddAssignee = useCallback(async () => {
    if (readOnly || !newAssigneeName.trim()) return;
    const name = newAssigneeName.trim();
    const newAssignees = [...task.assignees, { id: crypto.randomUUID(), name }];
    try {
      await api.tasks.update(task.id, { assignees: newAssignees });
      updateTaskInStore(task.id, { assignees: newAssignees });
      setTask((prev) => ({ ...prev, assignees: newAssignees }));
      setNewAssigneeName('');
    } catch (err) {
      console.error('Failed to add assignee:', err);
    }
  }, [readOnly, newAssigneeName, task, updateTaskInStore]);

  const handleRemoveAssignee = useCallback(
    async (assigneeId: string) => {
      if (readOnly) return;
      const newAssignees = task.assignees.filter((a) => a.id !== assigneeId);
      try {
        await api.tasks.update(task.id, { assignees: newAssignees });
        updateTaskInStore(task.id, { assignees: newAssignees });
        setTask((prev) => ({ ...prev, assignees: newAssignees }));
      } catch (err) {
        console.error('Failed to remove assignee:', err);
      }
    },
    [readOnly, task, updateTaskInStore]
  );

  // Checkpoint management
  const handleAddCheckpoint = useCallback(async () => {
    if (readOnly || !newCheckpointTitle.trim()) return;
    try {
      const cp = await api.tasks.addCheckpoint(task.id, newCheckpointTitle.trim());
      const newCheckpoints = [...task.checkpoints, cp];
      updateTaskInStore(task.id, { checkpoints: newCheckpoints });
      setTask((prev) => ({ ...prev, checkpoints: newCheckpoints }));
      setNewCheckpointTitle('');
    } catch (err) {
      console.error('Failed to add checkpoint:', err);
    }
  }, [readOnly, newCheckpointTitle, task, updateTaskInStore]);

  const handleToggleCheckpoint = useCallback(
    async (cp: Checkpoint) => {
      if (readOnly) return;
      try {
        await api.tasks.updateCheckpoint(cp.id, { isCompleted: !cp.isCompleted });
        const newCheckpoints = task.checkpoints.map((c) =>
          c.id === cp.id ? { ...c, isCompleted: !c.isCompleted } : c
        );
        updateTaskInStore(task.id, { checkpoints: newCheckpoints });
        setTask((prev) => ({ ...prev, checkpoints: newCheckpoints }));
      } catch (err) {
        console.error('Failed to toggle checkpoint:', err);
      }
    },
    [readOnly, task, updateTaskInStore]
  );

  const handleDeleteCheckpoint = useCallback(
    async (cpId: string) => {
      if (readOnly) return;
      try {
        await api.tasks.deleteCheckpoint(cpId);
        const newCheckpoints = task.checkpoints.filter((c) => c.id !== cpId);
        updateTaskInStore(task.id, { checkpoints: newCheckpoints });
        setTask((prev) => ({ ...prev, checkpoints: newCheckpoints }));
      } catch (err) {
        console.error('Failed to delete checkpoint:', err);
      }
    },
    [readOnly, task, updateTaskInStore]
  );

  const handleSaveCheckpointTitle = useCallback(
    async (cpId: string) => {
      if (readOnly || !editingCheckpointTitle.trim()) {
        setEditingCheckpointId(null);
        return;
      }
      try {
        await api.tasks.updateCheckpoint(cpId, { title: editingCheckpointTitle.trim() });
        const newCheckpoints = task.checkpoints.map((c) =>
          c.id === cpId ? { ...c, title: editingCheckpointTitle.trim() } : c
        );
        updateTaskInStore(task.id, { checkpoints: newCheckpoints });
        setTask((prev) => ({ ...prev, checkpoints: newCheckpoints }));
        setEditingCheckpointId(null);
      } catch (err) {
        console.error('Failed to update checkpoint title:', err);
      }
    },
    [readOnly, editingCheckpointTitle, task, updateTaskInStore]
  );

  const handleMoveCheckpoint = useCallback(
    async (cpId: string, direction: 'up' | 'down') => {
      if (readOnly) return;
      const idx = task.checkpoints.findIndex((c) => c.id === cpId);
      if (idx === -1) return;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= task.checkpoints.length) return;

      const newCheckpoints = [...task.checkpoints];
      const temp = newCheckpoints[idx];
      newCheckpoints[idx] = newCheckpoints[newIdx];
      newCheckpoints[newIdx] = temp;
      const reindexed = newCheckpoints.map((cp, i) => ({ ...cp, position: i }));

      // Update all checkpoint positions
      try {
        await api.tasks.update(task.id, { checkpoints: reindexed });
        updateTaskInStore(task.id, { checkpoints: reindexed });
        setTask((prev) => ({ ...prev, checkpoints: reindexed }));
      } catch (err) {
        console.error('Failed to reorder checkpoints:', err);
      }
    },
    [readOnly, task, updateTaskInStore]
  );

  // Duration save
  const handleSaveDuration = useCallback(async () => {
    if (readOnly) return;
    const totalMinutes = durationDays * 1440 + durationHours * 60 + durationMins;
    try {
      await api.tasks.update(task.id, { durationMinutes: totalMinutes });
      updateTaskInStore(task.id, { durationMinutes: totalMinutes });
      setTask((prev) => ({ ...prev, durationMinutes: totalMinutes }));
    } catch (err) {
      console.error('Failed to update duration:', err);
    }
  }, [readOnly, durationDays, durationHours, durationMins, task.id, updateTaskInStore]);

  // Time log
  const handleAddTimeLog = useCallback(async () => {
    if (readOnly || !timeLogUser.trim() || !timeLogMinutes) return;
    const mins = parseInt(timeLogMinutes, 10);
    if (isNaN(mins) || mins <= 0) return;
    try {
      const tl = await api.tasks.addTimeLog(task.id, timeLogUser.trim(), mins);
      const newTimeLogs = [...task.timeLogs, tl];
      updateTaskInStore(task.id, { timeLogs: newTimeLogs });
      setTask((prev) => ({ ...prev, timeLogs: newTimeLogs }));
      setTimeLogUser('');
      setTimeLogMinutes('');
      setShowTimeLogForm(false);
    } catch (err) {
      console.error('Failed to add time log:', err);
    }
  }, [readOnly, timeLogUser, timeLogMinutes, task, updateTaskInStore]);

  // Dependencies
  const handleAddDependency = useCallback(
    async (depId: string) => {
      if (readOnly) return;
      if (task.dependencyIds.includes(depId)) return;
      try {
        await api.tasks.addDependency(task.id, depId);
        const newDeps = [...task.dependencyIds, depId];
        updateTaskInStore(task.id, { dependencyIds: newDeps });
        setTask((prev) => ({ ...prev, dependencyIds: newDeps }));
        setShowDepSearch(false);
        setDepSearch('');
      } catch (err) {
        console.error('Failed to add dependency:', err);
      }
    },
    [readOnly, task, updateTaskInStore]
  );

  const handleRemoveDependency = useCallback(
    async (depId: string) => {
      if (readOnly) return;
      try {
        await api.tasks.removeDependency(task.id, depId);
        const newDeps = task.dependencyIds.filter((id) => id !== depId);
        updateTaskInStore(task.id, { dependencyIds: newDeps });
        setTask((prev) => ({ ...prev, dependencyIds: newDeps }));
      } catch (err) {
        console.error('Failed to remove dependency:', err);
      }
    },
    [readOnly, task, updateTaskInStore]
  );

  // Move to done column
  const handleMoveToDone = useCallback(async () => {
    if (readOnly || !doneColumn) return;
    try {
      const movedTask = await api.tasks.move(task.id, doneColumn.id, 0);
      moveTask(task.id, columnId, doneColumn.id, 0, movedTask);
      onClose();
    } catch (err) {
      console.error('Failed to move task to done:', err);
    }
  }, [readOnly, doneColumn, task.id, columnId, moveTask, onClose]);

  // Delete task
  const handleDelete = useCallback(async () => {
    if (readOnly) return;
    try {
      await api.tasks.delete(task.id);
      removeTaskFromStore(task.id, columnId);
      onClose();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  }, [readOnly, task.id, columnId, removeTaskFromStore, onClose]);

  return (
    <Modal isOpen={true} onClose={onClose} title="" width="max-w-4xl">
      <div className="flex flex-col lg:flex-row gap-6 -mt-2">
        {/* ======== LEFT COLUMN: Title, Content, Checkpoints ======== */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Title */}
          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              readOnly={readOnly}
              placeholder="Task title..."
              className="w-full bg-transparent text-xl font-semibold text-gray-100 placeholder-gray-600 border-none outline-none"
              style={{ fontFamily: "'Syne', sans-serif" }}
            />
            <div className="flex items-center gap-2 mt-1">
              {currentColumn && (
                <Badge variant="info">{currentColumn.title}</Badge>
              )}
              {task.completedAt && <Badge variant="success">Completed</Badge>}
            </div>
          </div>

          {/* Content / Description */}
          <div className="space-y-1.5">
            <label className="block text-xs text-gray-500 font-medium tracking-wide uppercase">
              Description
            </label>
            <TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              readOnly={readOnly}
              placeholder="Add a description..."
              className="min-h-[120px]"
            />
          </div>

          {/* Checkpoints / Goals */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare size={14} className="text-emerald-400" />
                <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                  Checkpoints
                </span>
              </div>
              {task.checkpoints.length > 0 && (
                <span className="text-xs text-gray-500 font-mono">{progress}%</span>
              )}
            </div>

            {/* Progress bar */}
            {task.checkpoints.length > 0 && (
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${progress}%`,
                    boxShadow: progress > 0 ? '0 0 10px rgba(34,197,94,0.4)' : 'none',
                  }}
                />
              </div>
            )}

            {/* Checkpoint list */}
            <div className="space-y-1">
              {task.checkpoints
                .sort((a, b) => a.position - b.position)
                .map((cp, idx) => (
                  <div
                    key={cp.id}
                    className="flex items-center gap-2 group py-1.5 px-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => handleToggleCheckpoint(cp)}
                      disabled={readOnly}
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 ${
                        cp.isCompleted
                          ? 'bg-emerald-600 border-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]'
                          : 'border-white/20 hover:border-emerald-400/50'
                      }`}
                    >
                      {cp.isCompleted && <Check size={12} className="text-white" />}
                    </button>

                    {/* Title (inline edit) */}
                    {editingCheckpointId === cp.id ? (
                      <input
                        value={editingCheckpointTitle}
                        onChange={(e) => setEditingCheckpointTitle(e.target.value)}
                        onBlur={() => handleSaveCheckpointTitle(cp.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveCheckpointTitle(cp.id);
                          if (e.key === 'Escape') setEditingCheckpointId(null);
                        }}
                        autoFocus
                        className="flex-1 bg-white/[0.03] border border-emerald-500/30 rounded px-2 py-0.5 text-sm text-gray-200 outline-none"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      />
                    ) : (
                      <span
                        className={`flex-1 text-sm cursor-pointer ${
                          cp.isCompleted ? 'text-gray-600 line-through' : 'text-gray-300'
                        }`}
                        onClick={() => {
                          if (!readOnly) {
                            setEditingCheckpointId(cp.id);
                            setEditingCheckpointTitle(cp.title);
                          }
                        }}
                      >
                        {cp.title}
                      </span>
                    )}

                    {/* Reorder and delete buttons */}
                    {!readOnly && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleMoveCheckpoint(cp.id, 'up')}
                          disabled={idx === 0}
                          className="p-0.5 text-gray-600 hover:text-gray-400 disabled:opacity-30"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => handleMoveCheckpoint(cp.id, 'down')}
                          disabled={idx === task.checkpoints.length - 1}
                          className="p-0.5 text-gray-600 hover:text-gray-400 disabled:opacity-30"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteCheckpoint(cp.id)}
                          className="p-0.5 text-gray-600 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {/* Add checkpoint */}
            {!readOnly && (
              <div className="flex items-center gap-2">
                <input
                  value={newCheckpointTitle}
                  onChange={(e) => setNewCheckpointTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddCheckpoint();
                  }}
                  placeholder="Add a checkpoint..."
                  className="flex-1 bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-1.5 text-sm text-gray-300 placeholder-gray-700 outline-none focus:border-emerald-500/30"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
                <Button size="sm" variant="ghost" onClick={handleAddCheckpoint}>
                  <Plus size={14} />
                </Button>
              </div>
            )}

            {/* Move to done prompt */}
            {allCheckpointsDone && !isInDoneColumn && doneColumn && !readOnly && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <AlertCircle size={16} className="text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-emerald-300 flex-1">
                  All checkpoints complete! Move to done?
                </span>
                <Button size="sm" onClick={handleMoveToDone}>
                  <ArrowRight size={14} />
                  Move
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ======== RIGHT COLUMN: Metadata ======== */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-4">
          {/* Color */}
          <div className="glass rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Palette size={14} className="text-emerald-400" />
              <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                Color
              </span>
            </div>
            {readOnly ? (
              <div className="flex items-center gap-2">
                {task.color ? (
                  <div
                    className="w-6 h-6 rounded-full border border-white/10"
                    style={{ backgroundColor: task.color }}
                  />
                ) : (
                  <span className="text-xs text-gray-600">None</span>
                )}
              </div>
            ) : (
              <ColorPicker value={task.color} onChange={handleColorChange} />
            )}
          </div>

          {/* Assignees */}
          <div className="glass rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-emerald-400" />
              <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                Assignees
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {task.assignees.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/[0.04] border border-[rgba(255,255,255,0.08)] rounded-full text-xs text-gray-300"
                >
                  {a.name}
                  {!readOnly && (
                    <button
                      onClick={() => handleRemoveAssignee(a.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors ml-0.5"
                    >
                      <X size={10} />
                    </button>
                  )}
                </span>
              ))}
              {task.assignees.length === 0 && (
                <span className="text-xs text-gray-600">No assignees</span>
              )}
            </div>
            {!readOnly && (
              <div className="flex items-center gap-1.5 mt-1">
                <input
                  value={newAssigneeName}
                  onChange={(e) => setNewAssigneeName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddAssignee();
                  }}
                  placeholder="Add assignee..."
                  className="flex-1 bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-700 outline-none focus:border-emerald-500/30"
                />
                <button
                  onClick={handleAddAssignee}
                  className="p-1 text-gray-600 hover:text-emerald-400 transition-colors"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Duration */}
          <div className="glass rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-emerald-400" />
              <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                Estimated Duration
              </span>
            </div>
            <div className="text-sm text-gray-300 font-mono">
              {formatDuration(task.durationMinutes) || '0m'}
            </div>
            {!readOnly && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-600 mb-0.5">Days</label>
                    <input
                      type="number"
                      min={0}
                      value={durationDays}
                      onChange={(e) => setDurationDays(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-emerald-500/30 font-mono"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-600 mb-0.5">Hours</label>
                    <input
                      type="number"
                      min={0}
                      max={23}
                      value={durationHours}
                      onChange={(e) => setDurationHours(Math.max(0, Math.min(23, parseInt(e.target.value) || 0)))}
                      className="w-full bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-emerald-500/30 font-mono"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-600 mb-0.5">Mins</label>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={durationMins}
                      onChange={(e) => setDurationMins(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                      className="w-full bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded px-2 py-1 text-xs text-gray-300 outline-none focus:border-emerald-500/30 font-mono"
                    />
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={handleSaveDuration} className="w-full">
                  Update Duration
                </Button>
              </div>
            )}
          </div>

          {/* Time Logs */}
          <div className="glass rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer size={14} className="text-emerald-400" />
                <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                  Time Logs
                </span>
              </div>
              <span className="text-xs text-gray-500 font-mono">
                Total: {formatDuration(totalTimeLogged)}
              </span>
            </div>

            {/* Time log list */}
            <div className="max-h-32 overflow-y-auto space-y-1">
              {task.timeLogs.length === 0 ? (
                <span className="text-xs text-gray-600">No time logged</span>
              ) : (
                task.timeLogs.map((tl) => (
                  <div
                    key={tl.id}
                    className="flex items-center justify-between py-1 px-1.5 rounded hover:bg-white/[0.02] text-xs"
                  >
                    <span className="text-gray-400">{tl.userName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 font-mono">
                        {formatDuration(tl.minutes)}
                      </span>
                      <span className="text-gray-700 text-[10px]">
                        {new Date(tl.loggedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Quick log form */}
            {!readOnly && (
              <>
                {showTimeLogForm ? (
                  <div className="space-y-2 pt-1 border-t border-[rgba(255,255,255,0.06)]">
                    <input
                      value={timeLogUser}
                      onChange={(e) => setTimeLogUser(e.target.value)}
                      placeholder="Your name..."
                      className="w-full bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-700 outline-none focus:border-emerald-500/30"
                    />
                    <input
                      type="number"
                      min={1}
                      value={timeLogMinutes}
                      onChange={(e) => setTimeLogMinutes(e.target.value)}
                      placeholder="Minutes..."
                      className="w-full bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-700 outline-none focus:border-emerald-500/30"
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={handleAddTimeLog} className="flex-1">
                        Log
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowTimeLogForm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowTimeLogForm(true)}
                    className="w-full"
                  >
                    <Plus size={12} />
                    Quick Log
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Dependencies */}
          <div className="glass rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-emerald-400" />
              <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                Dependencies
              </span>
            </div>

            {dependencyTasks.length === 0 ? (
              <span className="text-xs text-gray-600">No dependencies</span>
            ) : (
              <div className="space-y-1">
                {dependencyTasks.map((dep) => (
                  <div
                    key={dep.task.id}
                    className="flex items-center gap-2 py-1 px-1.5 rounded hover:bg-white/[0.02] group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-300 truncate">{dep.task.title}</div>
                      <div className="text-[10px] text-gray-600">{dep.columnTitle}</div>
                    </div>
                    {!readOnly && (
                      <button
                        onClick={() => handleRemoveDependency(dep.task.id)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-600 hover:text-red-400 transition-all"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add dependency */}
            {!readOnly && (
              <div className="relative">
                {showDepSearch ? (
                  <div className="space-y-1.5">
                    <input
                      value={depSearch}
                      onChange={(e) => setDepSearch(e.target.value)}
                      placeholder="Search tasks..."
                      autoFocus
                      className="w-full bg-white/[0.02] border border-emerald-500/30 rounded px-2 py-1 text-xs text-gray-300 placeholder-gray-700 outline-none"
                    />
                    <div className="max-h-36 overflow-y-auto space-y-0.5 border border-[rgba(255,255,255,0.06)] rounded-lg p-1">
                      {depSearchResults.length === 0 ? (
                        <div className="text-xs text-gray-600 p-2 text-center">No tasks found</div>
                      ) : (
                        depSearchResults
                          .filter((t) => !task.dependencyIds.includes(t.task.id))
                          .map((t) => (
                            <button
                              key={t.task.id}
                              onClick={() => handleAddDependency(t.task.id)}
                              className="w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors"
                            >
                              <div className="text-xs text-gray-300 truncate">{t.task.title}</div>
                              <div className="text-[10px] text-gray-600">{t.columnTitle}</div>
                            </button>
                          ))
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowDepSearch(false);
                        setDepSearch('');
                      }}
                      className="w-full"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setShowDepSearch(true)}
                    className="w-full"
                  >
                    <Plus size={12} />
                    Add Dependency
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="glass rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-emerald-400" />
              <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                Info
              </span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-600">Created</span>
                <span className="text-gray-400">
                  {new Date(task.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Column</span>
                <span className="text-gray-400">{currentColumn?.title || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Checkpoints</span>
                <span className="text-gray-400">
                  {task.checkpoints.filter((c) => c.isCompleted).length}/{task.checkpoints.length}
                </span>
              </div>
            </div>
          </div>

          {/* Delete Task */}
          {!readOnly && (
            <div className="pt-2">
              {deleteConfirm ? (
                <div className="space-y-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5">
                  <p className="text-xs text-red-400">
                    Are you sure? This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={handleDelete} className="flex-1">
                      <Trash2 size={12} />
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteConfirm(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setDeleteConfirm(true)}
                  className="w-full"
                >
                  <Trash2 size={12} />
                  Delete Task
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
