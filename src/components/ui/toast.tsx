'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, type, duration = 4000, action }: Omit<ToastItem, 'id'>) => {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
      const item: ToastItem = { id, message, type, duration, action };

      setToasts((prev) => [...prev, item]);

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }

      return id;
    },
    [dismissToast]
  );

  const toast = {
    success: useCallback(
      (message: string, options?: { duration?: number; action?: ToastAction }) => {
        showToast({ message, type: 'success', duration: options?.duration ?? 4000, action: options?.action });
      },
      [showToast]
    ),
    error: useCallback(
      (message: string, options?: { duration?: number; action?: ToastAction }) => {
        showToast({ message, type: 'error', duration: options?.duration ?? 5000, action: options?.action });
      },
      [showToast]
    ),
    info: useCallback(
      (message: string, options?: { duration?: number; action?: ToastAction }) => {
        showToast({ message, type: 'info', duration: options?.duration ?? 4000, action: options?.action });
      },
      [showToast]
    ),
  };

  return (
    <ToastContext.Provider value={{ toast, showToast, dismissToast }}>
      {children}

      {/* Toast Notification Container */}
      <div
        className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 pointer-events-none max-w-sm w-full px-4"
        aria-live="polite"
        role="region"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-2xl border p-4 shadow-xl backdrop-blur-md transition-all animate-in slide-in-from-bottom-5 duration-200 flex items-center justify-between gap-3 text-xs font-semibold',
              t.type === 'success' &&
                'bg-white dark:bg-gray-900 border-emerald-200 text-emerald-950 dark:border-emerald-800 dark:text-emerald-100 shadow-emerald-500/10',
              t.type === 'error' &&
                'bg-white dark:bg-gray-900 border-red-200 text-red-950 dark:border-red-800 dark:text-red-100 shadow-red-500/10',
              t.type === 'info' &&
                'bg-white dark:bg-gray-900 border-blue-200 text-blue-950 dark:border-blue-800 dark:text-blue-100 shadow-blue-500/10'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {t.type === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />}
              {t.type === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />}
              {t.type === 'info' && <Info className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />}
              <span className="truncate leading-snug">{t.message}</span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismissToast(t.id);
                  }}
                  className="rounded-lg bg-gray-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 transition shadow-xs"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
