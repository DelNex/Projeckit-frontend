'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: ToastAction;
}

interface ToastContextType {
  toast: {
    success: (message: string, options?: { duration?: number; action?: ToastAction }) => void;
    error: (message: string, options?: { duration?: number; action?: ToastAction }) => void;
    info: (message: string, options?: { duration?: number; action?: ToastAction }) => void;
  };
  showToast: (item: Omit<ToastItem, 'id'>) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);
const MAX_VISIBLE_TOASTS = 5;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((input: Omit<ToastItem, 'id'>) => {
    const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const item: ToastItem = { ...input, id, duration: input.duration ?? 4000 };

    setToasts((current) => {
      const next = [item, ...current];
      next.slice(MAX_VISIBLE_TOASTS).forEach((removed) => {
        const timer = timers.current.get(removed.id);
        if (timer) clearTimeout(timer);
        timers.current.delete(removed.id);
      });
      return next.slice(0, MAX_VISIBLE_TOASTS);
    });

    if (item.duration && item.duration > 0) {
      timers.current.set(id, setTimeout(() => dismissToast(id), item.duration));
    }
    return id;
  }, [dismissToast]);

  const success = useCallback((message: string, options?: { duration?: number; action?: ToastAction }) => {
    showToast({ message, type: 'success', duration: options?.duration ?? 4000, action: options?.action });
  }, [showToast]);
  const error = useCallback((message: string, options?: { duration?: number; action?: ToastAction }) => {
    showToast({ message, type: 'error', duration: options?.duration ?? 5500, action: options?.action });
  }, [showToast]);
  const info = useCallback((message: string, options?: { duration?: number; action?: ToastAction }) => {
    showToast({ message, type: 'info', duration: options?.duration ?? 4000, action: options?.action });
  }, [showToast]);
  const toast = useMemo(() => ({ success, error, info }), [success, error, info]);

  useEffect(() => () => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
  }, []);

  return (
    <ToastContext.Provider value={{ toast, showToast, dismissToast }}>
      {children}
      <div className="pk-toast-stack" aria-label="Notifications" aria-live="polite" aria-relevant="additions text" role="region">
        {toasts.map((item) => {
          const Icon = item.type === 'success' ? CheckCircle2 : item.type === 'error' ? AlertCircle : Info;
          const label = item.type === 'success' ? 'Completed' : item.type === 'error' ? 'Something went wrong' : 'Notice';
          return (
            <article key={item.id} className={cn('pk-toast', 'pk-toast-enter')} role={item.type === 'error' ? 'alert' : 'status'}>
              <span className="pk-toast-icon" aria-hidden="true"><Icon size={18} strokeWidth={2} /></span>
              <div className="pk-toast-copy">
                <strong>{label}</strong>
                <p>{item.message}</p>
                {item.action && (
                  <button type="button" className="pk-toast-action" onClick={() => {
                    try { item.action?.onClick(); } finally { dismissToast(item.id); }
                  }}>{item.action.label}</button>
                )}
              </div>
              <button type="button" className="pk-toast-dismiss" onClick={() => dismissToast(item.id)} aria-label="Dismiss notification">
                <X size={16} />
              </button>
              {item.duration !== 0 && <span className="pk-toast-progress" style={{ animationDuration: `${item.duration}ms` }} aria-hidden="true" />}
            </article>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
