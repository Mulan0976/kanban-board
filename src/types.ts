export interface User {
  id: string;
  email: string;
  displayName: string;
}

export interface Board {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  columns: Column[];
  permission: 'owner' | 'edit' | 'view';
  previewImage: string | null;
}

export interface BoardSummary {
  id: string;
  title: string;
  ownerName: string;
  permission: 'owner' | 'edit' | 'view';
  updatedAt: string;
  openTaskCount: number;
  userOpenTaskCount: number;
  previewImage: string | null;
}

export interface Column {
  id: string;
  boardId: string;
  title: string;
  position: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string | null;
  isDoneColumn: boolean;
  tasks: Task[];
}

export interface Task {
  id: string;
  columnId: string;
  title: string;
  content: string;
  position: number;
  color: string | null;
  previewImage: string | null;
  previewSettings: { offsetY: number; zoom: number } | null;
  durationMinutes: number;
  completedAt: string | null;
  createdAt: string;
  assignees: Assignee[];
  checkpoints: Checkpoint[];
  timeLogs: TimeLog[];
  dependencyIds: string[];
  attachments: string[];
}

export interface Assignee {
  id: string;
  name: string;
}

export interface Checkpoint {
  id: string;
  title: string;
  isCompleted: boolean;
  position: number;
}

export interface TimeLog {
  id: string;
  userName: string;
  minutes: number;
  loggedAt: string;
}

export interface InviteLink {
  id: string;
  boardId: string;
  code: string;
  permission: 'view' | 'edit';
  createdAt: string;
}

export interface BoardMember {
  id: string;
  displayName: string;
  permission: 'view' | 'edit';
  isAnonymous: boolean;
}

export type HistoryEntry =
  | { type: 'updateTask'; taskId: string; columnId: string; before: Partial<Task>; after: Partial<Task>; label: string }
  | { type: 'updateColumn'; columnId: string; before: Partial<Column>; after: Partial<Column>; label: string }
  | { type: 'moveTask'; taskId: string; fromColumnId: string; toColumnId: string; fromPosition: number; toPosition: number; label: string }
  | { type: 'deleteTask'; task: Task; columnId: string; label: string }
  | { type: 'deleteColumn'; column: Column; label: string }
  | { type: 'createTask'; taskId: string; columnId: string; label: string }
  | { type: 'createColumn'; columnId: string; label: string }
  | { type: 'bulkUpdateColumns'; before: { id: string; x: number; y: number }[]; after: { id: string; x: number; y: number }[]; label: string };

export type WSMessage =
  | { type: 'join'; boardId: string }
  | { type: 'leave'; boardId: string }
  | { type: 'board:updated'; board: Board }
  | { type: 'column:created'; column: Column }
  | { type: 'column:updated'; column: Column }
  | { type: 'column:deleted'; columnId: string }
  | { type: 'task:created'; task: Task; columnId: string }
  | { type: 'task:updated'; task: Task }
  | { type: 'task:deleted'; taskId: string; columnId: string }
  | { type: 'task:moved'; taskId: string; fromColumnId: string; toColumnId: string; position: number; task: Task }
  | { type: 'presence:update'; users: { id: string; name: string; color: string; action: string; taskId?: string }[] }
  | { type: 'activity'; action: string; taskId?: string };

export const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fb7185',
  '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#818cf8', '#c084fc',
  '#f472b6', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#38bdf8',
  '#60a5fa', '#a78bfa', '#e879f9', '#f9a8d4', '#fdba74', '#fde047',
  '#86efac', '#5eead4', '#7dd3fc', '#93c5fd', '#c4b5fd', '#f0abfc',
  '#fda4af', '#fed7aa', '#fef08a', '#bbf7d0', '#99f6e4', '#a5f3fc',
];

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ');
}

export function getTaskProgress(task: Task): number {
  if (!task.checkpoints || task.checkpoints.length === 0) return 0;
  const done = task.checkpoints.filter((c) => c.isCompleted).length;
  return Math.round((done / task.checkpoints.length) * 100);
}

export function getLinkColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  const palette = [
    '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#f59e0b',
    '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  ];
  return palette[Math.abs(hash) % palette.length];
}
