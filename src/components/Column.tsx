import React, { useCallback, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  MoreHorizontal,
  ChevronDown,
  X,
  Check,
  Palette,
  Settings,
  CheckSquare,
} from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import type { Column as ColumnType, Task } from '../types';
import { COLORS, hexToRgba } from '../types';
import TaskCard from './TaskCard';

interface ColumnProps {
  column: ColumnType;
  zoom: number;
  isSelected: boolean;
  onDragStart: (columnId: string, e: React.MouseEvent) => void;
  onTaskDragStart: (taskId: string, columnId: string, e: React.DragEvent) => void;
  onTaskDragOver: (e: React.DragEvent) => void;
  onTaskDrop: (columnId: string, e: React.DragEvent) => void;
  onDragOverColumn: (columnId: string | null) => void;
  onEditTask: (task: Task) => void;
  onLinkStart: (taskId: string) => void;
  onLinkEnd: (taskId: string) => void;
  linkingFromTaskId: string | null;
  permission: 'owner' | 'edit' | 'view';
  onSelectColumn: (columnId: string, e: React.MouseEvent) => void;
  onCompleteTask?: (taskId: string, columnId: string) => void;
}

function Column({
  column,
  zoom,
  isSelected,
  onDragStart,
  onTaskDragStart,
  onTaskDragOver,
  onTaskDrop,
  onEditTask,
  onLinkStart,
  onLinkEnd,
  linkingFromTaskId,
  permission,
  onSelectColumn,
  onDragOverColumn,
  onCompleteTask,
}: ColumnProps) {
  const updateColumn = useStore((s) => s.updateColumn);
  const removeColumn = useStore((s) => s.removeColumn);
  const addTask = useStore((s) => s.addTask);
  const pushHistory = useStore((s) => s.pushHistory);
  const toggleTaskSelection = useStore((s) => s.toggleTaskSelection);
  const selectedTaskIds = useStore((s) => s.selectedTaskIds);

  // Local state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const canEdit = permission !== 'view';

  // ============================================================
  // Title editing
  // ============================================================
  const handleDoubleClickTitle = () => {
    if (!canEdit) return;
    setEditingTitle(true);
    setTitleDraft(column.title);
  };

  const saveTitle = async () => {
    if (!titleDraft.trim()) {
      setEditingTitle(false);
      return;
    }
    const oldTitle = column.title;
    updateColumn(column.id, { title: titleDraft.trim() });
    setEditingTitle(false);

    try {
      await api.columns.update(column.id, { title: titleDraft.trim() });
      pushHistory({
        type: 'updateColumn',
        columnId: column.id,
        before: { title: oldTitle },
        after: { title: titleDraft.trim() },
        label: `Rename column "${oldTitle}" to "${titleDraft.trim()}"`,
      });
    } catch {
      updateColumn(column.id, { title: oldTitle });
    }
  };

  // ============================================================
  // Color change
  // ============================================================
  const handleColorChange = async (color: string) => {
    const oldColor = column.color;
    updateColumn(column.id, { color });
    setShowColorPicker(false);
    setShowMenu(false);

    try {
      await api.columns.update(column.id, { color });
      pushHistory({
        type: 'updateColumn',
        columnId: column.id,
        before: { color: oldColor },
        after: { color },
        label: `Change column color`,
      });
    } catch {
      updateColumn(column.id, { color: oldColor });
    }
  };

  // ============================================================
  // Done column toggle
  // ============================================================
  const handleToggleDone = async () => {
    const oldVal = column.isDoneColumn;
    updateColumn(column.id, { isDoneColumn: !oldVal });
    setShowMenu(false);

    try {
      await api.columns.update(column.id, { isDoneColumn: !oldVal });
      pushHistory({
        type: 'updateColumn',
        columnId: column.id,
        before: { isDoneColumn: oldVal },
        after: { isDoneColumn: !oldVal },
        label: `Toggle done column "${column.title}"`,
      });
    } catch {
      updateColumn(column.id, { isDoneColumn: oldVal });
    }
  };

  // ============================================================
  // Delete column
  // ============================================================
  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setShowMenu(false);
    setConfirmDelete(false);

    try {
      await api.columns.delete(column.id);
      removeColumn(column.id);
      pushHistory({
        type: 'deleteColumn',
        column,
        label: `Delete column "${column.title}"`,
      });
    } catch {
      // handle silently
    }
  };

  // ============================================================
  // Add task
  // ============================================================
  const handleAddTask = async () => {
    if (!canEdit || !newTaskTitle.trim()) return;

    try {
      const created = await api.tasks.create(column.id, {
        title: newTaskTitle.trim(),
        content: '',
        position: column.tasks.length,
      });
      addTask(column.id, created);
      pushHistory({
        type: 'createTask',
        taskId: created.id,
        columnId: column.id,
        label: `Create task "${created.title}"`,
      });
      setNewTaskTitle('');
      setShowAddTask(false);
    } catch {
      // handle silently
    }
  };

  // ============================================================
  // DnD handlers
  // ============================================================
  const isDragOverRef = useRef(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    isDragOverRef.current = true;
    onDragOverColumn(column.id);
    onTaskDragOver(e);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
    isDragOverRef.current = false;
    // Don't clear onDragOverColumn here - dragend needs to know the last hovered column
  };

  const handleDrop = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragOver(false);
    isDragOverRef.current = false;
    onTaskDrop(column.id, e);
  };

  // ============================================================
  // Task selection handler
  // ============================================================
  const handleSelectTask = useCallback(
    (taskId: string, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        toggleTaskSelection(taskId);
      } else {
        // Handled by TaskCard (edit or link)
      }
    },
    [toggleTaskSelection]
  );

  // ============================================================
  // Column header drag
  // ============================================================
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (editingTitle) return;
    // Only start drag on left mouse button and from the grip handle area
    if (e.button === 0) {
      onDragStart(column.id, e);
    }
  };

  // Sorted tasks
  // Hide completed tasks from the column - they show in the Completed sidebar
  const sortedTasks = [...column.tasks]
    .filter((t) => !t.completedAt)
    .sort((a, b) => a.position - b.position);

  // Column accent color
  const accentColor = column.color || '#22c55e';

  return (
    <div
      className={`absolute transition-shadow duration-200`}
      style={{
        left: column.x,
        top: column.y,
        width: column.width || 300,
        zIndex: isSelected ? 10 : 1,
      }}
      onClick={(e) => {
        // Only handle click on the column itself, not on children
        if (e.target === e.currentTarget) {
          onSelectColumn(column.id, e);
        }
      }}
    >
      <div
        className={`rounded-xl transition-all duration-200 ${
          isSelected
            ? 'ring-2 ring-emerald-500/60 shadow-[0_0_30px_rgba(34,197,94,0.15)]'
            : 'hover:border-white/[0.12]'
        }`}
        style={{
          background: `linear-gradient(180deg, ${hexToRgba(accentColor, 0.06)} 0%, rgba(15, 15, 15, 0.6) 120px)`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: isSelected
            ? '1px solid rgba(34, 197, 94, 0.3)'
            : '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: isDragOver
            ? `0 0 25px ${hexToRgba(accentColor, 0.25)}, 0 25px 50px rgba(0,0,0,0.5)`
            : '0 25px 50px rgba(0, 0, 0, 0.25)',
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Color top bar */}
        <div
          className="h-1 w-full rounded-t-xl"
          style={{ backgroundColor: accentColor }}
        />

        {/* ======== Header ======== */}
        <div
          className="flex items-center gap-2 px-3 py-3 border-b border-white/[0.06]"
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          {/* Drag handle */}
          {canEdit && (
            <button
              onMouseDown={handleHeaderMouseDown}
              className="p-1 rounded hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] cursor-grab active:cursor-grabbing transition-colors shrink-0"
              title="Drag to move column"
            >
              <GripVertical size={14} />
            </button>
          )}

          {/* Column title */}
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="w-full bg-white/5 border border-emerald-500/50 rounded px-2 py-0.5 text-sm text-[#f3f4f6] font-[Syne] font-semibold focus:outline-none"
              />
            ) : (
              <div
                className="flex items-center gap-2 cursor-default"
                onDoubleClick={handleDoubleClickTitle}
              >
                <h3 className="text-sm font-semibold text-[#f3f4f6] font-[Syne] truncate">
                  {column.title}
                </h3>
                {column.isDoneColumn && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[10px] border border-emerald-500/20 shrink-0">
                    <CheckSquare size={10} />
                    Done
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Task count */}
          <span className="text-[10px] text-[#6b7280] font-mono tabular-nums shrink-0">
            {column.tasks.length}
          </span>

          {/* Menu button */}
          {canEdit && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => {
                  setShowMenu(!showMenu);
                  setConfirmDelete(false);
                  setShowColorPicker(false);
                }}
                className="p-1 rounded hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors shrink-0"
              >
                <MoreHorizontal size={14} />
              </button>

              {/* Click overlay to close menu when clicking outside */}
              {showMenu && (
                <div
                  className="fixed inset-0 z-[60]"
                  onClick={() => {
                    setShowMenu(false);
                    setConfirmDelete(false);
                    setShowColorPicker(false);
                  }}
                />
              )}

              {/* Dropdown menu */}
              {showMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-48 glass rounded-xl border border-white/10 py-1 z-[70] animate-in"
                  style={{ boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                >
                  {/* Color picker trigger */}
                  <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#f3f4f6] hover:bg-white/10 transition-colors"
                  >
                    <Palette size={14} className="text-[#6b7280]" />
                    Column Color
                    <ChevronDown
                      size={12}
                      className={`ml-auto text-[#6b7280] transition-transform ${
                        showColorPicker ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Inline color picker */}
                  {showColorPicker && (
                    <div className="px-3 py-2 border-t border-white/[0.06]">
                      <div className="grid grid-cols-8 gap-1">
                        {COLORS.slice(0, 24).map((c) => (
                          <button
                            key={c}
                            onClick={() => handleColorChange(c)}
                            className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-125 ${
                              column.color === c
                                ? 'border-white scale-110'
                                : 'border-transparent'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Done column toggle */}
                  <button
                    onClick={handleToggleDone}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#f3f4f6] hover:bg-white/10 transition-colors"
                  >
                    <CheckSquare size={14} className="text-[#6b7280]" />
                    {column.isDoneColumn ? 'Unmark as Done' : 'Mark as Done Column'}
                  </button>

                  {/* Divider */}
                  <div className="h-px bg-white/[0.06] my-1" />

                  {/* Delete */}
                  <button
                    onClick={handleDelete}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                      confirmDelete
                        ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                        : 'text-red-400/70 hover:bg-red-500/10 hover:text-red-400'
                    }`}
                  >
                    <Trash2 size={14} />
                    {confirmDelete ? 'Confirm Delete?' : 'Delete Column'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ======== Tasks ======== */}
        <div
          className={`p-2 space-y-2 min-h-[40px] transition-colors duration-200 overflow-y-auto ${
            isDragOver ? 'bg-emerald-500/5' : ''
          }`}
          style={column.height ? { maxHeight: column.height - 90 } : { maxHeight: 600 }}
        >
          {column.isDoneColumn ? (
            <>
              {/* Done columns show tasks in Completed sidebar */}
              {sortedTasks.length > 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-3 text-center">
                  <CheckSquare size={16} className="text-emerald-500/40" />
                  <p className="text-[11px] text-[#6b7280]">
                    {sortedTasks.length} task{sortedTasks.length !== 1 ? 's' : ''} completed
                  </p>
                  <p className="text-[10px] text-[#6b7280]/60">
                    View in Completed sidebar
                  </p>
                </div>
              ) : (
                <div className="text-center py-3 text-[11px] text-[#6b7280]/50">
                  Drop tasks here to complete
                </div>
              )}
              {/* Still accept drops */}
              {isDragOver && (
                <div className="border-2 border-dashed border-emerald-500/30 rounded-lg p-4 text-center text-xs text-emerald-500/50">
                  Drop to complete
                </div>
              )}
            </>
          ) : (
            <>
              {sortedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  columnId={column.id}
                  isSelected={selectedTaskIds.has(task.id)}
                  onEdit={onEditTask}
                  onDragStart={onTaskDragStart}
                  onLinkStart={onLinkStart}
                  onLinkEnd={onLinkEnd}
                  linkingFromTaskId={linkingFromTaskId}
                  permission={permission}
                  onSelect={handleSelectTask}
                  onComplete={!column.isDoneColumn ? onCompleteTask : undefined}
                />
              ))}

              {/* Drop zone indicator when empty */}
              {isDragOver && sortedTasks.length === 0 && (
                <div className="border-2 border-dashed border-emerald-500/30 rounded-lg p-4 text-center text-xs text-emerald-500/50">
                  Drop task here
                </div>
              )}
            </>
          )}
        </div>

        {/* ======== Add Task ======== */}
        {canEdit && (
          <div className="p-2 border-t border-white/[0.06]">
            {showAddTask ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTask();
                    if (e.key === 'Escape') {
                      setShowAddTask(false);
                      setNewTaskTitle('');
                    }
                  }}
                  placeholder="Task title..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 placeholder:text-[#6b7280]/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddTask}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs hover:bg-emerald-500/30 transition-colors"
                  >
                    <Check size={12} />
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowAddTask(false);
                      setNewTaskTitle('');
                    }}
                    className="px-3 py-1.5 hover:bg-white/10 text-[#6b7280] rounded-lg text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddTask(true)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[#6b7280] hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg text-xs transition-all group"
              >
                <Plus size={14} className="group-hover:text-emerald-400 transition-colors" />
                Add Task
              </button>
            )}
          </div>
        )}
      </div>

      {/* Resize handles: right, bottom, corner */}
      {canEdit && (
        <>
          {/* Right edge */}
          <div
            className="absolute top-0 right-0 w-[6px] h-full cursor-col-resize group/rr z-10"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const startX = e.clientX;
              const startW = column.width || 300;
              const move = (ev: MouseEvent) => {
                const w = Math.max(200, Math.min(800, startW + (ev.clientX - startX) / zoom));
                updateColumn(column.id, { width: w });
              };
              const up = async (ev: MouseEvent) => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                const w = Math.max(200, Math.min(800, startW + (ev.clientX - startX) / zoom));
                try { await api.columns.update(column.id, { width: w }); pushHistory({ type: 'updateColumn', columnId: column.id, before: { width: startW }, after: { width: w }, label: `Resize column "${column.title}"` }); } catch {}
              };
              document.addEventListener('mousemove', move);
              document.addEventListener('mouseup', up);
            }}
          >
            <div className="w-[2px] h-full ml-auto opacity-0 group-hover/rr:opacity-100 transition-opacity bg-white/20 rounded-full" />
          </div>

          {/* Bottom edge */}
          <div
            className="absolute bottom-0 left-0 w-full h-[6px] cursor-row-resize group/rb z-10"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const startY = e.clientY;
              const el = e.currentTarget.parentElement!;
              const startH = column.height || el.offsetHeight;
              const move = (ev: MouseEvent) => {
                const h = Math.max(120, Math.min(1200, startH + (ev.clientY - startY) / zoom));
                updateColumn(column.id, { height: h });
              };
              const up = async (ev: MouseEvent) => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                const h = Math.max(120, Math.min(1200, startH + (ev.clientY - startY) / zoom));
                try { await api.columns.update(column.id, { height: h }); pushHistory({ type: 'updateColumn', columnId: column.id, before: { height: startH }, after: { height: h }, label: `Resize column "${column.title}"` }); } catch {}
              };
              document.addEventListener('mousemove', move);
              document.addEventListener('mouseup', up);
            }}
          >
            <div className="h-[2px] w-full mt-auto opacity-0 group-hover/rb:opacity-100 transition-opacity bg-white/20 rounded-full" />
          </div>

          {/* Corner (bottom-right) */}
          <div
            className="absolute bottom-0 right-0 w-[12px] h-[12px] cursor-nwse-resize z-20 group/rc"
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const startX = e.clientX;
              const startY = e.clientY;
              const startW = column.width || 300;
              const el = e.currentTarget.parentElement!;
              const startH = column.height || el.offsetHeight;
              const move = (ev: MouseEvent) => {
                const w = Math.max(200, Math.min(800, startW + (ev.clientX - startX) / zoom));
                const h = Math.max(120, Math.min(1200, startH + (ev.clientY - startY) / zoom));
                updateColumn(column.id, { width: w, height: h });
              };
              const up = async (ev: MouseEvent) => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                const w = Math.max(200, Math.min(800, startW + (ev.clientX - startX) / zoom));
                const h = Math.max(120, Math.min(1200, startH + (ev.clientY - startY) / zoom));
                try { await api.columns.update(column.id, { width: w, height: h }); pushHistory({ type: 'updateColumn', columnId: column.id, before: { width: startW, height: startH }, after: { width: w, height: h }, label: `Resize column "${column.title}"` }); } catch {}
              };
              document.addEventListener('mousemove', move);
              document.addEventListener('mouseup', up);
            }}
          >
            <div className="absolute bottom-[2px] right-[2px] w-[6px] h-[6px] opacity-0 group-hover/rc:opacity-100 transition-opacity border-b-2 border-r-2 border-white/25 rounded-br-sm" />
          </div>
        </>
      )}

    </div>
  );
}

export default React.memo(Column);
