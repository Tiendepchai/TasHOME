import React from 'react';
import { create } from 'zustand';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface ToastStore {
  toasts: ToastItem[];
  addToast: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  removeToast: (id: string) => void;
}

export const useToast = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    set((state) => ({ toasts: [...state.toasts.slice(-3), { id, message, type }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3200);
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  }
}));

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed top-16 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-200 animate-in fade-in slide-in-from-top-3',
            toast.type === 'success' && 'bg-zinc-900/95 border-emerald-500/30 text-zinc-100 shadow-emerald-500/5',
            toast.type === 'error' && 'bg-zinc-900/95 border-rose-500/30 text-zinc-100 shadow-rose-500/5',
            toast.type === 'warning' && 'bg-zinc-900/95 border-amber-500/40 text-amber-200 shadow-amber-500/10',
            toast.type === 'info' && 'bg-zinc-900/95 border-zinc-700/80 text-zinc-100'
          )}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toast.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
            {toast.type === 'info' && <Info className="w-4 h-4 text-amber-400 shrink-0" />}
            <span className="text-xs font-medium tracking-tight leading-snug">{toast.message}</span>
          </div>

          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
