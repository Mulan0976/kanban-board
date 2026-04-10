import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { X, Check, ChevronDown, AlertTriangle } from 'lucide-react';
import { COLORS } from '../types';

/* ========================================
   Button
   ======================================== */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 select-none focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed';

  const variants: Record<string, string> = {
    primary:
      'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(34,197,94,0.15)] hover:shadow-[0_0_30px_rgba(34,197,94,0.25)] active:bg-emerald-700',
    secondary:
      'glass hover:bg-white/[0.06] hover:border-white/[0.12] text-gray-200',
    ghost:
      'bg-transparent hover:bg-white/5 text-gray-300 hover:text-gray-100',
    danger:
      'bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/20 hover:border-red-500/30',
  };

  const sizes: Record<string, string> = {
    sm: 'px-2.5 py-1 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-2.5 text-base gap-2.5',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

/* ========================================
   Input
   ======================================== */
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 font-mono transition-all duration-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 ${className}`}
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          {...props}
        />
      </div>
    );
  }
);
Input.displayName = 'Input';

/* ========================================
   TextArea
   ======================================== */
interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs text-gray-400 mb-1.5 font-medium tracking-wide uppercase">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`w-full bg-white/[0.03] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 font-mono transition-all duration-200 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-y min-h-[80px] ${className}`}
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          {...props}
        />
      </div>
    );
  }
);
TextArea.displayName = 'TextArea';

/* ========================================
   Modal
   ======================================== */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export function Modal({ isOpen, onClose, title, children, width = 'max-w-2xl' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={`relative w-full ${width} mx-4 glass rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-2xl`}
        style={{ animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(255,255,255,0.08)]">
          <h2
            className="text-lg font-semibold text-gray-100 tracking-tight"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* ========================================
   Badge
   ======================================== */
interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variants: Record<string, string> = {
    default: 'bg-white/[0.06] text-gray-400 border-white/[0.08]',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border ${variants[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ========================================
   Dropdown
   ======================================== */
interface DropdownItem {
  label: string;
  value: string;
  icon?: React.ReactNode;
  danger?: boolean;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  onSelect: (value: string) => void;
  align?: 'left' | 'right';
}

export function Dropdown({ trigger, items, onSelect, align = 'left' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: align === 'right' ? rect.right : rect.left,
      });
    }
    setOpen(!open);
  };

  return (
    <div className="relative inline-block" ref={containerRef}>
      <div onClick={handleOpen} className="cursor-pointer" ref={triggerRef}>
        {trigger}
      </div>
      {open && ReactDOM.createPortal(
        <div
          className="fixed z-[200] min-w-[160px] rounded-lg border border-[rgba(255,255,255,0.12)] shadow-2xl py-1"
          style={{
            top: menuPos.top,
            left: align === 'right' ? undefined : menuPos.left,
            right: align === 'right' ? window.innerWidth - menuPos.left : undefined,
            background: 'rgb(20, 20, 20)',
            animation: 'fadeIn 0.15s ease-out forwards',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.value}
              onClick={() => {
                onSelect(item.value);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-gray-300 hover:bg-white/5 hover:text-gray-100'
              }`}
            >
              {item.icon && <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

/* ========================================
   Toggle
   ======================================== */
interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  return (
    <label
      className={`inline-flex items-center gap-2.5 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-[22px] rounded-full transition-all duration-200 ${
          checked
            ? 'bg-emerald-600 shadow-[0_0_12px_rgba(34,197,94,0.3)]'
            : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
      {label && <span className="text-sm text-gray-300 select-none">{label}</span>}
    </label>
  );
}

/* ========================================
   ColorPicker
   ======================================== */
interface ColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-1.5">
        {/* None / clear option */}
        <button
          onClick={() => onChange(null)}
          className={`w-7 h-7 rounded-full border-2 transition-all duration-150 flex items-center justify-center ${
            value === null
              ? 'border-emerald-400 ring-2 ring-emerald-500/30 bg-white/5'
              : 'border-[rgba(255,255,255,0.08)] hover:border-white/20 bg-white/[0.03]'
          }`}
          title="None"
        >
          <X size={12} className="text-gray-500" />
        </button>

        {COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onChange(color)}
            className={`w-7 h-7 rounded-full border-2 transition-all duration-150 hover:scale-110 ${
              value === color
                ? 'border-white ring-2 ring-emerald-500/30 scale-110'
                : 'border-transparent hover:border-white/30'
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
      </div>
    </div>
  );
}

/* ========================================
   ConfirmDialog
   ======================================== */
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const accentColor =
    variant === 'danger' ? '#ef4444' : variant === 'warning' ? '#f59e0b' : '#22c55e';
  const accentBg =
    variant === 'danger'
      ? 'rgba(239,68,68,0.1)'
      : variant === 'warning'
      ? 'rgba(245,158,11,0.1)'
      : 'rgba(34,197,94,0.1)';
  const confirmBtnClass =
    variant === 'danger'
      ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
      : variant === 'warning'
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30'
      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30';

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative rounded-2xl border border-white/10 w-full max-w-sm p-5 animate-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'rgba(12,12,12,0.95)',
          backdropFilter: 'blur(30px)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Icon + Title */}
        <div className="flex items-start gap-3 mb-3">
          <div
            className="p-2 rounded-xl shrink-0 mt-0.5"
            style={{ background: accentBg }}
          >
            <AlertTriangle size={18} style={{ color: accentColor }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#f3f4f6]" style={{ fontFamily: "'Syne', sans-serif" }}>
              {title}
            </h3>
            <p className="text-xs text-[#9ca3af] mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        {/* Details list */}
        {details && details.length > 0 && (
          <div className="ml-11 mb-4 space-y-1 max-h-32 overflow-y-auto">
            {details.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-[#d1d5db] bg-white/[0.03] rounded-lg px-2.5 py-1.5">
                <div className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
                {d}
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs text-[#9ca3af] hover:bg-white/[0.06] hover:text-[#f3f4f6] transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${confirmBtnClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
