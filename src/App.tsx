import React, { Suspense, useEffect, useState, lazy } from 'react';
import { Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { useStore } from './store';
import { api } from './api';

const BoardList = lazy(() => import('./components/BoardList'));
const KanbanBoard = lazy(() => import('./components/KanbanBoard'));
const StarBackground = lazy(() => import('./components/StarBackground'));

function LoadingScreen() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        width: '100vw',
        background: '#0a0a1a',
        color: '#818cf8',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '1.2rem',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid rgba(129, 140, 248, 0.2)',
            borderTopColor: '#818cf8',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 16px',
          }}
        />
        <div>Loading...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

function JoinBoard() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);

  // If user is logged in, join immediately
  useEffect(() => {
    if (!code || !user) return;
    let cancelled = false;
    api.boards
      .join(code, user.displayName)
      .then((board) => { if (!cancelled) navigate(`/board/${board.id}`, { replace: true }); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to join board'); });
    return () => { cancelled = true; };
  }, [code, navigate, user]);

  // If logged in, show loading
  if (user) {
    if (error) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'transparent', color: '#f87171', fontFamily: "'Syne', system-ui, sans-serif", flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: '1.2rem' }}>Failed to join board</div>
          <div style={{ fontSize: '0.9rem', color: '#a1a1aa' }}>{error}</div>
          <button onClick={() => navigate('/')} style={{ marginTop: 12, padding: '8px 20px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.9rem' }}>Go to Home</button>
        </div>
      );
    }
    return <LoadingScreen />;
  }

  // Anonymous user: show name prompt
  const handleJoin = async () => {
    if (!code || !name.trim()) return;
    setJoining(true);
    setError(null);
    try {
      const board = await api.boards.join(code, name.trim());
      navigate(`/board/${board.id}`, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Failed to join board');
      setJoining(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: 'transparent', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ width: 380, padding: 32, background: 'rgba(12,12,12,0.95)', backdropFilter: 'blur(30px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f3f4f6', marginBottom: 4, fontFamily: "'Syne', sans-serif" }}>Join Board</h2>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>You've been invited to collaborate on a board.</p>

        <label style={{ display: 'block', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, fontWeight: 500 }}>Your Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          placeholder="Enter your name..."
          style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#f3f4f6', fontSize: 14, outline: 'none', fontFamily: "'JetBrains Mono', monospace", boxSizing: 'border-box', marginBottom: 12 }}
        />

        <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginBottom: 20 }}>
          <p style={{ fontSize: 11, color: '#f59e0b', margin: 0, lineHeight: 1.5 }}>
            You're joining as a guest. Your access is saved in this browser only. Sign in to save this board to your account and access it from anywhere.
          </p>
        </div>

        {error && (
          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: '#ef4444', margin: 0 }}>{error}</p>
          </div>
        )}

        <button
          onClick={handleJoin}
          disabled={!name.trim() || joining}
          style={{ width: '100%', padding: '10px 0', background: name.trim() ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (name.trim() ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'), borderRadius: 8, color: name.trim() ? '#22c55e' : '#6b7280', fontSize: 14, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'default', fontFamily: "'Syne', sans-serif", opacity: joining ? 0.6 : 1, marginBottom: 12 }}
        >
          {joining ? 'Joining...' : 'Join Board'}
        </button>

        <button
          onClick={() => navigate('/')}
          style={{ width: '100%', padding: '8px 0', background: 'transparent', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer' }}
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}

function AppRoutes() {
  const setUser = useStore((s) => s.setUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .me()
      .then(({ user }) => {
        setUser(user);
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [setUser]);

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh' }}>
      <Suspense fallback={null}>
        <StarBackground />
      </Suspense>
      <div style={{ position: 'relative', zIndex: 2 }}>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<BoardList />} />
            <Route path="/board/:id" element={<KanbanBoard />} />
            <Route path="/join/:code" element={<JoinBoard />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

export default function App() {
  return <AppRoutes />;
}
