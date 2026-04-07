import React, { useState, useCallback } from 'react';
import { LogIn, UserPlus, Mail, Lock, User, AlertCircle, Ghost } from 'lucide-react';
import { Modal, Input, Button } from './UI';
import { api } from '../api';
import type { User as UserType } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: UserType) => void;
  initialMode?: 'login' | 'register';
}

export default function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  initialMode = 'login',
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = useCallback(() => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setError('');
  }, []);

  const switchMode = useCallback(
    (newMode: 'login' | 'register') => {
      setMode(newMode);
      resetForm();
    },
    [resetForm]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      if (!email.trim()) {
        setError('Email is required.');
        return;
      }
      if (!password.trim()) {
        setError('Password is required.');
        return;
      }
      if (mode === 'register' && !displayName.trim()) {
        setError('Display name is required.');
        return;
      }

      setLoading(true);
      try {
        if (mode === 'login') {
          const { user } = await api.auth.login(email.trim(), password);
          onSuccess(user);
          onClose();
          resetForm();
        } else {
          const { user } = await api.auth.register(
            email.trim(),
            password,
            displayName.trim()
          );
          onSuccess(user);
          onClose();
          resetForm();
        }
      } catch (err: any) {
        setError(err.message || 'Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [mode, email, password, displayName, onSuccess, onClose, resetForm]
  );

  const handleContinueAnonymous = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'login' ? 'Welcome Back' : 'Create Account'}
      width="max-w-sm"
    >
      <div className="space-y-5">
        {/* Mode toggle */}
        <div className="flex rounded-lg border border-[rgba(255,255,255,0.08)] overflow-hidden">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${
              mode === 'login'
                ? 'bg-emerald-600/20 text-emerald-400 border-r border-emerald-500/20'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03] border-r border-[rgba(255,255,255,0.08)]'
            }`}
          >
            <LogIn size={13} />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-all ${
              mode === 'register'
                ? 'bg-emerald-600/20 text-emerald-400'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
            }`}
          >
            <UserPlus size={13} />
            Register
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display name (register only) */}
          {mode === 'register' && (
            <div className="space-y-1">
              <label className="block text-[10px] text-gray-600 uppercase tracking-wider font-medium">
                Display Name
              </label>
              <div className="relative">
                <User
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"
                />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name..."
                  className="w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
              </div>
            </div>
          )}

          {/* Email */}
          <div className="space-y-1">
            <label className="block text-[10px] text-gray-600 uppercase tracking-wider font-medium">
              Email
            </label>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <label className="block text-[10px] text-gray-600 uppercase tracking-wider font-medium">
              Password
            </label>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg pl-9 pr-3 py-2.5 text-sm text-gray-200 placeholder-gray-700 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Submit */}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? (
              <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {mode === 'login' ? 'Signing in...' : 'Creating account...'}
              </div>
            ) : mode === 'login' ? (
              <>
                <LogIn size={14} />
                Sign In
              </>
            ) : (
              <>
                <UserPlus size={14} />
                Create Account
              </>
            )}
          </Button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-[rgba(255,255,255,0.06)]" />
          <span className="text-[10px] text-gray-700 uppercase tracking-wider">or</span>
          <div className="flex-1 border-t border-[rgba(255,255,255,0.06)]" />
        </div>

        {/* Continue anonymous */}
        <Button
          variant="ghost"
          onClick={handleContinueAnonymous}
          className="w-full"
        >
          <Ghost size={14} />
          Continue as Anonymous
        </Button>

        {/* Footer text */}
        <p className="text-[10px] text-gray-700 text-center">
          {mode === 'login'
            ? "Don't have an account? Click Register above."
            : 'Already have an account? Click Sign In above.'}
        </p>
      </div>
    </Modal>
  );
}
