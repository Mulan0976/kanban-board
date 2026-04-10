import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  LogIn,
  LogOut,
  Layout,
  Trash2,
  Crown,
  Pencil,
  Eye,
  Link2,
  User,
  ArrowRight,
  LayoutGrid,
  AlertCircle,
} from 'lucide-react';
import { Button, Badge, Input } from './UI';
import AuthModal from './AuthModal';
import { useStore } from '../store';
import { api } from '../api';
import type { BoardSummary, User as UserType } from '../types';

// Cookie helpers
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export default function BoardList() {
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const setUser = useStore((s) => s.setUser);
  const boards = useStore((s) => s.boards);
  const setBoards = useStore((s) => s.setBoards);

  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [newBoardTitle, setNewBoardTitle] = useState('');
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joiningBoard, setJoiningBoard] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Load boards
  useEffect(() => {
    setLoading(true);
    api.boards
      .list()
      .then((list) => setBoards(list))
      .catch(() => setBoards([]))
      .finally(() => setLoading(false));
  }, [setBoards, isAuthenticated]);

  // Check for anonymous boards in cookies after auth
  useEffect(() => {
    if (isAuthenticated && user) {
      const anonBoards = getCookie('anonymous_boards');
      if (anonBoards) {
        try {
          const ids = JSON.parse(anonBoards);
          if (Array.isArray(ids) && ids.length > 0) {
            setShowMigrationPrompt(true);
          }
        } catch {
          // ignore
        }
      }
    }
  }, [isAuthenticated, user]);

  // Auth success
  const handleAuthSuccess = useCallback(
    (u: UserType) => {
      setUser(u);
    },
    [setUser]
  );

  // Logout
  const handleLogout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    setUser(null);
    setBoards([]);
  }, [setUser, setBoards]);

  // Create board
  const handleCreateBoard = useCallback(async () => {
    const title = newBoardTitle.trim();
    if (!title) return;
    setCreatingBoard(true);
    try {
      const board = await api.boards.create(title);
      navigate(`/board/${board.id}`);
    } catch (err: any) {
      console.error('Failed to create board:', err);
    } finally {
      setCreatingBoard(false);
    }
  }, [newBoardTitle, navigate]);

  // Join board
  const handleJoinBoard = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoiningBoard(true);
    setJoinError('');
    try {
      const board = await api.boards.join(code);
      navigate(`/board/${board.id}`);
    } catch (err: any) {
      setJoinError(err.message || 'Invalid code or link.');
    } finally {
      setJoiningBoard(false);
    }
  }, [joinCode, navigate]);

  // Delete board
  const handleDeleteBoard = useCallback(
    async (boardId: string) => {
      setDeletingBoardId(boardId);
      try {
        await api.boards.delete(boardId);
        setBoards(boards.filter((b) => b.id !== boardId));
      } catch (err: any) {
        console.error('Failed to delete board:', err);
      } finally {
        setDeletingBoardId(null);
        setDeleteConfirmId(null);
      }
    },
    [boards, setBoards]
  );

  // Merge anonymous boards
  const handleMerge = useCallback(async () => {
    const anonBoards = getCookie('anonymous_boards');
    if (!anonBoards) return;
    setMigrating(true);
    try {
      const ids = JSON.parse(anonBoards);
      await api.auth.mergeAnonymous(ids);
      deleteCookie('anonymous_boards');
      setShowMigrationPrompt(false);
      // Reload boards
      const list = await api.boards.list();
      setBoards(list);
    } catch (err: any) {
      console.error('Failed to merge boards:', err);
    } finally {
      setMigrating(false);
    }
  }, [setBoards]);

  // Permission icon helper
  const permissionBadge = (perm: 'owner' | 'edit' | 'view') => {
    switch (perm) {
      case 'owner':
        return (
          <Badge variant="warning">
            <Crown size={10} className="mr-0.5" />
            Owner
          </Badge>
        );
      case 'edit':
        return (
          <Badge variant="info">
            <Pencil size={10} className="mr-0.5" />
            Editor
          </Badge>
        );
      case 'view':
        return (
          <Badge variant="default">
            <Eye size={10} className="mr-0.5" />
            Viewer
          </Badge>
        );
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* ======== Header ======== */}
      <header className="relative z-10 border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          {/* Logo / Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.15)]">
              <LayoutGrid size={18} className="text-emerald-400" />
            </div>
            <h1
              className="text-xl font-bold text-gray-100 tracking-tight"
              style={{
                fontFamily: "'Syne', sans-serif",
                textShadow: '0 0 30px rgba(34,197,94,0.3)',
              }}
            >
              BetterBoard
            </h1>
          </div>

          {/* Auth buttons */}
          <div className="flex items-center gap-3">
            {isAuthenticated && user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase">
                      {user.displayName.charAt(0)}
                    </span>
                  </div>
                  <span className="text-sm text-gray-300 hidden sm:inline">
                    {user.displayName}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={handleLogout}>
                  <LogOut size={14} />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAuthMode('login');
                    setShowAuth(true);
                  }}
                >
                  <LogIn size={14} />
                  Sign In
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setAuthMode('register');
                    setShowAuth(true);
                  }}
                >
                  Register
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ======== Main Content ======== */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Migration prompt */}
        {showMigrationPrompt && (
          <div className="mb-6 p-4 glass rounded-xl border border-amber-500/20 bg-amber-500/5 animate-in">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3
                  className="text-sm font-medium text-amber-300"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  Anonymous boards detected
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  You have boards created while not signed in. Would you like to transfer them to
                  your account?
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" onClick={handleMerge} disabled={migrating}>
                    {migrating ? 'Migrating...' : 'Transfer Boards'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowMigrationPrompt(false);
                      deleteCookie('anonymous_boards');
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Join Board */}
        <div className="mb-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Link2
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"
              />
              <input
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value);
                  setJoinError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoinBoard();
                }}
                placeholder="Enter invite code..."
                className="w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg pl-9 pr-3 py-2 text-sm text-gray-300 placeholder-gray-700 outline-none focus:border-emerald-500/30 transition-colors"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>
            <Button
              size="md"
              variant="secondary"
              onClick={handleJoinBoard}
              disabled={joiningBoard || !joinCode.trim()}
            >
              {joiningBoard ? (
                <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-400 rounded-full animate-spin" />
              ) : (
                <>
                  <ArrowRight size={14} />
                  Join
                </>
              )}
            </Button>
          </div>
          {joinError && (
            <span className="text-xs text-red-400">{joinError}</span>
          )}
        </div>

        {/* Section heading */}
        <div className="flex items-center justify-between mb-5">
          <h2
            className="text-sm font-medium text-gray-500 uppercase tracking-wider"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Your Boards
          </h2>
          <span className="text-xs text-gray-700">
            {boards.length} board{boards.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Loading */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : (
          /* Board grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* New Board card (authenticated users only) */}
            {!isAuthenticated ? null : showNewBoard ? (
              <div className="glass rounded-xl p-5 border border-emerald-500/20 bg-emerald-500/[0.03] animate-in">
                <div className="space-y-3">
                  <h3
                    className="text-sm font-medium text-emerald-400"
                    style={{ fontFamily: "'Syne', sans-serif" }}
                  >
                    New Board
                  </h3>
                  <input
                    value={newBoardTitle}
                    onChange={(e) => setNewBoardTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateBoard();
                      if (e.key === 'Escape') {
                        setShowNewBoard(false);
                        setNewBoardTitle('');
                      }
                    }}
                    placeholder="Board title..."
                    autoFocus
                    className="w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-700 outline-none focus:border-emerald-500/30 transition-colors"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreateBoard}
                      disabled={creatingBoard || !newBoardTitle.trim()}
                      className="flex-1"
                    >
                      {creatingBoard ? (
                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        'Create'
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowNewBoard(false);
                        setNewBoardTitle('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNewBoard(true)}
                className="group rounded-xl p-5 border-2 border-dashed border-[rgba(255,255,255,0.08)] hover:border-emerald-500/30 transition-all duration-300 flex flex-col items-center justify-center gap-3 min-h-[140px] hover:bg-emerald-500/[0.02]"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:shadow-[0_0_20px_rgba(34,197,94,0.15)] transition-shadow">
                  <Plus size={20} className="text-emerald-400" />
                </div>
                <span
                  className="text-sm text-gray-500 group-hover:text-emerald-400 transition-colors"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  New Board
                </span>
              </button>
            )}

            {/* Board cards (note: extra closing paren from ternary above) */}
            {boards.map((board) => (
              <div
                key={board.id}
                className="group glass rounded-xl p-5 border border-[rgba(255,255,255,0.08)] hover:border-emerald-500/20 cursor-pointer transition-all duration-300 hover:shadow-[0_0_30px_rgba(34,197,94,0.06)] relative"
                onClick={() => navigate(`/board/${board.id}`)}
              >
                {/* Permission badge */}
                <div className="absolute top-3 right-3">
                  {permissionBadge(board.permission)}
                </div>

                {/* Board icon */}
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-[rgba(255,255,255,0.08)] flex items-center justify-center mb-3">
                  <Layout size={14} className="text-gray-500" />
                </div>

                {/* Title */}
                <h3
                  className="text-base font-semibold text-gray-200 mb-1 pr-16 truncate"
                  style={{ fontFamily: "'Syne', sans-serif" }}
                >
                  {board.title}
                </h3>

                {/* Owner */}
                <p className="text-xs text-gray-600 mb-3">by {board.ownerName}</p>

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-[rgba(255,255,255,0.04)]">
                  <span className="text-[10px] text-gray-700">
                    {new Date(board.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>

                  {/* Delete button (owner only) */}
                  {board.permission === 'owner' && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      {deleteConfirmId === board.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleDeleteBoard(board.id)}
                            disabled={deletingBoardId === board.id}
                            className="px-2 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          >
                            {deletingBoardId === board.id ? '...' : 'Delete'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="px-2 py-0.5 text-[10px] rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(board.id)}
                          className="p-1 text-gray-700 hover:text-red-400 transition-colors rounded hover:bg-red-500/10"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && boards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-[rgba(255,255,255,0.06)] flex items-center justify-center mb-4">
              <Layout size={28} className="text-gray-700" />
            </div>
            <h3
              className="text-lg font-medium text-gray-400 mb-2"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              No boards yet
            </h3>
            <p className="text-sm text-gray-600 max-w-sm mb-6">
              Create your first board or join an existing one with an invite code to get started.
            </p>
            <div className="flex items-center gap-3">
              <Button onClick={() => setShowNewBoard(true)}>
                <Plus size={14} />
                Create Board
              </Button>
              {!isAuthenticated && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setAuthMode('register');
                    setShowAuth(true);
                  }}
                >
                  <User size={14} />
                  Sign Up
                </Button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={handleAuthSuccess}
        initialMode={authMode}
      />
    </div>
  );
}
