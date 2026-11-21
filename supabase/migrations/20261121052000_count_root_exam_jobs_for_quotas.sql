-- Quota counts represent teacher-submitted exam requests, not internal repair batches.
-- Each full exam request has one root row; validation may create child repair jobs.
-- Counting child jobs made a single exam consume multiple quota slots.

CREATE OR REPLACE FUNCTION public.enqueue_groq_exam_generation_job(
  p_tenant_id uuid,
  p_tos_id uuid,
  p_created_by uuid,
  p_payload jsonb,
  p_job_kind text,
  p_hourly_limit integer DEFAULT 5,
  p_daily_limit integer DEFAULT 100
)
RETURNS TABLE(job_id uuid, created_at timestamptz, status text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  existing public.exam_generation_jobs;
  created_job public.exam_generation_jobs;
  profile_tenant uuid;
  hourly_count integer;
  daily_count integer;
  safe_hourly_limit integer;
  safe_daily_limit integer;
BEGIN
  IF p_tenant_id IS NULL OR p_tos_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'Tenant, TOS, and creator are required.';
  END IF;

  IF p_job_kind IS NULL OR p_job_kind NOT IN ('full', 'repair') THEN
    RAISE EXCEPTION 'Invalid exam job kind.';
  END IF;

  IF p_payload IS NULL OR pg_column_size(p_payload) > 1572864 THEN
    RAISE EXCEPTION 'Exam job payload exceeds the queue limit.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('projectkit:exam-generation-quota:' || p_tenant_id::text, 0)
  );

  SELECT p.tenant_id INTO profile_tenant
  FROM public.profiles p
  WHERE p.id = p_created_by
    AND p.status = 'approved'
    AND p.archived_at IS NULL;

  IF profile_tenant IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'The creator is not an approved member of this school.';
  END IF;

  PERFORM 1
  FROM public.tos_documents t
  WHERE t.id = p_tos_id AND t.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOS was not found in this school.';
  END IF;

  SELECT j.* INTO existing
  FROM public.exam_generation_jobs j
  WHERE j.tos_id = p_tos_id
    AND j.tenant_id = p_tenant_id
    AND j.parent_job_id IS NULL
    AND j.provider = 'groq_api'
    AND j.status IN ('queued', 'running', 'needs_attention')
  ORDER BY j.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT existing.id, existing.created_at, existing.status, false;
    RETURN;
  END IF;

  safe_hourly_limit := greatest(1, least(coalesce(p_hourly_limit, 5), 1000));
  safe_daily_limit := greatest(1, least(coalesce(p_daily_limit, 100), 10000));

  SELECT count(*)::integer INTO hourly_count
  FROM public.exam_generation_jobs j
  WHERE j.created_by = p_created_by
    AND j.parent_job_id IS NULL
    AND j.created_at >= now() - interval '1 hour'
    AND j.status <> 'cancelled'
    AND (j.status <> 'failed' OR j.attempts > 0);

  IF hourly_count >= safe_hourly_limit THEN
    RAISE EXCEPTION 'EXAM_HOURLY_LIMIT_REACHED';
  END IF;

  SELECT count(*)::integer INTO daily_count
  FROM public.exam_generation_jobs j
  WHERE j.tenant_id = p_tenant_id
    AND j.parent_job_id IS NULL
    AND j.created_at >= now() - interval '24 hours'
    AND j.status <> 'cancelled'
    AND (j.status <> 'failed' OR j.attempts > 0);

  IF daily_count >= safe_daily_limit THEN
    RAISE EXCEPTION 'EXAM_DAILY_LIMIT_REACHED';
  END IF;

  INSERT INTO public.exam_generation_jobs (
    tenant_id, tos_id, created_by, payload, provider, job_kind
  )
  VALUES (
    p_tenant_id, p_tos_id, p_created_by, p_payload, 'groq_api', p_job_kind
  )
  RETURNING * INTO created_job;

  RETURN QUERY SELECT created_job.id, created_job.created_at, created_job.status, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_groq_exam_generation_job(uuid, uuid, uuid, jsonb, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_groq_exam_generation_job(uuid, uuid, uuid, jsonb, text, integer, integer)
  TO service_role;
