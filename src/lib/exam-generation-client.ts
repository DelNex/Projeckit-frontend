'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExamQuestion } from '@/lib/exam-types';
import { invalidateClientQueryCache } from '@/lib/supabase/client';

export type ExamJobStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled' | 'needs_attention';
export interface ExamGenerationJob {
  id: string;
  tosId?: string;
  status: ExamJobStatus;
  progress?: { label?: string; completedChunks?: number; totalChunks?: number };
  error?: string | null;
  queuePosition?: number | null;
  resultSummary?: { missingItems?: number[]; questionCount?: number } | null;
}
export type HelperAvailability = 'online' | 'busy' | 'offline' | 'needs_attention';

export function useExamGenerationJob(tosId: string | undefined) {
  const [job, setJob] = useState<ExamGenerationJob | null>(null);
  const [helperState, setHelperState] = useState<HelperAvailability>('offline');
  const [isStarting, setIsStarting] = useState(false);
  const [savedQuestions, setSavedQuestions] = useState<ExamQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const alive = useRef(true);

  const refreshHelperStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/helper-status', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      if (alive.current) setHelperState(data.state as HelperAvailability);
    } catch { /* Status is informational; queueing remains available while offline. */ }
  }, []);

  const refreshJob = useCallback(async (id: string) => {
    const response = await fetch(`/api/ai/exam-jobs/${encodeURIComponent(id)}`, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load exam generation status.');
    if (alive.current) setJob(data as ExamGenerationJob);
    if (data.status === 'completed' || data.status === 'partial') {
      const saved = await fetch(`/api/ai/exam-jobs/${encodeURIComponent(id)}/questions`, { cache: 'no-store' });
      const result = await saved.json().catch(() => ({}));
      if (saved.ok && alive.current) setSavedQuestions(Array.isArray(result.questions) ? result.questions : []);
    }
    return data as ExamGenerationJob;
  }, []);

  useEffect(() => {
    alive.current = true;
    if (!tosId) return () => { alive.current = false; };
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const [latest] = await Promise.all([
          fetch(`/api/ai/exam-jobs?tosId=${encodeURIComponent(tosId)}`, { cache: 'no-store' }).then(async (r) => {
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Could not load exam generation status.');
            return data.job as ExamGenerationJob | null;
          }), refreshHelperStatus(),
        ]);
        if (cancelled) return;
        setJob(latest);
        if (latest && ['queued', 'running', 'needs_attention'].includes(latest.status) && !startedAt.current) startedAt.current = Date.now();
        if (latest && ['completed', 'partial'].includes(latest.status)) await refreshJob(latest.id);
      } catch (error) { if (!cancelled) setLoadError(error instanceof Error ? error.message : 'Could not load exam status.'); }
    };
    void load();
    const onFocus = () => { void load(); void refreshHelperStatus(); };
    const onVisibility = () => { if (document.visibilityState === 'visible') { void load(); void refreshHelperStatus(); } };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') {
        try {
          const latestResponse = await fetch(`/api/ai/exam-jobs?tosId=${encodeURIComponent(tosId)}`, { cache: 'no-store' });
          const latestData = await latestResponse.json();
          if (latestResponse.ok && latestData.job) {
            const next = latestData.job as ExamGenerationJob;
            setJob(next);
            if (['completed', 'partial'].includes(next.status)) await refreshJob(next.id);
            else if (['queued', 'running', 'needs_attention'].includes(next.status)) await refreshJob(next.id);
          }
          await refreshHelperStatus();
        } catch { /* next poll retries */ }
      }
      const delay = Date.now() - startedAt.current > 60_000 ? 8000 : 2500;
      timer = setTimeout(poll, delay);
    };
    timer = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      alive.current = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tosId, refreshHelperStatus, refreshJob]);

  const start = useCallback(async (input: { lessonText?: string; lessonDocuments?: Array<{ name: string; text: string }>; repairItemNumber?: number }) => {
    if (!tosId) throw new Error('A TOS is required to start exam generation.');
    if (job && ['queued', 'running', 'needs_attention'].includes(job.status)) throw new Error('This TOS already has an active generation job. Cancel or resolve it before starting another.');
    if (helperState === 'offline' || helperState === 'needs_attention') throw new Error('The Gemini helper is unavailable. No job was created. Start the helper and try again.');
    setIsStarting(true); setSavedQuestions(null); setLoadError(null);
    try {
      const response = await fetch('/api/ai/exam-jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tosId, ...input }), cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not queue exam generation.');
      invalidateClientQueryCache();
      startedAt.current = Date.now();
      setJob({ id: data.id, status: data.status, queuePosition: data.queuePosition || null });
      void refreshHelperStatus();
      return data as { id: string; status: ExamJobStatus; queuePosition: number };
    } finally { setIsStarting(false); }
  }, [tosId, job, helperState, refreshHelperStatus]);

  const cancel = useCallback(async () => {
    if (!job || !['queued', 'running', 'needs_attention'].includes(job.status)) return;
    const response = await fetch(`/api/ai/exam-jobs/${encodeURIComponent(job.id)}`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not cancel exam generation.');
    invalidateClientQueryCache();
    setJob({ ...job, status: 'cancelled' });
  }, [job]);

  return { job, helperState, isStarting, savedQuestions, loadError, start, cancel, refreshJob };
}
