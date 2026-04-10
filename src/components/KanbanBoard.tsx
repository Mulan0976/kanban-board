import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  GripVertical,
  Undo2,
  Redo2,
  Copy,
  Clipboard,
  ZoomIn,
  ZoomOut,
  Columns,
  Eye,
  ArrowLeft,
  Share2,
  CheckSquare,
  X,
  Loader2,
  Link2,
  Users,
  Shield,
  Edit3,
  AlertTriangle,
  ChevronDown,
  History,
  ImageIcon,
  Star,
  Upload,
} from 'lucide-react';
import { useStore } from '../store';
import { api } from '../api';
import { wsClient } from '../ws';
import type { Board, Column as ColumnType, Task, WSMessage, HistoryEntry } from '../types';
import ColumnComponent from './Column';
import DependencyLines from './DependencyLines';
import CompletedSidebar from './CompletedSidebar';
import { ConfirmDialog } from './UI';

// ============================================================
// ShareModal
// ============================================================
interface ShareModalProps {
  board: Board;
  onClose: () => void;
}

function ShareModal({ board, onClose }: ShareModalProps) {
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [members, setMembers] = useState<
    { id: string; displayName: string; permission: 'view' | 'edit'; isAnonymous: boolean }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPermDropdown, setShowPermDropdown] = useState(false);
  const [openMemberDropdown, setOpenMemberDropdown] = useState<string | null>(null);
  const [memberDropdownPos, setMemberDropdownPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });

  useEffect(() => {
    api.boards.members(board.id).then(setMembers).catch(() => {});
  }, [board.id]);

  const generateLink = async () => {
    setLoading(true);
    try {
      const result = await api.boards.invite(board.id, permission);
      const link = `${window.location.origin}/join/${result.code}`;
      setInviteLink(link);
    } catch {
      // handle silently
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const removeMember = async (memberId: string) => {
    try {
      await api.boards.removeMember(board.id, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      // handle silently
    }
  };

  const updateMemberPerm = async (memberId: string, perm: 'view' | 'edit') => {
    try {
      await api.boards.updateMember(board.id, memberId, perm);
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, permission: perm } : m))
      );
    } catch {
      // handle silently
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative glass rounded-2xl border border-white/10 w-full max-w-md p-6 animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#f3f4f6] font-[Syne]">Share Board</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Generate invite link */}
        <div className="mb-6">
          <label className="text-sm text-[#6b7280] mb-2 block">Generate Invite Link</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <button
                onClick={() => setShowPermDropdown(!showPermDropdown)}
                className="w-full flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f3f4f6] hover:bg-white/[0.08] transition-colors"
              >
                <span className="flex items-center gap-2">
                  {permission === 'view' ? <Eye size={14} className="text-[#6b7280]" /> : <Edit3 size={14} className="text-emerald-400" />}
                  {permission === 'view' ? 'View only' : 'Can edit'}
                </span>
                <ChevronDown size={14} className={`text-[#6b7280] transition-transform ${showPermDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showPermDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowPermDropdown(false)} />
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-white/10 py-1 z-20 animate-in" style={{ background: 'rgb(20, 20, 20)', boxShadow: '0 15px 30px rgba(0,0,0,0.5)' }}>
                    <button
                      onClick={() => { setPermission('view'); setShowPermDropdown(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${permission === 'view' ? 'text-emerald-400 bg-emerald-500/10' : 'text-[#f3f4f6] hover:bg-white/10'}`}
                    >
                      <Eye size={14} /> View only
                    </button>
                    <button
                      onClick={() => { setPermission('edit'); setShowPermDropdown(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${permission === 'edit' ? 'text-emerald-400 bg-emerald-500/10' : 'text-[#f3f4f6] hover:bg-white/10'}`}
                    >
                      <Edit3 size={14} /> Can edit
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={generateLink}
              disabled={loading}
              className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm hover:bg-emerald-500/30 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : 'Generate'}
            </button>
          </div>

          {inviteLink && (
            <div className="mt-3 flex gap-2">
              <input
                readOnly
                value={inviteLink}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-[#f3f4f6] font-mono"
              />
              <button
                onClick={copyLink}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-[#f3f4f6] hover:bg-white/10 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          )}
        </div>

        {/* Members list */}
        <div>
          <label className="text-sm text-[#6b7280] mb-2 block flex items-center gap-2">
            <Users size={14} />
            Members ({members.length})
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center text-xs text-emerald-400 font-medium">
                    {member.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-[#f3f4f6]">
                    {member.displayName}
                    {member.isAnonymous && (
                      <span className="text-[#6b7280] text-xs ml-1">(anonymous)</span>
                    )}
                  </span>
                </div>
                {board.permission === 'owner' && (
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          if (openMemberDropdown === member.id) {
                            setOpenMemberDropdown(null);
                          } else {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setMemberDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                            setOpenMemberDropdown(member.id);
                          }
                        }}
                        className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-[#f3f4f6] hover:bg-white/[0.08] transition-colors"
                      >
                        {member.permission === 'view' ? 'View' : 'Edit'}
                        <ChevronDown size={10} className="text-[#6b7280]" />
                      </button>
                      {openMemberDropdown === member.id && ReactDOM.createPortal(
                        <>
                          <div className="fixed inset-0 z-[200]" onClick={() => setOpenMemberDropdown(null)} />
                          <div className="fixed w-28 rounded-lg border border-white/10 py-1 z-[201] animate-in" style={{ top: memberDropdownPos.top, right: memberDropdownPos.right, background: 'rgb(20, 20, 20)', boxShadow: '0 15px 30px rgba(0,0,0,0.5)' }}>
                            <button onClick={() => { updateMemberPerm(member.id, 'view'); setOpenMemberDropdown(null); }} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${member.permission === 'view' ? 'text-emerald-400 bg-emerald-500/10' : 'text-[#f3f4f6] hover:bg-white/10'}`}>View</button>
                            <button onClick={() => { updateMemberPerm(member.id, 'edit'); setOpenMemberDropdown(null); }} className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${member.permission === 'edit' ? 'text-emerald-400 bg-emerald-500/10' : 'text-[#f3f4f6] hover:bg-white/10'}`}>Edit</button>
                          </div>
                        </>,
                        document.body
                      )}
                    </div>
                    <button
                      onClick={() => removeMember(member.id)}
                      className="p-1 rounded hover:bg-red-500/20 text-[#6b7280] hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {members.length === 0 && (
              <div className="text-center text-[#6b7280] text-sm py-4">
                No members yet. Share the invite link to add collaborators.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// AssigneeSection (member-based assignee picker)
// ============================================================
function AssigneeSection({ task, board, canEdit }: { task: Task; board: Board; canEdit: boolean }) {
  const updateTask = useStore((s) => s.updateTask);
  const [members, setMembers] = useState<{ id: string; displayName: string }[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>(task.assignees || []);

  useEffect(() => {
    api.boards.members(board.id).then((m) => setMembers(m)).catch(() => {});
  }, [board.id]);

  const toggleAssignee = async (member: { id: string; displayName: string }) => {
    const exists = assignees.find((a) => a.name === member.displayName);
    let newAssignees: { id: string; name: string }[];
    if (exists) {
      newAssignees = assignees.filter((a) => a.name !== member.displayName);
    } else {
      newAssignees = [...assignees, { id: member.id, name: member.displayName }];
    }
    setAssignees(newAssignees);
    updateTask(task.id, { assignees: newAssignees });
    try {
      await api.tasks.update(task.id, { assignees: newAssignees });
    } catch {}
  };

  return (
    <div>
      <label className="text-xs text-[#6b7280] mb-2 block flex items-center gap-1">
        <Users size={12} /> Assignees ({assignees.length})
      </label>
      <div className="flex flex-wrap gap-1 mb-2">
        {assignees.map((a) => (
          <span
            key={a.id}
            className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs border border-emerald-500/20"
          >
            <span className="w-4 h-4 rounded-full bg-emerald-500/30 flex items-center justify-center text-[8px] font-bold">
              {a.name.charAt(0).toUpperCase()}
            </span>
            {a.name}
            {canEdit && (
              <button
                onClick={() => toggleAssignee({ id: a.id, displayName: a.name })}
                className="ml-0.5 hover:text-red-400 transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        {assignees.length === 0 && !showPicker && (
          <span className="text-xs text-[#6b7280]">No assignees</span>
        )}
      </div>
      {canEdit && (
        <>
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="text-xs text-[#6b7280] hover:text-emerald-400 transition-colors flex items-center gap-1"
          >
            <Plus size={12} /> {showPicker ? 'Close' : 'Assign member'}
          </button>
          {showPicker && (
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {members.length === 0 && (
                <p className="text-[10px] text-[#6b7280]">No board members found</p>
              )}
              {members.map((m) => {
                const isAssigned = assignees.some((a) => a.name === m.displayName);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleAssignee(m)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-left transition-colors ${
                      isAssigned
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-white/[0.03] text-[#d1d5db] hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      isAssigned ? 'bg-emerald-500/30 text-emerald-400' : 'bg-white/10 text-[#6b7280]'
                    }`}>
                      {m.displayName.charAt(0).toUpperCase()}
                    </span>
                    {m.displayName}
                    {isAssigned && <CheckSquare size={12} className="ml-auto" />}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// TaskModal (inline editing modal)
// ============================================================
interface TaskModalProps {
  task: Task;
  columnId: string;
  board: Board;
  onClose: () => void;
  permission: 'owner' | 'edit' | 'view';
}

function TaskModal({ task, columnId, board, onClose, permission }: TaskModalProps) {
  const updateTask = useStore((s) => s.updateTask);
  const removeTask = useStore((s) => s.removeTask);
  const pushHistory = useStore((s) => s.pushHistory);
  const user = useStore((s) => s.user);

  const [title, setTitle] = useState(task.title);
  const [content, setContent] = useState(task.content);
  const [color, setColor] = useState(task.color || '');
  const [durationMinutes, setDurationMinutes] = useState(task.durationMinutes);
  const [saving, setSaving] = useState(false);
  const [timeLogMinutes, setTimeLogMinutes] = useState('');
  const [newCheckpoint, setNewCheckpoint] = useState('');
  const [checkpoints, setCheckpoints] = useState(task.checkpoints);
  const [newDepId, setNewDepId] = useState('');
  const [attachments, setAttachments] = useState<string[]>(task.attachments || []);
  const [previewImage, setPreviewImage] = useState<string | null>(task.previewImage);
  const [previewSettings, setPreviewSettings] = useState<{ offsetY: number; zoom: number }>(
    task.previewSettings || { offsetY: 50, zoom: 1 }
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canEdit = permission !== 'view';

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || !canEdit) return;
    setUploading(true);
    const newUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('image', files[i]);
      try {
        const res = await fetch(`/api/tasks/${task.id}/images`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        if (res.ok) {
          const { url } = await res.json();
          newUrls.push(url);
        }
      } catch {}
    }
    if (newUrls.length > 0) {
      const updated = [...attachments, ...newUrls];
      setAttachments(updated);
      // If no preview set yet, use the first image
      if (!previewImage) {
        setPreviewImage(newUrls[0]);
      }
    }
    setUploading(false);
  };

  const setAsPreview = (url: string) => {
    setPreviewImage(url);
  };

  const removeImage = (url: string) => {
    setAttachments((prev) => prev.filter((u) => u !== url));
    if (previewImage === url) {
      const remaining = attachments.filter((u) => u !== url);
      setPreviewImage(remaining.length > 0 ? remaining[0] : null);
    }
    // Delete from server
    const filename = url.split('/').pop();
    if (filename) {
      fetch(`/api/images/${filename}`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
    }
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const updates: Partial<Task> & { attachments?: string[] } = { title, content, color: color || null, durationMinutes, previewImage, previewSettings };
      const before: Partial<Task> = {
        title: task.title,
        content: task.content,
        color: task.color,
        durationMinutes: task.durationMinutes,
        previewImage: task.previewImage,
      };
      const result = await api.tasks.update(task.id, { ...updates, checkpoints, attachments });
      updateTask(task.id, result);
      pushHistory({
        type: 'updateTask',
        taskId: task.id,
        columnId,
        before,
        after: updates,
        label: `Update task "${title}"`,
      });
      onClose();
    } catch {
      // handle silently
    } finally {
      setSaving(false);
    }
  };

  const [showTaskDeleteConfirm, setShowTaskDeleteConfirm] = useState(false);

  const deleteTask = async () => {
    if (!canEdit) return;
    setShowTaskDeleteConfirm(false);
    try {
      await api.tasks.delete(task.id);
      removeTask(task.id, columnId);
      pushHistory({
        type: 'deleteTask',
        task,
        columnId,
        label: `Delete task "${task.title}"`,
      });
      onClose();
    } catch {
      // handle silently
    }
  };

  const addTimeLog = async () => {
    if (!canEdit || !timeLogMinutes) return;
    const mins = parseInt(timeLogMinutes, 10);
    if (isNaN(mins) || mins <= 0) return;
    try {
      const log = await api.tasks.addTimeLog(task.id, user?.displayName || 'Anonymous', mins);
      updateTask(task.id, { timeLogs: [...task.timeLogs, log] });
      setTimeLogMinutes('');
    } catch {
      // handle silently
    }
  };

  const addCheckpointHandler = async () => {
    if (!canEdit || !newCheckpoint.trim()) return;
    try {
      const cp = await api.tasks.addCheckpoint(task.id, newCheckpoint.trim());
      setCheckpoints((prev) => [...prev, cp]);
      updateTask(task.id, { checkpoints: [...checkpoints, cp] });
      setNewCheckpoint('');
    } catch {
      // handle silently
    }
  };

  const toggleCheckpoint = async (cpId: string) => {
    if (!canEdit) return;
    const cp = checkpoints.find((c) => c.id === cpId);
    if (!cp) return;
    try {
      const updated = await api.tasks.updateCheckpoint(cpId, { isCompleted: !cp.isCompleted });
      const newCps = checkpoints.map((c) => (c.id === cpId ? updated : c));
      setCheckpoints(newCps);
      updateTask(task.id, { checkpoints: newCps });
    } catch {
      // handle silently
    }
  };

  const deleteCheckpoint = async (cpId: string) => {
    if (!canEdit) return;
    try {
      await api.tasks.deleteCheckpoint(cpId);
      const newCps = checkpoints.filter((c) => c.id !== cpId);
      setCheckpoints(newCps);
      updateTask(task.id, { checkpoints: newCps });
    } catch {
      // handle silently
    }
  };

  const addDependency = async () => {
    if (!canEdit || !newDepId.trim()) return;
    try {
      await api.tasks.addDependency(task.id, newDepId.trim());
      updateTask(task.id, { dependencyIds: [...task.dependencyIds, newDepId.trim()] });
      setNewDepId('');
    } catch {
      // handle silently
    }
  };

  const removeDependency = async (depId: string) => {
    if (!canEdit) return;
    try {
      await api.tasks.removeDependency(task.id, depId);
      updateTask(task.id, {
        dependencyIds: task.dependencyIds.filter((d) => d !== depId),
      });
    } catch {
      // handle silently
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative glass rounded-2xl border border-white/10 w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 animate-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[#f3f4f6] font-[Syne]">
            {canEdit ? 'Edit Task' : 'View Task'}
          </h2>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                onClick={() => setShowTaskDeleteConfirm(true)}
                className="p-2 rounded-lg hover:bg-red-500/20 text-[#6b7280] hover:text-red-400 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-[#6b7280] mb-1 block">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 font-[Syne]"
              placeholder="Task title..."
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs text-[#6b7280] mb-1 block">Description</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={!canEdit}
              rows={4}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 resize-none"
              placeholder="Task description..."
            />
          </div>

          {/* Color & Duration */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-xs text-[#6b7280] mb-1 block">Color</label>
              <input
                type="color"
                value={color || '#22c55e'}
                onChange={(e) => setColor(e.target.value)}
                disabled={!canEdit}
                className="w-full h-9 bg-white/5 border border-white/10 rounded-lg cursor-pointer disabled:opacity-50"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#6b7280] mb-1 block">Duration (minutes)</label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
                disabled={!canEdit}
                min={0}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 font-mono"
              />
            </div>
          </div>

          {/* Images */}
          <div>
            <label className="text-xs text-[#6b7280] mb-2 block flex items-center gap-1">
              <ImageIcon size={12} /> Images ({attachments.length})
            </label>

            {/* Image grid */}
            {attachments.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {attachments.map((url) => (
                  <div key={url} className="relative group rounded-lg overflow-hidden aspect-square bg-white/5">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      {canEdit && (
                        <>
                          <button
                            onClick={() => setAsPreview(url)}
                            title="Set as card preview"
                            className={`p-1.5 rounded-lg transition-colors ${
                              previewImage === url
                                ? 'bg-emerald-500/30 text-emerald-400'
                                : 'bg-white/10 text-white hover:bg-emerald-500/20 hover:text-emerald-400'
                            }`}
                          >
                            <Star size={12} fill={previewImage === url ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => removeImage(url)}
                            title="Remove image"
                            className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                    {previewImage === url && (
                      <div className="absolute top-1 right-1 p-0.5 bg-emerald-500 rounded-full">
                        <Star size={8} fill="white" className="text-white" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Preview image position/zoom controls */}
            {previewImage && canEdit && (
              <div className="bg-white/5 rounded-lg p-3 mb-2 space-y-2">
                <p className="text-[10px] text-[#6b7280] uppercase tracking-wider font-medium">Preview Adjustment</p>
                {/* Live preview */}
                <div className="relative rounded-lg overflow-hidden h-20 bg-black/30">
                  <img
                    src={previewImage}
                    alt=""
                    className="w-full h-full opacity-30"
                    style={{
                      objectFit: 'cover',
                      objectPosition: `center ${previewSettings.offsetY}%`,
                      transform: `scale(${previewSettings.zoom})`,
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/70 to-transparent" />
                  <span className="absolute bottom-1.5 left-2 text-[10px] text-white/60 font-mono">preview</span>
                </div>
                {/* Position slider */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-[#6b7280]">Position (Y)</span>
                    <span className="text-[10px] text-[#f3f4f6] font-mono">{previewSettings.offsetY}%</span>
                  </div>
                  <input
                    type="range" min={0} max={100} step={1}
                    value={previewSettings.offsetY}
                    onChange={(e) => setPreviewSettings((s) => ({ ...s, offsetY: parseInt(e.target.value) }))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#22c55e' }}
                  />
                </div>
                {/* Zoom slider */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-[#6b7280]">Zoom</span>
                    <span className="text-[10px] text-[#f3f4f6] font-mono">{previewSettings.zoom.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range" min={0.3} max={3} step={0.1}
                    value={previewSettings.zoom}
                    onChange={(e) => setPreviewSettings((s) => ({ ...s, zoom: parseFloat(e.target.value) }))}
                    className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                    style={{ accentColor: '#22c55e' }}
                  />
                </div>
              </div>
            )}

            {/* Upload button */}
            {canEdit && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-white/10 rounded-lg text-[#6b7280] hover:border-emerald-500/30 hover:text-emerald-400 transition-colors text-sm"
              >
                {uploading ? (
                  <><Loader2 size={14} className="animate-spin" /> Uploading...</>
                ) : (
                  <><Upload size={14} /> Click to upload images</>
                )}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleImageUpload(e.target.files)}
            />
          </div>

          {/* Checkpoints */}
          <div>
            <label className="text-xs text-[#6b7280] mb-2 block flex items-center gap-1">
              <CheckSquare size={12} /> Checkpoints ({checkpoints.filter((c) => c.isCompleted).length}/{checkpoints.length})
            </label>
            <div className="space-y-1 mb-2">
              {checkpoints.map((cp) => (
                <div
                  key={cp.id}
                  className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-1.5"
                >
                  <button
                    onClick={() => toggleCheckpoint(cp.id)}
                    disabled={!canEdit}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      cp.isCompleted
                        ? 'bg-emerald-500 border-emerald-500'
                        : 'border-white/20 hover:border-emerald-500/50'
                    }`}
                  >
                    {cp.isCompleted && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.5" />
                      </svg>
                    )}
                  </button>
                  <span
                    className={`flex-1 text-sm ${
                      cp.isCompleted ? 'text-[#6b7280] line-through' : 'text-[#f3f4f6]'
                    }`}
                  >
                    {cp.title}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => deleteCheckpoint(cp.id)}
                      className="p-1 rounded hover:bg-red-500/20 text-[#6b7280] hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <input
                  value={newCheckpoint}
                  onChange={(e) => setNewCheckpoint(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCheckpointHandler()}
                  placeholder="Add checkpoint..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50"
                />
                <button
                  onClick={addCheckpointHandler}
                  className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Time Logs */}
          <div>
            <label className="text-xs text-[#6b7280] mb-2 block">Time Logs</label>
            <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
              {task.timeLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-xs"
                >
                  <span className="text-[#f3f4f6]">{log.userName}</span>
                  <span className="text-[#6b7280] font-mono">{log.minutes}m</span>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={timeLogMinutes}
                  onChange={(e) => setTimeLogMinutes(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTimeLog()}
                  placeholder="Minutes..."
                  min={1}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 font-mono"
                />
                <button
                  onClick={addTimeLog}
                  className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
                >
                  Log Time
                </button>
              </div>
            )}
          </div>

          {/* Dependencies */}
          <div>
            <label className="text-xs text-[#6b7280] mb-2 block flex items-center gap-1">
              <Link2 size={12} /> Dependencies ({task.dependencyIds.length})
            </label>
            <div className="space-y-1 mb-2">
              {task.dependencyIds.map((depId) => {
                const depTask = board.columns
                  .flatMap((c) => c.tasks)
                  .find((t) => t.id === depId);
                return (
                  <div
                    key={depId}
                    className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-xs"
                  >
                    <span className="text-[#f3f4f6]">
                      {depTask ? depTask.title : depId}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => removeDependency(depId)}
                        className="p-1 rounded hover:bg-red-500/20 text-[#6b7280] hover:text-red-400 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <input
                  value={newDepId}
                  onChange={(e) => setNewDepId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDependency()}
                  placeholder="Dependency task ID..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 font-mono"
                />
                <button
                  onClick={addDependency}
                  className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Assignees */}
          <AssigneeSection task={task} board={board} canEdit={canEdit} />

          {/* Save button */}
          {canEdit && (
            <div className="flex justify-end pt-2">
              <button
                onClick={save}
                disabled={saving}
                className="px-6 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors glow-primary disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        <ConfirmDialog
          isOpen={showTaskDeleteConfirm}
          title="Delete Task"
          message={`Are you sure you want to delete "${title || 'Untitled'}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={deleteTask}
          onCancel={() => setShowTaskDeleteConfirm(false)}
        />
      </div>
    </div>
  );
}

// ============================================================
// KanbanBoard (Main Component)
// ============================================================
function KanbanBoard() {
  const { id: boardId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Store
  const user = useStore((s) => s.user);
  const currentBoard = useStore((s) => s.currentBoard);
  const setCurrentBoard = useStore((s) => s.setCurrentBoard);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const panOffset = useStore((s) => s.panOffset);
  const setPanOffset = useStore((s) => s.setPanOffset);
  const selectedTaskIds = useStore((s) => s.selectedTaskIds);
  const selectedColumnIds = useStore((s) => s.selectedColumnIds);
  const clearSelection = useStore((s) => s.clearSelection);
  const selectColumnsInRect = useStore((s) => s.selectColumnsInRect);
  const toggleTaskSelection = useStore((s) => s.toggleTaskSelection);
  const toggleColumnSelection = useStore((s) => s.toggleColumnSelection);
  const undoStack = useStore((s) => s.undoStack);
  const redoStack = useStore((s) => s.redoStack);
  const pushHistory = useStore((s) => s.pushHistory);
  const undoAction = useStore((s) => s.undo);
  const redoAction = useStore((s) => s.redo);
  const clearHistory = useStore((s) => s.clearHistory);

  // Store mutations
  const addColumnToStore = useStore((s) => s.addColumn);
  const updateColumnInStore = useStore((s) => s.updateColumn);
  const removeColumnFromStore = useStore((s) => s.removeColumn);
  const addTaskToStore = useStore((s) => s.addTask);
  const updateTaskInStore = useStore((s) => s.updateTask);
  const removeTaskFromStore = useStore((s) => s.removeTask);
  const moveTaskInStore = useStore((s) => s.moveTask);

  // Local state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<{ task: Task; columnId: string } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const showCompletedRef = useRef(false);
  showCompletedRef.current = showCompleted;
  const [linkingFromTaskId, setLinkingFromTaskId] = useState<string | null>(null);
  const [linkMousePos, setLinkMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);

  // Presence
  const [activeUsers, setActiveUsers] = useState<{ id: string; name: string; color: string; action: string; taskId?: string }[]>([]);

  // Action History
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<{id: string; userName: string; actionType: string; actionSummary: string; hasSnapshot: boolean; createdAt: string}[]>([]);

  // Confirm dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; message: string; details?: string[];
    variant: 'danger' | 'warning' | 'default';
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Dragging columns
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; colX: number; colY: number; scrollX: number; scrollY: number } | null>(null);

  // Panning
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Selection rectangle
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ctrlHeld, setCtrlHeld] = useState(false);

  // Task drag
  const [dragTaskInfo, setDragTaskInfo] = useState<{ taskId: string; columnId: string } | null>(null);

  // Clipboard
  const [clipboard, setClipboard] = useState<{ tasks: Task[]; columns: ColumnType[] } | null>(null);

  // New column
  const [showNewColumnForm, setShowNewColumnForm] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');

  // Editing board title
  const [editingBoardTitle, setEditingBoardTitle] = useState(false);
  const [boardTitleDraft, setBoardTitleDraft] = useState('');

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when dragging columns near edges
  const autoScrollRef = useRef<{ mouseX: number; mouseY: number; rafId: number | null }>({
    mouseX: 0,
    mouseY: 0,
    rafId: null,
  });

  const startAutoScroll = useCallback(() => {
    const EDGE_ZONE = 60;
    const MAX_SPEED = 18;

    const tick = () => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const { mouseX, mouseY } = autoScrollRef.current;

      let dx = 0;
      let dy = 0;

      if (mouseX < rect.left + EDGE_ZONE) {
        dx = -MAX_SPEED * Math.max(0, 1 - (mouseX - rect.left) / EDGE_ZONE);
      } else if (mouseX > rect.right - EDGE_ZONE) {
        dx = MAX_SPEED * Math.max(0, 1 - (rect.right - mouseX) / EDGE_ZONE);
      }

      if (mouseY < rect.top + EDGE_ZONE) {
        dy = -MAX_SPEED * Math.max(0, 1 - (mouseY - rect.top) / EDGE_ZONE);
      } else if (mouseY > rect.bottom - EDGE_ZONE) {
        dy = MAX_SPEED * Math.max(0, 1 - (rect.bottom - mouseY) / EDGE_ZONE);
      }

      if (dx !== 0 || dy !== 0) {
        container.scrollLeft += dx;
        container.scrollTop += dy;
      }

      autoScrollRef.current.rafId = requestAnimationFrame(tick);
    };

    autoScrollRef.current.rafId = requestAnimationFrame(tick);
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRef.current.rafId !== null) {
      cancelAnimationFrame(autoScrollRef.current.rafId);
      autoScrollRef.current.rafId = null;
    }
  }, []);

  const columns = currentBoard?.columns ?? [];
  const permission = currentBoard?.permission ?? 'view';
  const canEdit = permission !== 'view';

  // ============================================================
  // Load board
  // ============================================================
  useEffect(() => {
    if (!boardId) {
      navigate('/');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    api.boards
      .get(boardId)
      .then((board) => {
        if (!cancelled) {
          setCurrentBoard(board);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load board');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardId, navigate, setCurrentBoard]);

  // ============================================================
  // WebSocket – skip echoed messages from our own mutations
  // ============================================================
  const recentMutations = useRef(new Set<string>());

  const markMutation = useCallback((key: string) => {
    recentMutations.current.add(key);
    setTimeout(() => recentMutations.current.delete(key), 3000);
  }, []);

  useEffect(() => {
    if (!boardId) return;

    wsClient.connect();
    wsClient.joinBoard(boardId);

    const handler = (msg: WSMessage) => {
      // Build a key to detect echoed messages from our own actions
      let echoKey = '';
      switch (msg.type) {
        case 'task:created': echoKey = `task:created:${msg.task.id}`; break;
        case 'task:moved': echoKey = `task:moved:${msg.taskId}`; break;
        case 'task:deleted': echoKey = `task:deleted:${msg.taskId}`; break;
        case 'column:created': echoKey = `column:created:${msg.column.id}`; break;
        case 'column:deleted': echoKey = `column:deleted:${msg.columnId}`; break;
      }
      if (echoKey && recentMutations.current.has(echoKey)) {
        recentMutations.current.delete(echoKey);
        return; // Skip this echoed message
      }

      switch (msg.type) {
        case 'column:created':
          addColumnToStore(msg.column);
          break;
        case 'column:updated':
          updateColumnInStore(msg.column.id, msg.column);
          break;
        case 'column:deleted':
          removeColumnFromStore(msg.columnId);
          break;
        case 'task:created':
          addTaskToStore(msg.columnId, msg.task);
          break;
        case 'task:updated':
          updateTaskInStore(msg.task.id, msg.task);
          break;
        case 'task:deleted':
          removeTaskFromStore(msg.taskId, msg.columnId);
          break;
        case 'task:moved':
          moveTaskInStore(msg.taskId, msg.fromColumnId, msg.toColumnId, msg.position, msg.task);
          break;
        case 'board:updated':
          setCurrentBoard(msg.board);
          break;
        case 'presence:update':
          setActiveUsers(msg.users);
          break;
        default:
          break;
      }
    };

    wsClient.onMessage(handler);

    // Send initial activity on join
    wsClient.send({ type: 'activity', action: 'viewing' });

    return () => {
      wsClient.offMessage(handler);
      wsClient.leaveBoard(boardId);
    };
  }, [
    boardId,
    addColumnToStore,
    updateColumnInStore,
    removeColumnFromStore,
    addTaskToStore,
    updateTaskInStore,
    removeTaskFromStore,
    moveTaskInStore,
    setCurrentBoard,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setCurrentBoard(null);
      clearHistory();
    };
  }, [setCurrentBoard, clearHistory]);

  // ============================================================
  // Keyboard shortcuts
  // ============================================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;

      // Track modifier keys
      if (e.key === 'Control') setCtrlHeld(true);
      if (e.key === ' ' && !isInput) {
        e.preventDefault();
        setSpaceHeld(true);
      }

      // Escape
      if (e.key === 'Escape') {
        setLinkingFromTaskId(null);
        clearSelection();
        setEditingTask(null);
        setShowShareModal(false);
        setShowNewColumnForm(false);
        setShowHistory(false);
      }

      // Don't handle shortcuts when typing in inputs (except Escape above)
      if (isInput && !(e.ctrlKey || e.metaKey)) return;

      // Delete
      if (e.key === 'Delete' && canEdit) {
        handleDeleteSelected();
      }

      // Ctrl+Z Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Ctrl+Shift+Z or Ctrl+Y Redo
      if (
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z') ||
        ((e.ctrlKey || e.metaKey) && e.key === 'y')
      ) {
        e.preventDefault();
        handleRedo();
      }

      // Ctrl+C Copy (only when not in input)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !e.shiftKey && !isInput) {
        handleCopy();
      }

      // Ctrl+V Paste (only when not in input)
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.shiftKey && !isInput) {
        handlePaste();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') setCtrlHeld(false);
      if (e.key === ' ') setSpaceHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, selectedTaskIds, selectedColumnIds, clipboard, undoStack, redoStack]);

  // ============================================================
  // Undo / Redo handlers
  // ============================================================
  const applyHistoryEntry = useCallback(
    async (entry: HistoryEntry, reverse: boolean) => {
      try {
        switch (entry.type) {
          case 'updateTask': {
            const data = reverse ? entry.before : entry.after;
            await api.tasks.update(entry.taskId, data);
            updateTaskInStore(entry.taskId, data);
            break;
          }
          case 'updateColumn': {
            const data = reverse ? entry.before : entry.after;
            await api.columns.update(entry.columnId, data);
            updateColumnInStore(entry.columnId, data);
            break;
          }
          case 'moveTask': {
            const fromCol = reverse ? entry.toColumnId : entry.fromColumnId;
            const toCol = reverse ? entry.fromColumnId : entry.toColumnId;
            const pos = reverse ? entry.fromPosition : entry.toPosition;
            await api.tasks.move(entry.taskId, toCol, pos);
            moveTaskInStore(entry.taskId, fromCol, toCol, pos);
            break;
          }
          case 'deleteTask': {
            if (reverse) {
              // Re-create the task
              const restored = await api.tasks.create(entry.columnId, entry.task);
              addTaskToStore(entry.columnId, restored);
            } else {
              await api.tasks.delete(entry.task.id);
              removeTaskFromStore(entry.task.id, entry.columnId);
            }
            break;
          }
          case 'deleteColumn': {
            if (reverse) {
              // Re-create the column
              if (!currentBoard) break;
              const restored = await api.columns.create(currentBoard.id, {
                title: entry.column.title,
                x: entry.column.x,
                y: entry.column.y,
                color: entry.column.color || undefined,
              });
              addColumnToStore(restored);
            } else {
              await api.columns.delete(entry.column.id);
              removeColumnFromStore(entry.column.id);
            }
            break;
          }
          case 'createTask': {
            if (reverse) {
              await api.tasks.delete(entry.taskId);
              removeTaskFromStore(entry.taskId, entry.columnId);
            }
            // Forward for createTask is already applied (original creation)
            break;
          }
          case 'createColumn': {
            if (reverse) {
              await api.columns.delete(entry.columnId);
              removeColumnFromStore(entry.columnId);
            }
            break;
          }
          case 'bulkUpdateColumns': {
            const data = reverse ? entry.before : entry.after;
            await api.columns.bulkUpdate(data);
            data.forEach((u) => updateColumnInStore(u.id, { x: u.x, y: u.y }));
            break;
          }
        }
      } catch {
        // Silently handle errors during undo/redo
      }
    },
    [
      currentBoard,
      addColumnToStore,
      updateColumnInStore,
      removeColumnFromStore,
      addTaskToStore,
      updateTaskInStore,
      removeTaskFromStore,
      moveTaskInStore,
    ]
  );

  const handleUndo = useCallback(() => {
    const entry = undoAction();
    if (entry) applyHistoryEntry(entry, true);
  }, [undoAction, applyHistoryEntry]);

  const handleRedo = useCallback(() => {
    const entry = redoAction();
    if (entry) applyHistoryEntry(entry, false);
  }, [redoAction, applyHistoryEntry]);

  // ============================================================
  // Delete selected
  // ============================================================
  const handleDeleteSelected = useCallback(async () => {
    if (!canEdit) return;
    // Delete selected tasks
    for (const taskId of selectedTaskIds) {
      for (const col of columns) {
        const task = col.tasks.find((t) => t.id === taskId);
        if (task) {
          try {
            await api.tasks.delete(taskId);
            markMutation(`task:deleted:${taskId}`);
            removeTaskFromStore(taskId, col.id);
            pushHistory({ type: 'deleteTask', task, columnId: col.id, label: `Delete task "${task.title}"` });
          } catch {
            // handle silently
          }
          break;
        }
      }
    }
    // Delete selected columns
    for (const colId of selectedColumnIds) {
      const col = columns.find((c) => c.id === colId);
      if (col) {
        try {
          await api.columns.delete(colId);
          markMutation(`column:deleted:${colId}`);
          removeColumnFromStore(colId);
          pushHistory({ type: 'deleteColumn', column: col, label: `Delete column "${col.title}"` });
        } catch {
          // handle silently
        }
      }
    }
    clearSelection();
  }, [canEdit, selectedTaskIds, selectedColumnIds, columns, removeTaskFromStore, removeColumnFromStore, pushHistory, clearSelection]);

  // ============================================================
  // Copy / Paste
  // ============================================================
  const handleCopy = useCallback(() => {
    const copiedTasks: Task[] = [];
    const copiedColumns: ColumnType[] = [];

    for (const col of columns) {
      if (selectedColumnIds.has(col.id)) {
        copiedColumns.push(col);
      }
      for (const task of col.tasks) {
        if (selectedTaskIds.has(task.id)) {
          copiedTasks.push(task);
        }
      }
    }

    if (copiedTasks.length > 0 || copiedColumns.length > 0) {
      setClipboard({ tasks: copiedTasks, columns: copiedColumns });
    }
  }, [columns, selectedTaskIds, selectedColumnIds]);

  const handlePaste = useCallback(async () => {
    if (!clipboard || !canEdit || !currentBoard) return;

    // Paste tasks into their original columns
    for (const task of clipboard.tasks) {
      try {
        const created = await api.tasks.create(task.columnId, {
          title: `${task.title} (copy)`,
          content: task.content,
          color: task.color,
          durationMinutes: task.durationMinutes,
        });
        addTaskToStore(task.columnId, created);
        pushHistory({ type: 'createTask', taskId: created.id, columnId: task.columnId, label: `Paste task "${created.title}"` });
      } catch {
        // handle silently
      }
    }

    // Paste columns offset by 50px
    for (const col of clipboard.columns) {
      try {
        const created = await api.columns.create(currentBoard.id, {
          title: `${col.title} (copy)`,
          x: col.x + 50,
          y: col.y + 50,
          color: col.color || undefined,
        });
        addColumnToStore(created);
        pushHistory({ type: 'createColumn', columnId: created.id, label: `Paste column "${created.title}"` });
      } catch {
        // handle silently
      }
    }
  }, [clipboard, canEdit, currentBoard, addTaskToStore, addColumnToStore, pushHistory]);

  // ============================================================
  // Zoom (mouse wheel)
  // ============================================================
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const step = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.3, Math.min(2.5, zoom + step));
        setZoom(newZoom);
      }
    },
    [zoom, setZoom]
  );

  // ============================================================
  // Pan handling
  // ============================================================
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Middle mouse button pan
      if (e.button === 1) {
        e.preventDefault();
        setIsPanning(true);
        const container = containerRef.current;
        if (container) {
          setPanStart({
            x: e.clientX,
            y: e.clientY,
            scrollX: container.scrollLeft,
            scrollY: container.scrollTop,
          });
        }
        return;
      }

      // Space + left click pan
      if (spaceHeld && e.button === 0) {
        e.preventDefault();
        setIsPanning(true);
        const container = containerRef.current;
        if (container) {
          setPanStart({
            x: e.clientX,
            y: e.clientY,
            scrollX: container.scrollLeft,
            scrollY: container.scrollTop,
          });
        }
        return;
      }

      // Cancel linking mode on any canvas click
      if (linkingFromTaskId) {
        setLinkingFromTaskId(null);
        setHighlightedTaskId(null);
        return;
      }

      // Left click on empty canvas => marquee selection
      if (e.button === 0 && e.target === e.currentTarget) {
        // Check if clicking on the inner canvas div
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (!ctrlHeld) {
          clearSelection();
        }

        setSelectionStart({ x: e.clientX, y: e.clientY });
        setSelectionRect(null);
      }
    },
    [spaceHeld, ctrlHeld, clearSelection]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      // Link mode cursor tracking
      if (linkingFromTaskId) {
        setLinkMousePos({ x: e.clientX, y: e.clientY });
      }

      // Panning
      if (isPanning && panStart) {
        const container = containerRef.current;
        if (container) {
          container.scrollLeft = panStart.scrollX - (e.clientX - panStart.x);
          container.scrollTop = panStart.scrollY - (e.clientY - panStart.y);
        }
        return;
      }

      // Column dragging
      if (draggingColumnId && dragStart) {
        autoScrollRef.current.mouseX = e.clientX;
        autoScrollRef.current.mouseY = e.clientY;
        const container = containerRef.current;
        const scrollDx = container ? (container.scrollLeft - dragStart.scrollX) / zoom : 0;
        const scrollDy = container ? (container.scrollTop - dragStart.scrollY) / zoom : 0;
        const dx = (e.clientX - dragStart.x) / zoom + scrollDx;
        const dy = (e.clientY - dragStart.y) / zoom + scrollDy;
        updateColumnInStore(draggingColumnId, {
          x: Math.max(0, dragStart.colX + dx),
          y: Math.max(0, dragStart.colY + dy),
        });
        return;
      }

      // Marquee selection
      if (selectionStart) {
        const x = Math.min(selectionStart.x, e.clientX);
        const y = Math.min(selectionStart.y, e.clientY);
        const w = Math.abs(e.clientX - selectionStart.x);
        const h = Math.abs(e.clientY - selectionStart.y);
        setSelectionRect({ x, y, w, h });
      }
    },
    [
      linkingFromTaskId,
      isPanning,
      panStart,
      draggingColumnId,
      dragStart,
      selectionStart,
      zoom,
      updateColumnInStore,
    ]
  );

  const handleCanvasMouseUp = useCallback(
    async (e: React.MouseEvent) => {
      // End panning
      if (isPanning) {
        setIsPanning(false);
        setPanStart(null);
        return;
      }

      // End column dragging
      if (draggingColumnId && dragStart) {
        stopAutoScroll();
        const col = columns.find((c) => c.id === draggingColumnId);
        if (col && canEdit) {
          try {
            await api.columns.update(draggingColumnId, { x: col.x, y: col.y });
            pushHistory({
              type: 'updateColumn',
              columnId: draggingColumnId,
              before: { x: dragStart.colX, y: dragStart.colY },
              after: { x: col.x, y: col.y },
              label: `Move column "${col.title}"`,
            });
          } catch {
            // Revert on failure
            updateColumnInStore(draggingColumnId, { x: dragStart.colX, y: dragStart.colY });
          }
        }
        setDraggingColumnId(null);
        setDragStart(null);
        return;
      }

      // End marquee selection
      if (selectionStart && selectionRect) {
        // Find columns whose screen positions overlap the selection rect
        const container = containerRef.current;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const matchingIds: string[] = [];

          for (const col of columns) {
            const colScreenX = col.x * zoom - container.scrollLeft + containerRect.left;
            const colScreenY = col.y * zoom - container.scrollTop + containerRect.top;
            const colScreenW = 300 * zoom;
            const colScreenH = (50 + col.tasks.length * 80) * zoom;

            const overlapX = colScreenX < selectionRect.x + selectionRect.w && colScreenX + colScreenW > selectionRect.x;
            const overlapY = colScreenY < selectionRect.y + selectionRect.h && colScreenY + colScreenH > selectionRect.y;

            if (overlapX && overlapY) {
              matchingIds.push(col.id);
            }
          }

          if (ctrlHeld) {
            // Add to existing selection
            const existing = Array.from(selectedColumnIds);
            selectColumnsInRect([...existing, ...matchingIds]);
          } else {
            selectColumnsInRect(matchingIds);
          }
        }

        setSelectionStart(null);
        setSelectionRect(null);
        return;
      }

      setSelectionStart(null);
      setSelectionRect(null);

      // Cancel linking on empty canvas click
      if (linkingFromTaskId && e.target === e.currentTarget) {
        setLinkingFromTaskId(null);
      }
    },
    [
      isPanning,
      draggingColumnId,
      dragStart,
      selectionStart,
      selectionRect,
      columns,
      zoom,
      ctrlHeld,
      canEdit,
      linkingFromTaskId,
      selectedColumnIds,
      updateColumnInStore,
      selectColumnsInRect,
      pushHistory,
      stopAutoScroll,
    ]
  );

  // ============================================================
  // Column drag start
  // ============================================================
  const handleColumnDragStart = useCallback(
    (columnId: string, e: React.MouseEvent) => {
      if (!canEdit) return;
      const col = columns.find((c) => c.id === columnId);
      if (!col) return;
      e.preventDefault();
      const container = containerRef.current;
      setDraggingColumnId(columnId);
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        colX: col.x,
        colY: col.y,
        scrollX: container?.scrollLeft ?? 0,
        scrollY: container?.scrollTop ?? 0,
      });
      autoScrollRef.current.mouseX = e.clientX;
      autoScrollRef.current.mouseY = e.clientY;
      startAutoScroll();
    },
    [canEdit, columns, startAutoScroll]
  );

  // ============================================================
  // Task DnD
  // ============================================================

  // Use refs for values needed in drop handlers to avoid stale closures
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const dragTaskInfoRef = useRef(dragTaskInfo);
  dragTaskInfoRef.current = dragTaskInfo;

  // Track which column is being dragged over (reported by Column components)
  const dragOverColumnRef = useRef<string | null>(null);
  const handleDragOverColumn = useCallback((columnId: string | null) => {
    dragOverColumnRef.current = columnId;
  }, []);

  const doMoveTask = useCallback(async (taskId: string, sourceColumnId: string, targetColumnId: string) => {
    const cols = columnsRef.current;
    const targetCol = cols.find((c) => c.id === targetColumnId);
    const position = targetCol ? targetCol.tasks.length : 0;

    markMutation(`task:moved:${taskId}`);
    moveTaskInStore(taskId, sourceColumnId, targetColumnId, position);

    try {
      await api.tasks.move(taskId, targetColumnId, position);
      pushHistory({
        type: 'moveTask',
        taskId,
        fromColumnId: sourceColumnId,
        toColumnId: targetColumnId,
        fromPosition: 0,
        toPosition: position,
        label: 'Move task',
      });
    } catch {
      moveTaskInStore(taskId, targetColumnId, sourceColumnId, 0);
    }
  }, [moveTaskInStore, pushHistory, markMutation]);

  const handleCompleteTask = useCallback(async (taskId: string, _sourceColumnId: string) => {
    // Check if this task has incomplete dependencies
    const cols = columnsRef.current;
    const allTasks = cols.flatMap((c) => c.tasks);
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;

    if (task.dependencyIds.length > 0) {
      const incompleteDeps = task.dependencyIds
        .map((depId) => allTasks.find((t) => t.id === depId))
        .filter((dep) => dep && !dep.completedAt);

      if (incompleteDeps.length > 0) {
        const depNames = incompleteDeps.map((dep) => dep!.title || 'Untitled');
        setConfirmDialog({
          title: 'Incomplete Dependencies',
          message: 'This task has dependencies that are not yet completed. You must complete them first.',
          details: depNames,
          variant: 'warning',
          confirmLabel: 'OK',
          onConfirm: () => setConfirmDialog(null),
        });
        return;
      }
    }

    const now = new Date().toISOString();
    updateTaskInStore(taskId, { completedAt: now });
    try {
      await api.tasks.update(taskId, { completedAt: now });
    } catch {
      updateTaskInStore(taskId, { completedAt: null });
    }
  }, [updateTaskInStore]);

  const handleTaskDragStart = useCallback(
    (taskId: string, columnId: string, e: React.DragEvent) => {
      if (!canEdit) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ taskId, columnId }));
      setDragTaskInfo({ taskId, columnId });

      // Track position via 'drag' event on the element (fires during HTML5 DnD)
      // and complete the move on 'dragend'. mousemove doesn't fire during DnD.
      const el = e.nativeEvent.target as HTMLElement;
      let lastX = e.clientX, lastY = e.clientY;

      const onDrag = (ev: Event) => {
        const de = ev as DragEvent;
        if (de.clientX !== 0 || de.clientY !== 0) {
          lastX = de.clientX;
          lastY = de.clientY;
        }
      };

      const onDragEnd = () => {
        el.removeEventListener('drag', onDrag);
        el.removeEventListener('dragend', onDragEnd);
        setDragTaskInfo(null);

        // Check if dropped on the Completed sidebar (right 350px when open)
        if (showCompletedRef.current && lastX > window.innerWidth - 350) {
          handleCompleteTask(taskId, columnId);
          return;
        }

        const scrollEl = containerRef.current;
        if (!scrollEl) return;
        const rect = scrollEl.getBoundingClientRect();
        const x = (lastX - rect.left + scrollEl.scrollLeft) / zoom;
        const y = (lastY - rect.top + scrollEl.scrollTop) / zoom;

        let targetColId: string | null = null;
        let bestDist = Infinity;
        for (const col of columnsRef.current) {
          const colW = col.width || 300;
          const cx = col.x + colW / 2;
          const cy = col.y + 200;
          const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          if (dist < bestDist) { bestDist = dist; targetColId = col.id; }
        }

        if (targetColId && targetColId !== columnId && bestDist < 400) {
          doMoveTask(taskId, columnId, targetColId);
        }
      };

      el.addEventListener('drag', onDrag);
      el.addEventListener('dragend', onDragEnd);
    },
    [canEdit, doMoveTask, handleCompleteTask]
  );

  const handleTaskDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // Drop is handled by dragend + coordinate tracking in handleTaskDragStart.
  // This is just a no-op to satisfy the Column prop.
  const handleTaskDrop = useCallback(
    (_targetColumnId: string, e: React.DragEvent) => {
      e.preventDefault();
    },
    []
  );

  // ============================================================
  // Link creation
  // ============================================================
  const handleLinkStart = useCallback(
    (taskId: string) => {
      if (!canEdit) return;
      setLinkingFromTaskId(taskId);
      setHighlightedTaskId(taskId);
    },
    [canEdit]
  );

  const handleLinkEnd = useCallback(
    async (targetTaskId: string) => {
      if (!linkingFromTaskId || !canEdit) return;
      if (linkingFromTaskId === targetTaskId) {
        setLinkingFromTaskId(null);
        setHighlightedTaskId(null);
        return;
      }

      // Check for existing reverse dependency (B already depends on A)
      let sourceTask: Task | undefined;
      for (const col of columns) {
        const t = col.tasks.find((t) => t.id === linkingFromTaskId);
        if (t) { sourceTask = t; break; }
      }
      if (sourceTask && sourceTask.dependencyIds.includes(targetTaskId)) {
        const fromId = linkingFromTaskId;
        const toId = targetTaskId;
        const srcDeps = sourceTask.dependencyIds;
        setConfirmDialog({
          title: 'Reverse Dependency',
          message: 'A dependency already exists in the opposite direction. Do you want to reverse it?',
          variant: 'warning',
          confirmLabel: 'Reverse',
          onConfirm: async () => {
            setConfirmDialog(null);
            try {
              await api.tasks.removeDependency(fromId, toId);
              updateTaskInStore(fromId, { dependencyIds: srcDeps.filter((id) => id !== toId) });
              await api.tasks.addDependency(toId, fromId);
              for (const col of columns) {
                const t = col.tasks.find((t) => t.id === toId);
                if (t) { updateTaskInStore(toId, { dependencyIds: [...t.dependencyIds, fromId] }); break; }
              }
            } catch {}
          },
        });
        setLinkingFromTaskId(null);
        setHighlightedTaskId(null);
        return;
      }

      // Check if this exact dependency already exists
      let targetTask: Task | undefined;
      for (const col of columns) {
        const t = col.tasks.find((t) => t.id === targetTaskId);
        if (t) { targetTask = t; break; }
      }
      if (targetTask && targetTask.dependencyIds.includes(linkingFromTaskId)) {
        setLinkingFromTaskId(null);
        setHighlightedTaskId(null);
        return;
      }

      try {
        await api.tasks.addDependency(targetTaskId, linkingFromTaskId);
        for (const col of columns) {
          const task = col.tasks.find((t) => t.id === targetTaskId);
          if (task) {
            updateTaskInStore(targetTaskId, {
              dependencyIds: [...task.dependencyIds, linkingFromTaskId],
            });
            break;
          }
        }
      } catch {
        // handle silently
      }

      setLinkingFromTaskId(null);
      setHighlightedTaskId(null);
    },
    [linkingFromTaskId, canEdit, columns, updateTaskInStore]
  );

  // ============================================================
  // Column selection
  // ============================================================
  const handleSelectColumn = useCallback(
    (columnId: string, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        toggleColumnSelection(columnId);
      } else {
        clearSelection();
        toggleColumnSelection(columnId);
      }
    },
    [toggleColumnSelection, clearSelection]
  );

  // ============================================================
  // New column creation
  // ============================================================
  const handleCreateColumn = useCallback(async () => {
    if (!canEdit || !currentBoard || !newColumnTitle.trim()) return;

    // Calculate position
    const maxX = columns.reduce((max, col) => Math.max(max, col.x), -300);
    const newX = maxX + 350;
    const newY = 50;

    try {
      const created = await api.columns.create(currentBoard.id, {
        title: newColumnTitle.trim(),
        x: newX,
        y: newY,
      });
      markMutation(`column:created:${created.id}`);
      addColumnToStore(created);
      pushHistory({ type: 'createColumn', columnId: created.id, label: `Create column "${created.title}"` });
      setNewColumnTitle('');
      setShowNewColumnForm(false);
    } catch {
      // handle silently
    }
  }, [canEdit, currentBoard, newColumnTitle, columns, addColumnToStore, pushHistory]);

  // ============================================================
  // Align columns
  // ============================================================
  const handleAlignColumns = useCallback(async () => {
    if (!canEdit || columns.length === 0) return;

    const sorted = [...columns].sort((a, b) => a.x - b.x || a.y - b.y);
    const before = sorted.map((c) => ({ id: c.id, x: c.x, y: c.y }));
    const after = sorted.map((c, i) => ({ id: c.id, x: 50 + i * 350, y: 50 }));

    // Optimistic
    after.forEach((u) => updateColumnInStore(u.id, { x: u.x, y: u.y }));

    try {
      await api.columns.bulkUpdate(after);
      pushHistory({ type: 'bulkUpdateColumns', before, after, label: 'Align columns' });
    } catch {
      before.forEach((u) => updateColumnInStore(u.id, { x: u.x, y: u.y }));
    }
  }, [canEdit, columns, updateColumnInStore, pushHistory]);

  // ============================================================
  // Board title editing
  // ============================================================
  const handleBoardTitleDoubleClick = useCallback(() => {
    if (permission !== 'owner' || !currentBoard) return;
    setEditingBoardTitle(true);
    setBoardTitleDraft(currentBoard.title);
  }, [permission, currentBoard]);

  const saveBoardTitle = useCallback(async () => {
    if (!currentBoard || !boardTitleDraft.trim()) {
      setEditingBoardTitle(false);
      return;
    }
    try {
      const updated = await api.boards.update(currentBoard.id, { title: boardTitleDraft.trim() });
      setCurrentBoard(updated);
    } catch {
      // handle silently
    }
    setEditingBoardTitle(false);
  }, [currentBoard, boardTitleDraft, setCurrentBoard]);

  // ============================================================
  // Edit task handler
  // ============================================================
  const handleEditTask = useCallback((task: Task) => {
    const col = columns.find((c) => c.tasks.some((t) => t.id === task.id));
    if (col) {
      setEditingTask({ task, columnId: col.id });
      wsClient.send({ type: 'activity', action: 'editing', taskId: task.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  // ============================================================
  // Linking line data
  // ============================================================
  const linkingFrom = useMemo(() => {
    if (!linkingFromTaskId) return null;
    return { taskId: linkingFromTaskId, mouseX: linkMousePos.x, mouseY: linkMousePos.y };
  }, [linkingFromTaskId, linkMousePos]);

  // ============================================================
  // Scroll offsets for dependency lines
  // ============================================================
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      setScrollLeft(container.scrollLeft);
      setScrollTop(container.scrollTop);
    }
  }, []);

  // ============================================================
  // Action History
  // ============================================================
  useEffect(() => {
    if (!showHistory || !boardId) return;
    fetch(`/api/boards/${boardId}/history`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setHistoryEntries(data))
      .catch(() => setHistoryEntries([]));
  }, [showHistory, boardId]);

  const handleRestore = useCallback((historyId: string) => {
    if (!boardId) return;
    setConfirmDialog({
      title: 'Restore Board',
      message: 'This will overwrite the current board state with the saved snapshot. This action cannot be undone.',
      variant: 'warning',
      confirmLabel: 'Restore',
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          await fetch(`/api/boards/${boardId}/restore/${historyId}`, {
            method: 'POST',
            credentials: 'include',
          });
          const board = await api.boards.get(boardId);
          setCurrentBoard(board);
          setShowHistory(false);
        } catch {}
      },
    });
  }, [boardId, setCurrentBoard]);

  // ============================================================
  // Render
  // ============================================================
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-4 animate-in">
          <Loader2 size={32} className="text-emerald-500 animate-spin" />
          <p className="text-[#6b7280] text-sm">Loading board...</p>
        </div>
      </div>
    );
  }

  if (error || !currentBoard) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-4 animate-in text-center">
          <AlertTriangle size={32} className="text-red-400" />
          <p className="text-[#f3f4f6]">{error || 'Board not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm hover:bg-emerald-500/30 transition-colors"
          >
            Back to Boards
          </button>
        </div>
      </div>
    );
  }

  const permissionLabel =
    permission === 'owner' ? 'Owner' : permission === 'edit' ? 'Editor' : 'Viewer';
  const permissionIcon =
    permission === 'owner' ? <Shield size={14} /> : permission === 'edit' ? <Edit3 size={14} /> : <Eye size={14} />;

  return (
    <div className="h-screen flex flex-col bg-transparent select-none">
      {/* ======== Toolbar ======== */}
      <div className="h-14 glass border-b border-white/[0.08] flex items-center px-4 gap-3 z-30 shrink-0">
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors"
          title="Back to boards"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Board title */}
        <div className="flex items-center gap-2 min-w-0">
          {editingBoardTitle ? (
            <input
              autoFocus
              value={boardTitleDraft}
              onChange={(e) => setBoardTitleDraft(e.target.value)}
              onBlur={saveBoardTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveBoardTitle();
                if (e.key === 'Escape') setEditingBoardTitle(false);
              }}
              className="bg-white/5 border border-emerald-500/50 rounded-lg px-2 py-1 text-[#f3f4f6] text-sm font-[Syne] font-semibold focus:outline-none"
            />
          ) : (
            <h1
              className="text-sm font-semibold text-[#f3f4f6] font-[Syne] truncate cursor-default"
              onDoubleClick={handleBoardTitleDoubleClick}
              title={permission === 'owner' ? 'Double-click to edit' : currentBoard.title}
            >
              {currentBoard.title}
            </h1>
          )}

          {/* Permission badge */}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-xs text-[#6b7280]">
            {permissionIcon}
            {permissionLabel}
          </span>
        </div>

        {/* Active Users */}
        <div className="flex items-center gap-1 ml-2">
          {activeUsers.map(u => {
            const isYou = u.id === user?.id;
            return (
              <div key={u.id} className="relative group flex flex-col items-center" title={`${u.name}${isYou ? ' (You)' : ''} - ${u.action}`}>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-[#050505] transition-transform hover:scale-110"
                  style={{ backgroundColor: u.color }}
                >
                  {u.name.charAt(0).toUpperCase()}
                </div>
                {u.action === 'editing' && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border border-[#050505]" />
                )}
                {isYou && (
                  <span className="text-[8px] text-[#6b7280] mt-0.5 leading-none">(You)</span>
                )}
                {/* Tooltip on hover */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  <div className="glass rounded-lg px-2 py-1 text-[10px] text-[#f3f4f6] whitespace-nowrap border border-white/10">
                    {u.name}{isYou ? ' (You)' : ''}{u.action === 'editing' ? ' - editing' : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Undo / Redo */}
        <button
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          className="p-2 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          className="p-2 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 size={16} />
        </button>

        <div className="w-px h-6 bg-white/10" />

        {/* Align Columns */}
        {canEdit && (
          <button
            onClick={handleAlignColumns}
            className="p-2 rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors"
            title="Align columns in a row"
          >
            <Columns size={16} />
          </button>
        )}

        {/* Completed sidebar toggle */}
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className={`p-2 rounded-lg transition-colors ${
            showCompleted
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6]'
          }`}
          title="Toggle completed tasks sidebar"
        >
          <CheckSquare size={16} />
        </button>

        <div className="w-px h-6 bg-white/10" />

        {/* History (owner only) */}
        {permission === 'owner' && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-2 rounded-lg transition-colors ${
              showHistory
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6]'
            }`}
            title="Action History"
          >
            <History size={16} />
          </button>
        )}

        {/* Share (owner only) */}
        {permission === 'owner' && (
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] rounded-lg text-sm transition-colors"
          >
            <Share2 size={14} />
            Share
          </button>
        )}
      </div>

      {/* ======== Canvas Container ======== */}
      <div className="flex-1 relative overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const scrollEl = containerRef.current;
          if (!scrollEl) return;
          const rect = scrollEl.getBoundingClientRect();
          const x = (e.clientX - rect.left + scrollEl.scrollLeft) / zoom;
          const y = (e.clientY - rect.top + scrollEl.scrollTop) / zoom;
          let bestCol: typeof columnsRef.current[0] | null = null;
          let bestDist = Infinity;
          for (const col of columnsRef.current) {
            const cx = col.x + (col.width || 300) / 2;
            const cy = col.y + 200;
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < bestDist) { bestDist = dist; bestCol = col; }
          }
          if (bestCol && bestDist < 500) {
            handleTaskDrop(bestCol.id, e);
          }
        }}
      >
        {/* Dependency Lines SVG Overlay */}
        <DependencyLines
          columns={columns}
          zoom={zoom}
          scrollLeft={scrollLeft}
          scrollTop={scrollTop}
          containerRef={containerRef}
          highlightedTaskId={highlightedTaskId}
          linkingFrom={linkingFrom}
        />

        {/* Canvas with zoom/pan */}
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-auto"
          style={{ cursor: isPanning ? 'grabbing' : spaceHeld ? 'grab' : linkingFromTaskId ? 'crosshair' : 'default' }}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onWheel={handleWheel}
          onScroll={handleScroll}
        >
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              width: 5000,
              height: 3000,
              position: 'relative',
            }}
          >
            {/* Grid dot pattern while dragging columns */}
            {draggingColumnId && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(circle, rgba(34,197,94,0.15) 1px, transparent 1px)',
                  backgroundSize: '30px 30px',
                }}
              />
            )}

            {/* Columns */}
            {columns.map((col) => (
              <ColumnComponent
                key={col.id}
                column={col}
                zoom={zoom}
                isSelected={selectedColumnIds.has(col.id)}
                onDragStart={handleColumnDragStart}
                onTaskDragStart={handleTaskDragStart}
                onTaskDragOver={handleTaskDragOver}
                onTaskDrop={handleTaskDrop}
                onEditTask={handleEditTask}
                onLinkStart={handleLinkStart}
                onLinkEnd={handleLinkEnd}
                linkingFromTaskId={linkingFromTaskId}
                permission={permission}
                onSelectColumn={handleSelectColumn}
                onDragOverColumn={handleDragOverColumn}
                onCompleteTask={handleCompleteTask}
              />
            ))}

            {/* Empty state */}
            {columns.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center animate-in">
                  <Columns size={48} className="text-[#6b7280]/30 mx-auto mb-4" />
                  <p className="text-[#6b7280] text-sm">No columns yet</p>
                  {canEdit && (
                    <p className="text-[#6b7280]/60 text-xs mt-1">
                      Click "New Column" to get started
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating New Column Button */}
        {canEdit && (
          <div className="absolute bottom-6 left-6 z-20">
            {showNewColumnForm ? (
              <div className="glass rounded-2xl border border-white/10 p-3 animate-in" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(34,197,94,0.1)' }}>
                <p className="text-[10px] text-[#6b7280] uppercase tracking-wider mb-2 font-[Syne] font-semibold">New Column</p>
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateColumn();
                      if (e.key === 'Escape') { setShowNewColumnForm(false); setNewColumnTitle(''); }
                    }}
                    placeholder="Column title..."
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[#f3f4f6] focus:outline-none focus:border-emerald-500/50 w-48"
                  />
                  <button onClick={handleCreateColumn} className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors border border-emerald-500/30">
                    <Plus size={18} />
                  </button>
                  <button onClick={() => { setShowNewColumnForm(false); setNewColumnTitle(''); }} className="p-2 hover:bg-white/10 text-[#6b7280] rounded-lg transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewColumnForm(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold font-[Syne] transition-all hover:scale-105 active:scale-95"
                style={{
                  background: 'linear-gradient(135deg, rgba(34,197,94,0.2) 0%, rgba(34,197,94,0.1) 100%)',
                  border: '1px solid rgba(34,197,94,0.3)',
                  color: '#22c55e',
                  boxShadow: '0 8px 32px rgba(34,197,94,0.15), 0 0 20px rgba(34,197,94,0.05)',
                }}
              >
                <Plus size={18} />
                New Column
              </button>
            )}
          </div>
        )}

        {/* Selection Rectangle */}
        {selectionRect && selectionRect.w > 3 && selectionRect.h > 3 && (
          <div
            className="absolute pointer-events-none border border-emerald-500/50 bg-emerald-500/10 rounded-sm z-20"
            style={{
              left: selectionRect.x,
              top: selectionRect.y - 56, // offset for toolbar height
              width: selectionRect.w,
              height: selectionRect.h,
            }}
          />
        )}

        {/* Completed Sidebar */}
        {showCompleted && (
          <CompletedSidebar
            board={currentBoard}
            onClose={() => setShowCompleted(false)}
            onEditTask={handleEditTask}
            permission={permission}
            onTaskDrop={async (taskId, sourceColumnId) => {
              const doneCol = columns.find((c) => c.isDoneColumn);
              if (!doneCol) return;
              if (sourceColumnId === doneCol.id) return;
              const position = doneCol.tasks.length;
              moveTaskInStore(taskId, sourceColumnId, doneCol.id, position);
              try {
                await api.tasks.move(taskId, doneCol.id, position);
                pushHistory({
                  type: 'moveTask',
                  taskId,
                  fromColumnId: sourceColumnId,
                  toColumnId: doneCol.id,
                  fromPosition: 0,
                  toPosition: position,
                  label: 'Move task to done',
                });
              } catch {
                moveTaskInStore(taskId, doneCol.id, sourceColumnId, 0);
              }
            }}
          />
        )}

        {/* Action History Panel */}
        {showHistory && (
          <div className="absolute right-0 top-0 bottom-0 w-[360px] z-30 glass border-l border-white/[0.08] flex flex-col animate-in"
               style={{ backdropFilter: 'blur(30px)', background: 'rgba(10,10,10,0.85)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
              <h3 className="text-sm font-semibold text-[#f3f4f6] font-[Syne] flex items-center gap-2">
                <History size={16} className="text-emerald-400" />
                Action History
              </h3>
              <button onClick={() => setShowHistory(false)} className="p-1 rounded-lg hover:bg-white/10 text-[#6b7280]">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {historyEntries.map((entry, idx) => (
                <div key={entry.id} className="group">
                  <div className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="flex flex-col items-center shrink-0 mt-1">
                      <div className={`w-2 h-2 rounded-full ${entry.hasSnapshot ? 'bg-emerald-400' : 'bg-white/20'}`} />
                      {idx < historyEntries.length - 1 && <div className="w-px h-6 bg-white/10 mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[#f3f4f6] leading-snug">{entry.actionSummary}</p>
                      <p className="text-[10px] text-[#6b7280] mt-0.5 font-mono">
                        {entry.userName} · {new Date(entry.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {entry.hasSnapshot && (
                      <button
                        onClick={() => handleRestore(entry.id)}
                        className="opacity-0 group-hover:opacity-100 shrink-0 px-2 py-1 text-[10px] bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {historyEntries.length === 0 && (
                <div className="text-center text-[#6b7280] text-sm py-8">No actions recorded yet.</div>
              )}
            </div>
          </div>
        )}

        {/* ======== Bottom Zoom Controls ======== */}
        <div className={`absolute bottom-4 flex items-center gap-2 z-20 transition-all duration-300 ${showCompleted ? 'right-[370px]' : 'right-4'}`}>
          <button
            onClick={() => setZoom(Math.max(0.3, zoom - 0.1))}
            className="p-2 glass rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-xs text-[#6b7280] font-mono w-12 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(Math.min(2.5, zoom + 0.1))}
            className="p-2 glass rounded-lg hover:bg-white/10 text-[#6b7280] hover:text-[#f3f4f6] transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        {/* Link mode indicator */}
        {linkingFromTaskId && (
          <div className="absolute bottom-4 left-4 z-20 glass rounded-lg px-3 py-2 flex items-center gap-2 border border-emerald-500/30 animate-in">
            <Link2 size={14} className="text-emerald-400" />
            <span className="text-xs text-emerald-400">
              Click a task to create dependency. Press Escape to cancel.
            </span>
          </div>
        )}

        {/* Copy indicator */}
        {clipboard && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 glass rounded-lg px-3 py-2 flex items-center gap-2 border border-white/10 animate-in">
            <Clipboard size={14} className="text-[#6b7280]" />
            <span className="text-xs text-[#6b7280]">
              {clipboard.tasks.length} task(s), {clipboard.columns.length} column(s) copied. Ctrl+V to paste.
            </span>
          </div>
        )}
      </div>

      {/* ======== Modals ======== */}
      {editingTask && (
        <TaskModal
          task={editingTask.task}
          columnId={editingTask.columnId}
          board={currentBoard}
          onClose={() => {
            setEditingTask(null);
            wsClient.send({ type: 'activity', action: 'viewing' });
          }}
          permission={permission}
        />
      )}

      {showShareModal && (
        <ShareModal board={currentBoard} onClose={() => setShowShareModal(false)} />
      )}

      {/* Global confirm dialog */}
      {confirmDialog && (
        <ConfirmDialog
          isOpen={true}
          title={confirmDialog.title}
          message={confirmDialog.message}
          details={confirmDialog.details}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
}

export default KanbanBoard;
