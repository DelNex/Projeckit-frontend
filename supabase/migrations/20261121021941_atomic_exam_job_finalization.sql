-- Finalize generated questions and the durable job state in one transaction.
-- The job row lock serializes finalization against a teacher's cancel request.
CREATE OR REPLACE FUNCTION public.finalize_exam_generation_job(
  p_job_id uuid,
  p_root_job_id uuid,
  p_tos_id uuid,
  p_tenant_id uuid,
  p_questions jsonb,
  p_exam_status text,
  p_job_status text,
  p_result_summary jsonb,
  p_error_message text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  root_job public.exam_generation_jobs;
  child_job public.exam_generation_jobs;
  v_answers jsonb;
BEGIN
  IF p_job_id IS NULL OR p_root_job_id IS NULL OR p_tos_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Exam job, TOS, and tenant references are required.';
  END IF;
  IF p_job_status IS NULL OR p_job_status NOT IN ('completed', 'partial') THEN
    RAISE EXCEPTION 'Invalid final exam job status.';
  END IF;
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' OR jsonb_array_length(p_questions) = 0 THEN
    RAISE EXCEPTION 'No valid exam questions were provided.';
  END IF;
  IF p_result_summary IS NULL OR jsonb_typeof(p_result_summary) <> 'object' THEN
    RAISE EXCEPTION 'An exam result summary is required.';
  END IF;

  -- Lock the root first, matching the cancellation route's lock order.
  SELECT * INTO root_job
  FROM public.exam_generation_jobs
  WHERE id = p_root_job_id
    AND tenant_id = p_tenant_id
    AND tos_id = p_tos_id
    AND parent_job_id IS NULL
  FOR UPDATE;

  IF NOT FOUND OR root_job.status IS DISTINCT FROM 'running' THEN
    RAISE EXCEPTION 'EXAM_JOB_NOT_ACTIVE';
  END IF;

  IF p_job_id = p_root_job_id THEN
    child_job := root_job;
  ELSE
    SELECT * INTO child_job
    FROM public.exam_generation_jobs
    WHERE id = p_job_id
      AND parent_job_id = p_root_job_id
      AND tenant_id = p_tenant_id
      AND tos_id = p_tos_id
    FOR UPDATE;

    IF NOT FOUND OR child_job.status IS DISTINCT FROM 'running' THEN
      RAISE EXCEPTION 'EXAM_JOB_NOT_ACTIVE';
    END IF;
  END IF;

  PERFORM 1
  FROM public.tos_documents
  WHERE id = p_tos_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOS was not found in this school.';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      COALESCE(item.value->>'item_number', item.value->>'question_number'),
      COALESCE(item.value->>'correct_answer', item.value->>'correctAnswer', item.value->>'answer')
    ),
    '{}'::jsonb
  )
  INTO v_answers
  FROM jsonb_array_elements(p_questions) AS item(value)
  WHERE COALESCE(item.value->>'item_number', item.value->>'question_number') IS NOT NULL
    AND COALESCE(item.value->>'correct_answer', item.value->>'correctAnswer', item.value->>'answer') IS NOT NULL;

  UPDATE public.tos_documents
  SET questions = p_questions, updated_at = now()
  WHERE id = p_tos_id AND tenant_id = p_tenant_id;

  UPDATE public.assessments
  SET questions = p_questions, exam_status = p_exam_status, updated_at = now()
  WHERE tos_id = p_tos_id AND tenant_id = p_tenant_id;

  INSERT INTO public.answer_keys (assessment_id, tenant_id, answers, updated_at)
  SELECT assessment.id, p_tenant_id, v_answers, now()
  FROM public.assessments AS assessment
  WHERE assessment.tos_id = p_tos_id AND assessment.tenant_id = p_tenant_id
  ON CONFLICT (assessment_id) DO UPDATE
  SET answers = EXCLUDED.answers, updated_at = EXCLUDED.updated_at;

  UPDATE public.exam_generation_jobs
  SET status = p_job_status,
      result_summary = p_result_summary,
      error = p_error_message,
      finished_at = now(),
      updated_at = now(),
      payload = '{}'::jsonb,
      claimed_by = NULL,
      lease_expires_at = NULL,
      progress = jsonb_build_object(
        'stage', p_job_status,
        'percent', 100,
        'label', CASE WHEN p_job_status = 'partial' THEN 'Exam ready with some missing items' ELSE 'Exam ready' END
      )
  WHERE id = p_root_job_id;

  IF p_job_id <> p_root_job_id THEN
    UPDATE public.exam_generation_jobs
    SET status = 'completed',
        result_summary = jsonb_build_object('parentJobId', p_root_job_id),
        error = NULL,
        finished_at = now(),
        updated_at = now(),
        payload = '{}'::jsonb,
        claimed_by = NULL,
        lease_expires_at = NULL
    WHERE id = p_job_id;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_exam_generation_job(uuid, uuid, uuid, uuid, jsonb, text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_exam_generation_job(uuid, uuid, uuid, uuid, jsonb, text, text, jsonb, text)
  TO service_role;

-- The older save-only RPC is no longer used by the application. Keep it
-- restricted to server-side callers as a defense-in-depth measure.
REVOKE ALL ON FUNCTION public.save_generated_exam_questions(uuid, uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_generated_exam_questions(uuid, uuid, jsonb, text)
  TO service_role;
