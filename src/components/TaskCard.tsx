import React, { useCallback, useMemo, useState } from 'react';
import {
  Edit3,
  Link,
  Clock,
  Trash2,
  GripVertical,
  CheckSquare,
  CheckCircle,
  Users,
  Target,
} from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import type { Task } from '../types';
import { hexToRgba, formatDuration, getTaskProgress } from '../types';
import { ConfirmDialog } from './UI';

interface TaskCardProps {
  task: Task;
  columnId: string;
  isSelected: boolean;
  onEdit: (task: Task) => void;
  onDragStart: (taskId: string, columnId: string, e: React.DragEvent) => void;
  onLinkStart: (taskId: string) => void;
  onLinkEnd: (taskId: string) => void;
  linkingFromTaskId: string | null;
  permission: 'owner' | 'edit' | 'view';
  onSelect: (taskId: string, e: React.MouseEvent) => void;
  onComplete?: (taskId: string, columnId: string) => void;
}

function TaskCard({
  task,
  columnId,
  isSelected,
  onEdit,
  onDragStart,
  onLinkStart,
  onLinkEnd,
  linkingFromTaskId,
  permission,
  onSelect,
  onComplete,
}: TaskCardProps) {
  const removeTask = useStore((s) => s.removeTask);
  const pushHistory = useStore((s) => s.pushHistory);
  const user = useStore((s) => s.user);
  const updateTask = useStore((s) => s.updateTask);

  const [showActions, setShowActions] = useState(false);
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [timeMinutes, setTimeMinutes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const canEdit = permission !== 'view';
  const isLinkTarget =
    linkingFromTaskId !== null && linkingFromTaskId !== task.id;
  const isLinkSource = linkingFromTaskId === task.id;

  // ============================================================
  // Progress
  // ============================================================
  const progress = useMemo(() => getTaskProgress(task), [task]);
  const hasCheckpoints = task.checkpoints.length > 0;
  const completedCheckpoints = task.checkpoints.filter((c) => c.isCompleted).length;
  const totalTimeLogs = task.timeLogs.reduce((sum, l) => sum + l.minutes, 0);

  // ============================================================
  // Click handler
  // ============================================================
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      // If in linking mode, complete the link
      if (linkingFromTaskId) {
        if (isLinkTarget) {
          onLinkEnd(task.id);
        }
        return;
      }

      // Ctrl+click for multi-select
      if (e.ctrlKey || e.metaKey) {
        onSelect(task.id, e);
        return;
      }

      // Normal click: edit
      onEdit(task);
    },
    [linkingFromTaskId, isLinkTarget, task, onLinkEnd, onSelect, onEdit]
  );

  // ============================================================
  // Drag handlers
  // ============================================================
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      onDragStart(task.id, columnId, e);
    },
    [task.id, columnId, onDragStart]
  );

  // ============================================================
  // Delete handler
  // ============================================================
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canEdit) return;
      setShowDeleteConfirm(true);
    },
    [canEdit]
  );

  const handleDeleteConfirm = useCallback(
    async () => {
      setShowDeleteConfirm(false);
      try {
        await api.tasks.delete(task.id);
        removeTask(task.id, columnId);
        pushHistory({
          type: 'deleteTask',
          task,
          columnId,
          label: `Delete task "${task.title}"`,
        });
      } catch {}
    },
    [task, columnId, removeTask, pushHistory]
  );

  // ============================================================
  // Quick time log
  // ============================================================
  const handleQuickTimeLog = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canEdit) return;
      setShowTimeInput(true);
    },
    [canEdit]
  );

  const submitTimeLog = useCallback(
    async () => {
      const mins = parseInt(timeMinutes, 10);
      if (isNaN(mins) || mins <= 0) {
        setShowTimeInput(false);
        setTimeMinutes('');
        return;
      }

      try {
        const log = await api.tasks.addTimeLog(
          task.id,
          user?.displayName || 'Anonymous',
          mins
        );
        updateTask(task.id, { timeLogs: [...task.timeLogs, log] });
      } catch {
        // handle silently
      }

      setShowTimeInput(false);
      setTimeMinutes('');
    },
    [timeMinutes, task.id, task.timeLogs, user, updateTask]
  );

  // ============================================================
  // Link start handler
  // ============================================================
  const handleLinkClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!canEdit) return;
      onLinkStart(task.id);
    },
    [canEdit, task.id, onLinkStart]
  );

  // ============================================================
  // Edit handler
  // ============================================================
  const handleEditClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit(task);
    },
    [task, onEdit]
  );

  // ============================================================
  // Accent color
  // ============================================================
  const accentColor = task.color || '#22c55e';

  return (
    <div
      className={`group relative rounded-lg overflow-hidden transition-all duration-200 ${
        isSelected
          ? 'ring-2 ring-emerald-500/60 shadow-[0_0_20px_rgba(34,197,94,0.12)]'
          : ''
      } ${isLinkTarget ? 'ring-2 ring-blue-500/50 cursor-crosshair' : ''} ${
        isLinkSource ? 'ring-2 ring-emerald-500/80 shadow-[0_0_25px_rgba(34,197,94,0.2)]' : ''
      }`}
      style={{
        background: task.previewImage
          ? 'rgba(20, 20, 20, 0.8)'
          : 'rgba(20, 20, 20, 0.6)',
        border: isSelected
          ? '1px solid rgba(34, 197, 94, 0.3)'
          : isLinkTarget
          ? '1px solid rgba(59, 130, 246, 0.3)'
          : '1px solid rgba(255, 255, 255, 0.06)',
      }}
      data-task-id={task.id}
      draggable={canEdit}
      onDragStart={handleDragStart}
      onClick={handleClick}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        if (showTimeInput) {
          setShowTimeInput(false);
          setTimeMinutes('');
        }
      }}
    >
      {/* Preview image background */}
      {task.previewImage && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <img
            src={task.previewImage}
            alt=""
            className="w-full h-full opacity-25"
            style={{
              objectFit: 'cover',
              objectPosition: `center ${task.previewSettings?.offsetY ?? 50}%`,
              transform: `scale(${task.previewSettings?.zoom ?? 1})`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/80 to-transparent" />
        </div>
      )}

      {/* Left accent border */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: accentColor }}
      />

      {/* Card content */}
      <div className="relative z-10 p-3 pl-4">
        {/* Title */}
        <div className="flex items-start gap-2">
          <h4 className="text-sm font-medium text-[#f3f4f6] leading-snug flex-1 line-clamp-2">
            {task.title}
          </h4>

          {/* Drag handle (visible on hover) */}
          {canEdit && (
            <div
              className={`shrink-0 text-[#6b7280] cursor-grab active:cursor-grabbing transition-opacity ${
                showActions ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <GripVertical size={14} />
            </div>
          )}
        </div>

        {/* Content preview */}
        {task.content && (
          <p className="text-xs text-[#6b7280] mt-1 line-clamp-2 leading-relaxed">
            {task.content}
          </p>
        )}

        {/* Checkpoints - interactive list */}
        {hasCheckpoints && (
          <div className="mt-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare size={10} className="text-[#6b7280]" />
              <span className="text-[10px] text-[#6b7280] font-mono">
                {completedCheckpoints}/{task.checkpoints.length}
              </span>
              {/* Progress bar */}
              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: accentColor,
                    boxShadow: `0 0 8px ${hexToRgba(accentColor, 0.4)}`,
                  }}
                />
              </div>
            </div>
            <div className={`space-y-1 ${task.checkpoints.length > 8 ? 'max-h-[240px] overflow-y-auto' : ''}`}
              style={task.checkpoints.length > 8 ? { scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' } : undefined}
            >
              {task.checkpoints.map((cp) => (
                <button
                  key={cp.id}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!canEdit) return;
                    try {
                      const updated = await api.tasks.updateCheckpoint(cp.id, { isCompleted: !cp.isCompleted });
                      const newCps = task.checkpoints.map((c) => c.id === cp.id ? updated : c);
                      updateTask(task.id, { checkpoints: newCps });
                    } catch {}
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors bg-white/[0.03] ${
                    canEdit ? 'hover:bg-white/[0.08] cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                      cp.isCompleted
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-white/25 hover:border-emerald-500/50'
                    }`}
                  >
                    {cp.isCompleted && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-xs leading-snug truncate ${
                    cp.isCompleted ? 'text-[#6b7280] line-through' : 'text-[#e5e7eb]'
                  }`}>
                    {cp.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Meta badges row */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {/* Duration */}
          {task.durationMinutes > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white/5 rounded text-[10px] text-[#6b7280] font-mono">
              <Clock size={10} />
              {formatDuration(task.durationMinutes)}
            </span>
          )}

          {/* Time logged */}
          {totalTimeLogs > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 rounded text-[10px] text-blue-400 font-mono">
              <Clock size={10} />
              {formatDuration(totalTimeLogs)} logged
            </span>
          )}

          {/* Dependency count */}
          {task.dependencyIds.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/10 rounded text-[10px] text-purple-400">
              <Target size={10} />
              {task.dependencyIds.length} dep{task.dependencyIds.length > 1 ? 's' : ''}
            </span>
          )}

          {/* Assignees */}
          {task.assignees.length > 0 && (
            <div className="flex items-center gap-1">
              {task.assignees.slice(0, 3).map((assignee) => (
                <div
                  key={assignee.id}
                  className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[8px] text-emerald-400 font-medium border border-emerald-500/20"
                  title={assignee.name}
                >
                  {assignee.name.charAt(0).toUpperCase()}
                </div>
              ))}
              {task.assignees.length > 3 && (
                <span className="text-[10px] text-[#6b7280]">
                  +{task.assignees.length - 3}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quick time log input */}
        {showTimeInput && (
          <div
            className="mt-2 flex gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              type="number"
              min={1}
              value={timeMinutes}
              onChange={(e) => setTimeMinutes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTimeLog();
                if (e.key === 'Escape') {
                  setShowTimeInput(false);
                  setTimeMinutes('');
                }
              }}
              placeholder="mins"
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-[#f3f4f6] font-mono focus:outline-none focus:border-emerald-500/50 w-16"
            />
            <button
              onClick={submitTimeLog}
              className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded text-[10px] hover:bg-emerald-500/30 transition-colors"
            >
              Log
            </button>
          </div>
        )}

        {/* Hover action buttons */}
        {showActions && canEdit && !showTimeInput && (
          <div
            className="absolute top-2 right-2 flex items-center gap-0.5 bg-[#0a0a0a]/90 backdrop-blur-sm rounded-lg border border-white/10 p-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleEditClick}
              className="p-1.5 rounded hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors"
              title="Edit task"
            >
              <Edit3 size={12} />
            </button>
            <button
              onClick={handleLinkClick}
              className="p-1.5 rounded hover:bg-white/10 text-[#6b7280] hover:text-blue-400 transition-colors"
              title="Create dependency link"
            >
              <Link size={12} />
            </button>
            <button
              onClick={handleQuickTimeLog}
              className="p-1.5 rounded hover:bg-white/10 text-[#6b7280] hover:text-amber-400 transition-colors"
              title="Log time"
            >
              <Clock size={12} />
            </button>
            <button
              onClick={handleDeleteClick}
              className="p-1.5 rounded hover:bg-red-500/20 text-[#6b7280] hover:text-red-400 transition-colors"
              title="Delete task"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Link target glow effect */}
      {isLinkTarget && (
        <div
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{
            boxShadow: 'inset 0 0 20px rgba(59, 130, 246, 0.1)',
          }}
        />
      )}

      {/* Hover lift effect */}
      <style>{`
        .group:hover {
          transform: translateY(-1px);
        }
      `}</style>

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Task"
        message={`Are you sure you want to delete "${task.title || 'Untitled'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

export default React.memo(TaskCard);
