import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { ArrowUpDown, ChevronLeft, ChevronRight, Clock, Calendar, Search, Users, X } from 'lucide-react';
import { useStore } from '../store';
import type { Task } from '../types';

type SummarySortKey = 'createdAt' | 'completedAt' | 'assignees';

const sortLabels: Record<SummarySortKey, string> = {
  createdAt: 'Date',
  completedAt: 'Completion Time',
  assignees: 'Assignees',
};

interface CompletedSummaryModalProps {
  onClose: () => void;
}

export default function CompletedSummaryModal({ onClose }: CompletedSummaryModalProps) {
  const currentBoard = useStore((s) => s.currentBoard);
  const [sortKey, setSortKey] = useState<SummarySortKey>('completedAt');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  const completedTasks = useMemo(() => {
    if (!currentBoard) return [];
    const seen = new Set<string>();
    const tasks: Task[] = [];
    for (const col of currentBoard.columns) {
      for (const t of col.tasks) {
        if ((t.completedAt || col.isDoneColumn) && !seen.has(t.id)) {
          seen.add(t.id);
          tasks.push(t);
        }
      }
    }

    // Search filter
    let filtered = tasks;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.content.toLowerCase().includes(q) ||
          t.assignees.some((a) => a.name.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'createdAt':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'completedAt': {
          const aDate = a.completedAt || a.createdAt;
          const bDate = b.completedAt || b.createdAt;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        }
        case 'assignees': {
          const aName = a.assignees.length > 0 ? a.assignees[0].name.toLowerCase() : 'zzz';
          const bName = b.assignees.length > 0 ? b.assignees[0].name.toLowerCase() : 'zzz';
          return aName.localeCompare(bName);
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [currentBoard, sortKey, searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [searchQuery, sortKey]);

  const totalPages = Math.max(1, Math.ceil(completedTasks.length / PAGE_SIZE));
  const pagedTasks = completedTasks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl mx-4 glass rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl"
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <h2
            className="text-lg font-semibold text-gray-100 tracking-tight"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Completed Summary
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search + Sort controls */}
        <div className="px-6 pt-3 pb-1 flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6b7280]"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, content, or name..."
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 placeholder:text-[#6b7280]/50"
            />
          </div>
          <div className="relative shrink-0">
            <button
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#6b7280] hover:text-[#f3f4f6] hover:bg-white/5 rounded-lg transition-colors border border-white/[0.06]"
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
                <div className="absolute left-0 top-full mt-1 w-44 rounded-lg border border-white/10 py-1 z-50 animate-in" style={{ background: 'rgb(20, 20, 20)' }}>
                  {(Object.keys(sortLabels) as SummarySortKey[]).map((key) => (
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
                      <span className="flex items-center gap-2">
                        {key === 'createdAt' && <Calendar size={12} />}
                        {key === 'completedAt' && <Clock size={12} />}
                        {key === 'assignees' && <Users size={12} />}
                        {sortLabels[key]}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Task list */}
        <div className="px-6 py-3 space-y-1.5">
          {pagedTasks.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#6b7280]">
              {completedTasks.length === 0 && !searchQuery.trim()
                ? 'No completed tasks yet.'
                : 'No matching tasks.'}
            </div>
          ) : (
            pagedTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.03] transition-colors border border-white/[0.04]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f3f4f6] font-medium leading-snug truncate">
                    {task.title}
                  </p>
                  {task.content && (
                    <p className="text-[11px] text-[#6b7280] mt-0.5">
                      {task.content.length > 20
                        ? task.content.slice(0, 20) + '…'
                        : task.content}
                    </p>
                  )}
                </div>

                {/* Meta */}
                <div className="flex flex-col items-end gap-1 shrink-0 text-[10px] text-[#6b7280]">
                  {task.completedAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {formatDate(task.completedAt)}
                    </span>
                  )}
                  {task.assignees.length > 0 && (
                    <span className="flex items-center gap-1">
                      <Users size={10} />
                      {task.assignees.map((a) => a.name).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination + Footer */}
        {completedTasks.length > 0 && (
          <div className="px-6 py-2.5 border-t border-white/[0.06] flex items-center justify-between">
            <p className="text-[10px] text-[#6b7280]/60">
              {completedTasks.length} completed task{completedTasks.length !== 1 ? 's' : ''}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[10px] text-[#6b7280] font-mono tabular-nums">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
