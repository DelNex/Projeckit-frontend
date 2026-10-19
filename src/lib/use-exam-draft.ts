'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExamQuestion } from '@/lib/exam-types';
import { createClient, invalidateClientQueryCache } from '@/lib/supabase/client';
import { examDraftRetryDelay, isExamDraftConflict, shouldWarnBeforeClosing } from '@/lib/exam-draft-policy';

type Setter = (value: ExamQuestion[] | ((previous: ExamQuestion[]) => ExamQuestion[])) => void;
type SaveState = 'saved' | 'unsaved' | 'saving' | 'offline' | 'error';

export function useExamDraft(tosId: string | undefined, questions: ExamQuestion[], setQuestions: Setter) {
  const [state, setState] = useState<SaveState>('saved');
  const [savedLabel, setSavedLabel] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const retryCount = useRef(0);
  const dirty = state === 'unsaved' || state === 'offline' || state === 'saving' || state === 'error';
  const client = createClient();

  const readLatest = useCallback(async () => {
    if (!tosId) return null;
    const { data, error } = await client.from('tos_documents').select('questions,updated_at').eq('id', tosId).maybeSingle();
    if (error || !data) return null;
    return data as { questions: ExamQuestion[] | null; updated_at: string };
  }, [client, tosId]);

  useEffect(() => {
    let cancelled = false;
    void readLatest().then((latest) => {
      if (!cancelled && latest) setVersion(latest.updated_at);
    });
    return () => { cancelled = true; };
  }, [readLatest]);

  const markDirty = useCallback(() => { setSaveError(null); setState('unsaved'); }, []);
  const acceptServerQuestions = useCallback((next: ExamQuestion[]) => {
    setQuestions(next);
    setSaveError(null); setState('saved');
    retryCount.current = 0;
    void readLatest().then((latest) => { if (latest) setVersion(latest.updated_at); });
  }, [readLatest, setQuestions]);

  const saveNow = useCallback(async (forceOverwrite = false) => {
    if (!tosId || !questions.length) return;
    const snapshot = JSON.stringify(questions);
    setState('saving');
    const response = await fetch('/api/ai/save-exam', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tosId, questions, mode: 'draft', autosave: true, expectedUpdatedAt: version, overwrite: forceOverwrite }),
      cache: 'no-store',
    });
    const result = await response.json().catch(() => ({}));
    if (isExamDraftConflict(response.status, String(result.error || ''))) {
      setConflict(true); setState('unsaved'); return;
    }
    if (!response.ok) throw Object.assign(new Error(result.error || 'Could not save exam draft.'), { status: response.status });
    invalidateClientQueryCache();
    if (result.updatedAt) setVersion(result.updatedAt);
    retryCount.current = 0;
    setOverwrite(false);
    if (JSON.stringify(questions) === snapshot) {
      setState('saved');
      setSaveError(null);
      setSavedLabel(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } else setState('unsaved');
  }, [questions, tosId, version]);

  useEffect(() => {
    if (!tosId || !['unsaved', 'offline'].includes(state) || conflict) return;
    if (!version) {
      let cancelled = false;
      void readLatest().then((latest) => {
        if (cancelled) return;
        if (latest) setVersion(latest.updated_at);
        else { setSaveError('Could not load the current exam version.'); setState('error'); }
      });
      return () => { cancelled = true; };
    }
    const delay = examDraftRetryDelay(retryCount.current);
    const timer = setTimeout(() => {
      void saveNow(overwrite).catch((error) => {
        const statusCode = Number((error as any)?.status || 0);
        if (statusCode >= 400 && statusCode < 500) {
          setSaveError(error instanceof Error ? error.message : 'This exam draft cannot be saved.');
          setState('error');
        } else {
          retryCount.current += 1;
          setState('offline');
        }
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [conflict, overwrite, questions, readLatest, saveNow, state, tosId, version]);

  useEffect(() => {
    if (!tosId || !shouldWarnBeforeClosing(dirty)) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, tosId]);

  useEffect(() => {
    if (!tosId) return;
    const onFocus = () => {
      void readLatest().then((latest) => {
        if (!latest || !version || latest.updated_at <= version) return;
        if (dirty) setConflict(true);
        else {
          setQuestions(latest.questions || []);
          setVersion(latest.updated_at);
          setState('saved');
        }
      });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [dirty, readLatest, setQuestions, tosId, version]);

  const loadNewerVersion = useCallback(async () => {
    const latest = await readLatest();
    if (!latest) return;
    setQuestions(latest.questions || []);
    setVersion(latest.updated_at);
    setConflict(false);
    setOverwrite(false);
    retryCount.current = 0;
    setSaveError(null); setState('saved');
  }, [readLatest, setQuestions]);

  const keepMyVersion = useCallback(async () => {
    setConflict(false);
    setOverwrite(true);
    try { await saveNow(true); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Could not save your exam draft.'); setState('error'); }
  }, [saveNow]);

  const statusText = state === 'saving' ? 'Saving…' : state === 'unsaved' ? 'Unsaved changes' : state === 'offline' ? 'Offline - will retry' : state === 'error' ? (saveError || 'Could not save draft') : savedLabel ? `Saved ${savedLabel}` : 'Saved';
  return {
    state, statusText, dirty, conflict, confirmClose, markDirty, acceptServerQuestions,
    loadNewerVersion, keepMyVersion, saveNow,
    requestClose: (close: () => void) => { if (dirty) setConfirmClose(true); else close(); },
    confirmDiscard: (close: () => void) => { setConfirmClose(false); close(); },
    cancelDiscard: () => setConfirmClose(false),
  };
}
