import type {
  User,
  Board,
  BoardSummary,
  Column,
  Task,
  TimeLog,
  Checkpoint,
  Assignee,
  BoardMember,
} from './types';

const API = '/api';

async function request<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = res.statusText;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
    } catch {
      message = text || res.statusText;
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    register: (email: string, password: string, displayName: string) =>
      request<{ user: User }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      }),
    login: (email: string, password: string) =>
      request<{ user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    me: () => request<{ user: User | null }>('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    mergeAnonymous: (boardIds: string[]) =>
      request('/auth/merge-anonymous', {
        method: 'POST',
        body: JSON.stringify({ boardIds }),
      }),
  },
  boards: {
    list: () => request<BoardSummary[]>('/boards'),
    create: (title: string) =>
      request<Board>('/boards', {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    get: (id: string) => request<Board>(`/boards/${id}`),
    update: (id: string, data: Partial<Board>) =>
      request<Board>(`/boards/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) => request(`/boards/${id}`, { method: 'DELETE' }),
    uploadPreview: async (id: string, file: File): Promise<{ url: string }> => {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(`${API}/boards/${id}/preview-image`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    removePreview: (id: string) =>
      request(`/boards/${id}/preview-image`, { method: 'DELETE' }),
    invite: (id: string, permission: 'view' | 'edit') =>
      request<{ code: string; permission: string }>(`/boards/${id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ permission }),
      }),
    join: (code: string, displayName?: string) =>
      request<BoardSummary>(`/boards/join/${code}`, {
        method: 'POST',
        body: JSON.stringify({ displayName }),
      }),
    members: (id: string) => request<BoardMember[]>(`/boards/${id}/members`),
    updateMember: (boardId: string, memberId: string, permission: 'view' | 'edit') =>
      request(`/boards/${boardId}/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify({ permission }),
      }),
    removeMember: (boardId: string, memberId: string) =>
      request(`/boards/${boardId}/members/${memberId}`, { method: 'DELETE' }),
  },
  columns: {
    create: (boardId: string, data: { title: string; x?: number; y?: number; color?: string }) =>
      request<Column>(`/boards/${boardId}/columns`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Column>) =>
      request<Column>(`/columns/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) => request(`/columns/${id}`, { method: 'DELETE' }),
    bulkUpdate: (updates: { id: string; x?: number; y?: number; position?: number }[]) =>
      request('/columns/bulk-update', {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      }),
  },
  tasks: {
    create: (columnId: string, data: Partial<Task>) =>
      request<Task>(`/columns/${columnId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<Task> & { assignees?: Assignee[]; checkpoints?: Checkpoint[] }) =>
      request<Task>(`/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: string) => request(`/tasks/${id}`, { method: 'DELETE' }),
    move: (id: string, toColumnId: string, position: number) =>
      request<Task>(`/tasks/${id}/move`, {
        method: 'PUT',
        body: JSON.stringify({ toColumnId, position }),
      }),
    addTimeLog: (id: string, userName: string, minutes: number) =>
      request<TimeLog>(`/tasks/${id}/time-logs`, {
        method: 'POST',
        body: JSON.stringify({ userName, minutes }),
      }),
    addCheckpoint: (id: string, title: string) =>
      request<Checkpoint>(`/tasks/${id}/checkpoints`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    updateCheckpoint: (id: string, data: Partial<Checkpoint>) =>
      request<Checkpoint>(`/checkpoints/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    deleteCheckpoint: (id: string) =>
      request(`/checkpoints/${id}`, { method: 'DELETE' }),
    addDependency: (id: string, dependencyId: string) =>
      request(`/tasks/${id}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ dependencyId }),
      }),
    removeDependency: (id: string, dependencyId: string) =>
      request(`/tasks/${id}/dependencies/${dependencyId}`, { method: 'DELETE' }),
  },
};
