import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Link2,
  Copy,
  Check,
  Users,
  Shield,
  ShieldCheck,
  Eye,
  Pencil,
  Trash2,
  Crown,
  UserX,
  Globe,
  ChevronDown,
} from 'lucide-react';
import { Modal, Button, Badge, Dropdown } from './UI';
import { api } from '../api';
import type { Board, BoardMember, InviteLink } from '../types';

interface ShareModalProps {
  board: Board;
  isOpen: boolean;
  onClose: () => void;
}

export default function ShareModal({ board, isOpen, onClose }: ShareModalProps) {
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [invitePermission, setInvitePermission] = useState<'view' | 'edit'>('view');
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loadingLink, setLoadingLink] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [error, setError] = useState('');
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const isOwner = board.permission === 'owner';

  // Load members on open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingMembers(true);
    api.boards
      .members(board.id)
      .then((m) => setMembers(m))
      .catch((err) => console.error('Failed to load members:', err))
      .finally(() => setLoadingMembers(false));
  }, [isOpen, board.id]);

  // Generate invite link
  const handleGenerateLink = useCallback(async () => {
    setError('');
    setLoadingLink(true);
    try {
      const result = await api.boards.invite(board.id, invitePermission);
      const link = `${window.location.origin}/join/${result.code}`;
      setGeneratedLink(link);
      setGeneratedCode(result.code);
    } catch (err: any) {
      setError(err.message || 'Failed to generate link.');
    } finally {
      setLoadingLink(false);
    }
  }, [board.id, invitePermission]);

  // Copy link
  const handleCopy = useCallback(async () => {
    if (!generatedLink) return;
    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement('textarea');
      textArea.value = generatedLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [generatedLink]);

  // Update member permission
  const handleUpdateMember = useCallback(
    async (memberId: string, permission: 'view' | 'edit') => {
      setUpdatingMemberId(memberId);
      try {
        await api.boards.updateMember(board.id, memberId, permission);
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, permission } : m))
        );
      } catch (err: any) {
        console.error('Failed to update member:', err);
      } finally {
        setUpdatingMemberId(null);
      }
    },
    [board.id]
  );

  // Remove member
  const handleRemoveMember = useCallback(
    async (memberId: string) => {
      setRemovingMemberId(memberId);
      try {
        await api.boards.removeMember(board.id, memberId);
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      } catch (err: any) {
        console.error('Failed to remove member:', err);
      } finally {
        setRemovingMemberId(null);
      }
    },
    [board.id]
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Share Board" width="max-w-lg">
      <div className="space-y-6">
        {/* Owner Info */}
        <div className="flex items-center gap-3 p-3 glass rounded-xl">
          <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Crown size={16} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-200 font-medium">
              {board.ownerName}
            </div>
            <div className="text-[11px] text-gray-600">Board Owner</div>
          </div>
          <Badge variant="warning">Owner</Badge>
        </div>

        {/* ======== Create Invite Link ======== */}
        {isOwner && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Link2 size={14} className="text-emerald-400" />
              <span
                className="text-sm font-medium text-gray-300"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Create Invite Link
              </span>
            </div>

            <div className="p-4 glass rounded-xl space-y-3">
              {/* Permission selector */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 uppercase tracking-wider min-w-[70px]">
                  Permission
                </span>
                <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)] overflow-hidden">
                  <button
                    onClick={() => setInvitePermission('view')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all ${
                      invitePermission === 'view'
                        ? 'bg-emerald-600/20 text-emerald-400 border-r border-emerald-500/20'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border-r border-[rgba(255,255,255,0.08)]'
                    }`}
                  >
                    <Eye size={12} />
                    View Only
                  </button>
                  <button
                    onClick={() => setInvitePermission('edit')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all ${
                      invitePermission === 'edit'
                        ? 'bg-emerald-600/20 text-emerald-400'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                    }`}
                  >
                    <Pencil size={12} />
                    View & Edit
                  </button>
                </div>
              </div>

              {/* Generate button */}
              <Button
                onClick={handleGenerateLink}
                disabled={loadingLink}
                className="w-full"
              >
                <Globe size={14} />
                {loadingLink ? 'Generating...' : 'Generate Link'}
              </Button>

              {/* Generated link display */}
              {generatedLink && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2.5 bg-white/[0.02] border border-[rgba(255,255,255,0.06)] rounded-lg">
                    <input
                      readOnly
                      value={generatedLink}
                      className="flex-1 bg-transparent text-xs text-gray-300 font-mono outline-none select-all truncate"
                    />
                    <button
                      onClick={handleCopy}
                      className={`flex-shrink-0 p-1.5 rounded-md transition-all ${
                        copied
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'hover:bg-white/5 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                  {copied && (
                    <p className="text-[11px] text-emerald-400 text-center animate-in">
                      Copied to clipboard!
                    </p>
                  )}
                </div>
              )}

              {error && <p className="text-xs text-red-400">{error}</p>}
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-[rgba(255,255,255,0.06)]" />

        {/* ======== Current Members ======== */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={14} className="text-emerald-400" />
              <span
                className="text-sm font-medium text-gray-300"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Members
              </span>
            </div>
            <span className="text-xs text-gray-600">{members.length} member{members.length !== 1 ? 's' : ''}</span>
          </div>

          {loadingMembers ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-gray-600">
              <Users size={24} className="mb-2 opacity-50" />
              <span className="text-xs">No members yet</span>
              <span className="text-[10px] text-gray-700 mt-0.5">
                Generate an invite link to share this board
              </span>
            </div>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors group"
                >
                  {/* Avatar */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      member.isAnonymous
                        ? 'bg-gray-500/10 border border-gray-500/20'
                        : 'bg-emerald-500/10 border border-emerald-500/20'
                    }`}
                  >
                    <span
                      className={`text-xs font-bold uppercase ${
                        member.isAnonymous ? 'text-gray-500' : 'text-emerald-400'
                      }`}
                    >
                      {member.displayName.charAt(0)}
                    </span>
                  </div>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-gray-200 truncate">
                        {member.displayName}
                      </span>
                      {member.isAnonymous && (
                        <Badge variant="default" className="text-[9px]">Anonymous</Badge>
                      )}
                    </div>
                  </div>

                  {/* Permission & actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isOwner ? (
                      <>
                        {/* Permission dropdown */}
                        <Dropdown
                          align="right"
                          trigger={
                            <button
                              disabled={updatingMemberId === member.id}
                              className="flex items-center gap-1 px-2 py-1 rounded-md border border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] text-xs text-gray-400 hover:text-gray-200 transition-all"
                            >
                              {member.permission === 'edit' ? (
                                <Pencil size={10} />
                              ) : (
                                <Eye size={10} />
                              )}
                              {member.permission === 'edit' ? 'Editor' : 'Viewer'}
                              <ChevronDown size={10} />
                            </button>
                          }
                          items={[
                            { label: 'Viewer', value: 'view', icon: <Eye size={12} /> },
                            { label: 'Editor', value: 'edit', icon: <Pencil size={12} /> },
                          ]}
                          onSelect={(val) =>
                            handleUpdateMember(member.id, val as 'view' | 'edit')
                          }
                        />

                        {/* Remove member */}
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={removingMemberId === member.id}
                          className="p-1 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-30"
                          title="Remove member"
                        >
                          {removingMemberId === member.id ? (
                            <div className="w-3.5 h-3.5 border border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                          ) : (
                            <UserX size={14} />
                          )}
                        </button>
                      </>
                    ) : (
                      <Badge
                        variant={member.permission === 'edit' ? 'info' : 'default'}
                      >
                        {member.permission === 'edit' ? 'Editor' : 'Viewer'}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info hint for non-owners */}
        {!isOwner && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-white/[0.02] border border-[rgba(255,255,255,0.06)]">
            <Shield size={14} className="text-gray-600 flex-shrink-0" />
            <span className="text-xs text-gray-600">
              Only the board owner can manage members and create invite links.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
