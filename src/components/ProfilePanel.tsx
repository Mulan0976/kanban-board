import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LogOut,
  User,
  Mail,
  Layout,
  Crown,
  Pencil,
  Eye,
  ChevronRight,
  X,
} from 'lucide-react';
import { Button, Badge } from './UI';
import { api } from '../api';
import type { User as UserType, BoardSummary } from '../types';

interface ProfilePanelProps {
  user: UserType;
  onLogout: () => void;
  onClose: () => void;
}

export default function ProfilePanel({ user, onLogout, onClose }: ProfilePanelProps) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Load boards
  useEffect(() => {
    setLoading(true);
    api.boards
      .list()
      .then((list) => setBoards(list))
      .catch(() => setBoards([]))
      .finally(() => setLoading(false));
  }, []);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleNavigate = useCallback(
    (boardId: string) => {
      navigate(`/board/${boardId}`);
      onClose();
    },
    [navigate, onClose]
  );

  const permissionIcon = (perm: 'owner' | 'edit' | 'view') => {
    switch (perm) {
      case 'owner':
        return <Crown size={10} className="text-amber-400" />;
      case 'edit':
        return <Pencil size={10} className="text-blue-400" />;
      case 'view':
        return <Eye size={10} className="text-gray-500" />;
    }
  };

  const permissionLabel = (perm: 'owner' | 'edit' | 'view') => {
    switch (perm) {
      case 'owner':
        return 'Owner';
      case 'edit':
        return 'Editor';
      case 'view':
        return 'Viewer';
    }
  };

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 w-72 glass rounded-xl border border-[rgba(255,255,255,0.08)] shadow-2xl z-50 overflow-hidden"
      style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
    >
      {/* Header / User info */}
      <div className="p-4 border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_12px_rgba(34,197,94,0.15)]">
              <span className="text-sm font-bold text-emerald-400 uppercase">
                {user.displayName.charAt(0)}
              </span>
            </div>
            <div className="min-w-0">
              <h3
                className="text-sm font-semibold text-gray-200 truncate"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {user.displayName}
              </h3>
              <div className="flex items-center gap-1 mt-0.5">
                <Mail size={10} className="text-gray-600 flex-shrink-0" />
                <span className="text-[11px] text-gray-500 truncate">{user.email}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 text-gray-600 hover:text-gray-400 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Boards list */}
      <div className="p-2">
        <div className="flex items-center justify-between px-2 py-1.5 mb-1">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">
            Your Boards
          </span>
          <span className="text-[10px] text-gray-700">{boards.length}</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-gray-700">
            <Layout size={18} className="mb-1 opacity-50" />
            <span className="text-[11px]">No boards</span>
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {boards.map((board) => (
              <button
                key={board.id}
                onClick={() => handleNavigate(board.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] transition-colors group text-left"
              >
                <div className="w-7 h-7 rounded-md bg-white/[0.03] border border-[rgba(255,255,255,0.06)] flex items-center justify-center flex-shrink-0">
                  <Layout size={12} className="text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-300 truncate group-hover:text-gray-100 transition-colors">
                    {board.title}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {permissionIcon(board.permission)}
                    <span className="text-[10px] text-gray-600">
                      {permissionLabel(board.permission)}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={12}
                  className="text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer / Sign out */}
      <div className="p-2 border-t border-[rgba(255,255,255,0.06)]">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all text-left"
        >
          <LogOut size={14} />
          <span className="text-xs font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
