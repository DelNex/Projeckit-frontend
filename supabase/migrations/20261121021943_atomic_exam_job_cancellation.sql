-- Cancel a root exam job and every active repair child in one transaction.
-- Lock ordering matches finalize_exam_generation_job: root first, then children.
CREATE OR REPLACE FUNCTION public.cancel_exam_generation_job(
  p_job_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  root_job public.exam_generation_jobs;
BEGIN
  IF p_job_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Exam job and tenant references are required.';
  END IF;

  SELECT * INTO root_job
  FROM public.exam_generation_jobs
  WHERE id = p_job_id
    AND tenant_id = p_tenant_id
    AND parent_job_id IS NULL
    AND provider = 'groq_api'
  FOR UPDATE;

  IF NOT FOUND OR root_job.status NOT IN ('queued', 'running', 'needs_attention') THEN
    RETURN false;
  END IF;

  UPDATE public.exam_generation_jobs
  SET status = 'cancelled',
      error = 'Cancelled by the user.',
      finished_at = now(),
      updated_at = now(),
      payload = '{}'::jsonb,
      claimed_by = NULL,
      lease_expires_at = NULL
  WHERE id = p_job_id
    AND tenant_id = p_tenant_id;

  UPDATE public.exam_generation_jobs
  SET status = 'cancelled',
      error = 'Parent exam generation job was cancelled.',
      finished_at = now(),
      updated_at = now(),
      payload = '{}'::jsonb,
      claimed_by = NULL,
      lease_expires_at = NULL
  WHERE parent_job_id = p_job_id
    AND tenant_id = p_tenant_id
    AND status IN ('queued', 'running', 'needs_attention');

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_exam_generation_job(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_exam_generation_job(uuid, uuid)
  TO service_role;
