import { create } from 'zustand';
import type { User, Board, BoardSummary, Column, Task, HistoryEntry } from './types';

interface BoardState {
  // Auth
  user: User | null;
  isAuthenticated: boolean;

  // Data
  boards: BoardSummary[];
  currentBoard: Board | null;

  // UI
  zoom: number;
  panOffset: { x: number; y: number };
  selectedTaskIds: Set<string>;
  selectedColumnIds: Set<string>;

  // History (undo/redo)
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // Actions
  setUser: (user: User | null) => void;
  setBoards: (boards: BoardSummary[]) => void;
  setCurrentBoard: (board: Board | null) => void;

  // Optimistic mutations
  addColumn: (column: Column) => void;
  updateColumn: (id: string, updates: Partial<Column>) => void;
  removeColumn: (id: string) => void;

  addTask: (columnId: string, task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string, columnId: string) => void;
  moveTask: (taskId: string, fromColumnId: string, toColumnId: string, position: number, task?: Task) => void;

  // Selection
  toggleTaskSelection: (id: string) => void;
  toggleColumnSelection: (id: string) => void;
  clearSelection: () => void;
  selectTasksInRect: (ids: string[]) => void;
  selectColumnsInRect: (ids: string[]) => void;

  // Zoom/Pan
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;

  // History
  pushHistory: (entry: HistoryEntry) => void;
  undo: () => HistoryEntry | undefined;
  redo: () => HistoryEntry | undefined;
  clearHistory: () => void;
}

export const useStore = create<BoardState>((set, get) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  boards: [],
  currentBoard: null,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  selectedTaskIds: new Set<string>(),
  selectedColumnIds: new Set<string>(),
  undoStack: [],
  redoStack: [],

  // Auth
  setUser: (user) =>
    set({ user, isAuthenticated: user !== null }),

  // Data
  setBoards: (boards) => set({ boards }),

  setCurrentBoard: (board) => set({ currentBoard: board }),

  // Column mutations
  addColumn: (column) =>
    set((state) => {
      if (!state.currentBoard) return state;
      if (state.currentBoard.columns.some((c) => c.id === column.id)) return state;
      return {
        currentBoard: {
          ...state.currentBoard,
          columns: [...state.currentBoard.columns, column],
        },
      };
    }),

  updateColumn: (id, updates) =>
    set((state) => {
      if (!state.currentBoard) return state;
      return {
        currentBoard: {
          ...state.currentBoard,
          columns: state.currentBoard.columns.map((col) =>
            col.id === id ? { ...col, ...updates } : col
          ),
        },
      };
    }),

  removeColumn: (id) =>
    set((state) => {
      if (!state.currentBoard) return state;
      return {
        currentBoard: {
          ...state.currentBoard,
          columns: state.currentBoard.columns.filter((col) => col.id !== id),
        },
      };
    }),

  // Task mutations
  addTask: (columnId, task) =>
    set((state) => {
      if (!state.currentBoard) return state;
      return {
        currentBoard: {
          ...state.currentBoard,
          columns: state.currentBoard.columns.map((col) =>
            col.id === columnId
              ? { ...col, tasks: col.tasks.some((t) => t.id === task.id) ? col.tasks : [...col.tasks, task] }
              : col
          ),
        },
      };
    }),

  updateTask: (taskId, updates) =>
    set((state) => {
      if (!state.currentBoard) return state;
      return {
        currentBoard: {
          ...state.currentBoard,
          columns: state.currentBoard.columns.map((col) => ({
            ...col,
            tasks: col.tasks.map((t) =>
              t.id === taskId ? { ...t, ...updates } : t
            ),
          })),
        },
      };
    }),

  removeTask: (taskId, columnId) =>
    set((state) => {
      if (!state.currentBoard) return state;
      return {
        currentBoard: {
          ...state.currentBoard,
          columns: state.currentBoard.columns.map((col) =>
            col.id === columnId
              ? { ...col, tasks: col.tasks.filter((t) => t.id !== taskId) }
              : col
          ),
        },
      };
    }),

  moveTask: (taskId, fromColumnId, toColumnId, position, task) =>
    set((state) => {
      if (!state.currentBoard) return state;

      let movedTask: Task | undefined = task;
      const columns = state.currentBoard.columns.map((col) => {
        if (col.id === fromColumnId) {
          const existing = col.tasks.find((t) => t.id === taskId);
          if (existing) movedTask = movedTask || existing;
          return {
            ...col,
            tasks: col.tasks.filter((t) => t.id !== taskId),
          };
        }
        return col;
      });

      if (!movedTask) return state;

      const updatedTask = { ...movedTask, columnId: toColumnId, position };

      const finalColumns = columns.map((col) => {
        if (col.id === toColumnId) {
          // Filter out any existing instance of the task first (idempotent)
          const newTasks = col.tasks.filter((t) => t.id !== taskId);
          const insertIdx = Math.min(position, newTasks.length);
          newTasks.splice(insertIdx, 0, updatedTask);
          // Re-index positions
          return {
            ...col,
            tasks: newTasks.map((t, i) => ({ ...t, position: i })),
          };
        }
        return col;
      });

      return {
        currentBoard: {
          ...state.currentBoard,
          columns: finalColumns,
        },
      };
    }),

  // Selection
  toggleTaskSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedTaskIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedTaskIds: next };
    }),

  toggleColumnSelection: (id) =>
    set((state) => {
      const next = new Set(state.selectedColumnIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedColumnIds: next };
    }),

  clearSelection: () =>
    set({
      selectedTaskIds: new Set<string>(),
      selectedColumnIds: new Set<string>(),
    }),

  selectTasksInRect: (ids) =>
    set({ selectedTaskIds: new Set(ids) }),

  selectColumnsInRect: (ids) =>
    set({ selectedColumnIds: new Set(ids) }),

  // Zoom/Pan
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(3, zoom)) }),

  setPanOffset: (offset) => set({ panOffset: offset }),

  // History
  pushHistory: (entry) =>
    set((state) => ({
      undoStack: [...state.undoStack, entry],
      redoStack: [], // Clear redo stack on new action
    })),

  undo: () => {
    const state = get();
    if (state.undoStack.length === 0) return undefined;

    const entry = state.undoStack[state.undoStack.length - 1];
    set({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [...state.redoStack, entry],
    });
    return entry;
  },

  redo: () => {
    const state = get();
    if (state.redoStack.length === 0) return undefined;

    const entry = state.redoStack[state.redoStack.length - 1];
    set({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [...state.undoStack, entry],
    });
    return entry;
  },

  clearHistory: () =>
    set({ undoStack: [], redoStack: [] }),
}));
