import React, { useCallback, useMemo, useState } from 'react';
import {
  X,
  Search,
  ArrowUpDown,
  CheckSquare,
  RotateCcw,
  Clock,
  Users,
  Inbox,
} from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import type { Board, Task, Column } from '../types';
import { formatDuration, getTaskProgress } from '../types';

type SortKey = 'completedAt' | 'createdAt' | 'title';

interface CompletedSidebarProps {
  board: Board;
  onClose: () => void;
  onEditTask: (task: Task) => void;
  permission: 'owner' | 'edit' | 'view';
  onTaskDrop?: (taskId: string, sourceColumnId: string) => void;
}

function CompletedSidebar({
  board,
  onClose,
  onEditTask,
  permission,
  onTaskDrop,
}: CompletedSidebarProps) {
  const moveTask = useStore((s) => s.moveTask);
  const pushHistory = useStore((s) => s.pushHistory);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('completedAt');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const canEdit = permission !== 'view';

  // ============================================================
  // Gather completed tasks from done columns
  // ============================================================
  const allCompletedTasks = useMemo(() => {
    const tasks: { task: Task; column: Column }[] = [];
    for (const col of board.columns) {
      for (const task of col.tasks) {
        if (task.completedAt) {
          tasks.push({ task, column: col });
        }
      }
    }
    return tasks;
  }, [board.columns]);

  // ============================================================
  // Filter and sort
  // ============================================================
  const filteredTasks = useMemo(() => {
    let result = allCompletedTasks;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        ({ task }) =>
          task.title.toLowerCase().includes(q) ||
          task.content.toLowerCase().includes(q)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case 'completedAt': {
          const aDate = a.task.completedAt || a.task.createdAt;
          const bDate = b.task.completedAt || b.task.createdAt;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        }
        case 'createdAt':
          return (
            new Date(b.task.createdAt).getTime() -
            new Date(a.task.createdAt).getTime()
          );
        case 'title':
          return a.task.title.localeCompare(b.task.title);
        default:
          return 0;
      }
    });

    return result;
  }, [allCompletedTasks, searchQuery, sortKey]);

  // ============================================================
  // Restore task (move to first non-done column)
  // ============================================================
  const handleRestore = useCallback(
    async (task: Task, fromColumnId: string) => {
      if (!canEdit) return;

      const nonDoneColumn = board.columns.find((c) => !c.isDoneColumn);
      if (!nonDoneColumn) return;

      const position = nonDoneColumn.tasks.length;

      // Optimistic
      moveTask(task.id, fromColumnId, nonDoneColumn.id, position);

      try {
        await api.tasks.move(task.id, nonDoneColumn.id, position);
        pushHistory({
          type: 'moveTask',
          taskId: task.id,
          fromColumnId,
          toColumnId: nonDoneColumn.id,
          fromPosition: task.position,
          toPosition: position,
          label: `Restore task "${task.title}"`,
        });
      } catch {
        // Revert
        moveTask(task.id, nonDoneColumn.id, fromColumnId, task.position);
      }
    },
    [canEdit, board.columns, moveTask, pushHistory]
  );

  // ============================================================
  // Drop handlers (accept tasks dragged into sidebar)
  // ============================================================
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit || !onTaskDrop) return;
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    },
    [canEdit, onTaskDrop]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!canEdit || !onTaskDrop) return;

      try {
        const info = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (info && info.taskId && info.columnId) {
          onTaskDrop(info.taskId, info.columnId);
        }
      } catch {
        // ignore invalid data
      }
    },
    [canEdit, onTaskDrop]
  );

  // ============================================================
  // Format date
  // ============================================================
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  };

  // Sort label
  const sortLabels: Record<SortKey, string> = {
    completedAt: 'Completed Date',
    createdAt: 'Created Date',
    title: 'Title',
  };

  return (
    <div
      className="absolute top-0 right-0 bottom-0 z-30 flex"
      style={{
        animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`w-[350px] h-full flex flex-col border-l transition-colors duration-200 ${isDragOver ? 'border-emerald-500/40' : ''}`}
        style={{
          background: isDragOver ? 'rgba(34, 197, 94, 0.05)' : 'rgba(10, 10, 10, 0.85)',
          backdropFilter: 'blur(30px)',
          WebkitBackdropFilter: 'blur(30px)',
          borderColor: isDragOver ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* ======== Header ======== */}
        <div className="shrink-0 px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckSquare size={16} className="text-emerald-400" />
              <h2 className="text-sm font-semibold text-[#f3f4f6] font-[Syne]">
                Completed
              </h2>
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[10px] font-mono border border-emerald-500/20">
                {allCompletedTasks.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative mb-2">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search completed tasks..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 placeholder:text-[#6b7280]/50"
            />
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-[#6b7280] hover:text-[#f3f4f6] hover:bg-white/5 rounded transition-colors"
            >
              <ArrowUpDown size={12} />
              Sort by: {sortLabels[sortKey]}
            </button>

            {showSortMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowSortMenu(false)}
                />
                <div className="absolute left-0 top-full mt-1 w-40 glass rounded-lg border border-white/10 py-1 z-50 animate-in">
                  {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setSortKey(key);
                        setShowSortMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                        sortKey === key
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-[#f3f4f6] hover:bg-white/10'
                      }`}
                    >
                      {sortLabels[key]}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ======== Task List ======== */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {filteredTasks.map(({ task, column }) => {
            const progress = getTaskProgress(task);
            const hasCheckpoints = task.checkpoints.length > 0;
            const completedCheckpoints = task.checkpoints.filter(
              (c) => c.isCompleted
            ).length;

            return (
              <div
                key={task.id}
                className="group rounded-lg p-3 transition-all duration-200 cursor-pointer hover:bg-white/[0.04]"
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
                onClick={() => onEditTask(task)}
              >
                {/* Task title */}
                <div className="flex items-start gap-2">
                  <CheckSquare
                    size={14}
                    className="text-emerald-500/50 mt-0.5 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm text-[#f3f4f6] line-clamp-1 leading-snug">
                      {task.title}
                    </h4>
                    {task.content && (
                      <p className="text-[11px] text-[#6b7280] mt-0.5 line-clamp-1">
                        {task.content}
                      </p>
                    )}
                  </div>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  {/* Completed date */}
                  {task.completedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#6b7280]">
                      <Clock size={10} />
                      {formatDate(task.completedAt)}
                    </span>
                  )}

                  {/* Checkpoint progress */}
                  {hasCheckpoints && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-[#6b7280] font-mono">
                      <CheckSquare size={10} />
                      {completedCheckpoints}/{task.checkpoints.length}
                    </span>
                  )}

                  {/* Assignees */}
                  {task.assignees.length > 0 && (
                    <div className="flex items-center gap-0.5">
                      {task.assignees.slice(0, 2).map((a) => (
                        <div
                          key={a.id}
                          className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center text-[7px] text-emerald-400 font-medium"
                          title={a.name}
                        >
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {task.assignees.length > 2 && (
                        <span className="text-[10px] text-[#6b7280]">
                          +{task.assignees.length - 2}
                        </span>
                      )}
                    </div>
                  )}

                  {/* From column */}
                  <span className="text-[10px] text-[#6b7280]/60 ml-auto">
                    {column.title}
                  </span>
                </div>

                {/* Progress bar */}
                {hasCheckpoints && (
                  <div className="mt-2 h-0.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500/60"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}

                {/* Restore button (on hover) */}
                {canEdit && (
                  <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        const updateTask = useStore.getState().updateTask;
                        updateTask(task.id, { completedAt: null });
                        api.tasks.update(task.id, { completedAt: null }).catch(() => {
                          updateTask(task.id, { completedAt: task.completedAt });
                        });
                      }}
                      className="flex items-center gap-1 px-2 py-1 bg-white/5 hover:bg-emerald-500/10 text-[#6b7280] hover:text-emerald-400 rounded text-[10px] transition-colors border border-white/[0.06] hover:border-emerald-500/20"
                    >
                      <RotateCcw size={10} />
                      Restore to board
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {filteredTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Inbox size={32} className="text-[#6b7280]/30 mb-3" />
              {allCompletedTasks.length === 0 ? (
                <>
                  <p className="text-sm text-[#6b7280]">No completed tasks</p>
                  <p className="text-xs text-[#6b7280]/60 mt-1">
                    Tasks in "Done" columns will appear here
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-[#6b7280]">No matching tasks</p>
                  <p className="text-xs text-[#6b7280]/60 mt-1">
                    Try adjusting your search query
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* ======== Footer ======== */}
        {allCompletedTasks.length > 0 && (
          <div className="shrink-0 px-4 py-2 border-t border-white/[0.06]">
            <p className="text-[10px] text-[#6b7280]/60">
              {allCompletedTasks.length} completed task{allCompletedTasks.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

export default React.memo(CompletedSidebar);
