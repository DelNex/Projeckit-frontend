-- Give transient provider outages more room to recover without asking
-- teachers to manually resubmit. Retry scheduling still honors Retry-After
-- and is bounded to a maximum 15-minute delay.
ALTER TABLE public.exam_generation_jobs
  ALTER COLUMN max_attempts SET DEFAULT 5;

-- Existing in-flight jobs inherit the same retry allowance. Terminal jobs are
-- intentionally untouched; failed exams are never silently resurrected.
UPDATE public.exam_generation_jobs
SET max_attempts = 5,
    updated_at = now()
WHERE status IN ('queued', 'running', 'needs_attention')
  AND max_attempts < 5;
