'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExamQuestion } from '@/lib/exam-types';
import { invalidateClientQueryCache } from '@/lib/supabase/client';
import { uploadCompressedLessonDocuments, removeCompressedLessonSourceFromBrowser } from '@/lib/lesson-source-upload';

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
export interface ExamGenerationQuota {
  hourly: { used: number; limit: number; remaining: number };
  daily: { used: number; limit: number; remaining: number };
}
export interface ExamGenerationRetryState {
  retryUntil: number | null;
  failedJobId: string | null;
  lastError: string | null;
  canRetry: boolean;
}
export function useExamGenerationJob(tosId: string | undefined) {
  const [job, setJob] = useState<ExamGenerationJob | null>(null);
  const [quota, setQuota] = useState<ExamGenerationQuota | null>(null);
  const [retryState, setRetryState] = useState<ExamGenerationRetryState>({ retryUntil: null, failedJobId: null, lastError: null, canRetry: true });
  const [quotaAvailable, setQuotaAvailable] = useState(false);
  const [retryClock, setRetryClock] = useState(Date.now());
  const [isStarting, setIsStarting] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [savedQuestions, setSavedQuestions] = useState<ExamQuestion[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const alive = useRef(true);
  const lastQuotaCheckAt = useRef(0);
  const quotaRequest = useRef<Promise<void> | null>(null);
  const activeTosId = useRef(tosId);
  activeTosId.current = tosId;

  useEffect(() => {
    setQuota(null);
    setRetryState({ retryUntil: null, failedJobId: null, lastError: null, canRetry: true });
    setQuotaAvailable(false);
    setSavedQuestions(null);
    setJob(null);
    setLoadError(null);
    lastQuotaCheckAt.current = 0;
    quotaRequest.current = null;
  }, [tosId]);

  const refreshQuota = useCallback(async (force = false) => {
    if (quotaRequest.current) return quotaRequest.current;
    if (!force && Date.now() - lastQuotaCheckAt.current < 30_000) return;
    const requestedTosId = tosId;
    const request = (async () => {
      lastQuotaCheckAt.current = Date.now();
      try {
        const response = await fetch(`/api/ai/exam-quota${tosId ? `?tosId=${encodeURIComponent(tosId)}` : ''}`, { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load generation limits.');
        if (!alive.current || activeTosId.current !== requestedTosId) return;
        setQuota(data.quota || null);
        setRetryState({
          retryUntil: Number(data.retryAfterSeconds) > 0 ? Date.now() + Number(data.retryAfterSeconds) * 1000 : null,
          failedJobId: typeof data.failedJobId === 'string' ? data.failedJobId : null,
          lastError: typeof data.lastError === 'string' ? data.lastError : null,
          canRetry: data.canRetry !== false,
        });
        setQuotaAvailable(Boolean(data.quotaAvailable));
      } catch {
        if (alive.current && activeTosId.current === requestedTosId) setQuotaAvailable(false);
      } finally {
        if (activeTosId.current === requestedTosId) quotaRequest.current = null;
      }
    })();
    quotaRequest.current = request;
    return request;
  }, [tosId]);

  useEffect(() => {
    if (!retryState.retryUntil || retryState.retryUntil <= Date.now()) return;
    const timer = setInterval(() => setRetryClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryState.retryUntil]);

  const retryAfterSeconds = retryState.retryUntil ? Math.max(0, Math.ceil((retryState.retryUntil - retryClock) / 1000)) : 0;

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
    if (!tosId) { setIsInitialLoading(false); return () => { alive.current = false; }; }
    setIsInitialLoading(true);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const [latest] = await Promise.all([
          fetch(`/api/ai/exam-jobs?tosId=${encodeURIComponent(tosId)}`, { cache: 'no-store' }).then(async (r) => {
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Could not load exam generation status.');
            return data.job as ExamGenerationJob | null;
          }), refreshQuota(true),
        ]);
        if (cancelled) return;
        setJob(latest);
        setIsInitialLoading(false);
        if (latest && ['queued', 'running', 'needs_attention'].includes(latest.status) && !startedAt.current) startedAt.current = Date.now();
        if (latest && ['completed', 'partial'].includes(latest.status)) await refreshJob(latest.id);
      } catch (error) { if (!cancelled) { setLoadError(error instanceof Error ? error.message : 'Could not load exam status.'); setIsInitialLoading(false); } }
    };
    void load();
    const onFocus = () => { void load(); void refreshQuota(true); };
    const onVisibility = () => { if (document.visibilityState === 'visible') { void load(); void refreshQuota(true); } };
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
          await refreshQuota(Boolean(latestData.job && latestData.job.status === 'failed'));
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
  }, [tosId, refreshQuota, refreshJob]);

  const start = useCallback(async (input: { lessonText?: string; lessonDocuments?: Array<{ name: string; text: string; competencyId?: string }>; teacherInstructions?: string; repairItemNumber?: number }) => {
    if (!tosId) throw new Error('A TOS is required to start exam generation.');
    if (quotaAvailable && quota && (quota.hourly.remaining <= 0 || quota.daily.remaining <= 0)) throw new Error(quota.hourly.remaining <= 0 ? 'You have reached the hourly exam-generation limit. Please wait before trying again.' : 'Your school has reached its daily exam-generation limit.');
    if (job && ['queued', 'running', 'needs_attention'].includes(job.status)) throw new Error('This TOS already has an active generation job. Cancel or resolve it before starting another.');
    const documents = input.lessonDocuments?.length
      ? input.lessonDocuments
      : input.lessonText?.trim()
        ? [{ name: 'Lesson materials', text: input.lessonText }]
        : [];
    if (!documents.length) throw new Error('Extract at least one lesson document before generating an exam.');
    setIsStarting(true); setSavedQuestions(null); setLoadError(null);
    let sourceManifest: Awaited<ReturnType<typeof uploadCompressedLessonDocuments>> | null = null;
    let keepSource = false;
    try {
      sourceManifest = await uploadCompressedLessonDocuments(documents);
      const response = await fetch('/api/ai/exam-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tosId,
          sourceManifest,
          teacherInstructions: input.teacherInstructions,
          repairItemNumber: input.repairItemNumber,
        }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not queue exam generation.');
      keepSource = !data.reused;
      invalidateClientQueryCache();
      startedAt.current = Date.now();
      setJob({ id: data.id, status: data.status, queuePosition: data.queuePosition || null });
      void refreshQuota(true);
      return data as { id: string; status: ExamJobStatus; queuePosition: number };
    } finally {
      if (sourceManifest && !keepSource) await removeCompressedLessonSourceFromBrowser(sourceManifest);
      setIsStarting(false);
    }
  }, [tosId, job, quotaAvailable, quota, refreshQuota]);

  const cancel = useCallback(async () => {
    if (!job || !['queued', 'running', 'needs_attention'].includes(job.status)) return;
    const response = await fetch(`/api/ai/exam-jobs/${encodeURIComponent(job.id)}`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not cancel exam generation.');
    invalidateClientQueryCache();
    setJob({ ...job, status: 'cancelled' });
  }, [job]);

  return { job, isStarting, isInitialLoading, savedQuestions, loadError, quota, quotaAvailable, retryState, retryAfterSeconds, start, cancel, refreshJob };
}
