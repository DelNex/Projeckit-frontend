-- Restrict school-wide configuration writes to approved tenant administrators.
-- Tenant members retain read access for normal teaching workflows.

-- Archived accounts must not retain tenant or administrator privileges.
CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT p.tenant_id
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
    AND p.status = 'approved'
    AND p.archived_at IS NULL
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'admin'
      AND p.status = 'approved'
      AND p.archived_at IS NULL
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (
      SELECT p.is_platform_admin
      FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    ),
    false
  );
$function$;

-- Optimize and tighten profile RLS. The previous SELECT policy used
-- is_current_user_admin() without a tenant predicate, allowing any school
-- administrator to read profiles from every school.
DROP POLICY IF EXISTS "Admins can manage all profiles in their tenant" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their own tenant" ON public.profiles;

CREATE POLICY "Tenant members can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    OR id = (SELECT auth.uid())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY "Tenant admins can insert profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND (SELECT public.is_current_user_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY "Users and tenant admins can update profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND (SELECT public.is_current_user_admin())
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    id = (SELECT auth.uid())
    OR (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND (SELECT public.is_current_user_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY "Tenant admins can delete profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND (SELECT public.is_current_user_admin())
    )
    OR (SELECT public.is_platform_admin())
  );

-- Direct audit writes are administrator-only. System service-role writes
-- continue to bypass RLS and are not exposed to teacher sessions.
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant members can insert own audit events" ON public.audit_logs;

-- Cache the caller identity once per statement and exclude archived accounts.
DROP POLICY IF EXISTS "Approved tenant members can read exam generation jobs" ON public.exam_generation_jobs;
CREATE POLICY "Approved tenant members can read exam generation jobs"
  ON public.exam_generation_jobs FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.tenant_id = exam_generation_jobs.tenant_id
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Approved tenant members can read school settings" ON public.school_settings;
CREATE POLICY "Approved tenant members can read school settings"
  ON public.school_settings FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.tenant_id = school_settings.tenant_id
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Tenant admins can insert school settings" ON public.school_settings;
CREATE POLICY "Tenant admins can insert school settings"
  ON public.school_settings FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.tenant_id = school_settings.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Tenant admins can update school settings" ON public.school_settings;
CREATE POLICY "Tenant admins can update school settings"
  ON public.school_settings FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.tenant_id = school_settings.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
  )
  WITH CHECK (
    (SELECT public.is_platform_admin())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.tenant_id = school_settings.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
  );

-- Academic configuration
DROP POLICY IF EXISTS "Tenant isolation for academic_configs" ON public.academic_configs;
CREATE POLICY "Approved tenant members can read academic configs"
  ON public.academic_configs FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can insert academic configs"
  ON public.academic_configs FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = academic_configs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can update academic configs"
  ON public.academic_configs FOR UPDATE TO authenticated
  USING (
    (tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = academic_configs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = academic_configs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can delete academic configs"
  ON public.academic_configs FOR DELETE TO authenticated
  USING (
    (tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = academic_configs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
    OR (SELECT public.is_platform_admin())
  );

-- Sections
DROP POLICY IF EXISTS "Tenant isolation for sections" ON public.sections;
CREATE POLICY "Tenant members can read sections"
  ON public.sections FOR SELECT TO authenticated
  USING (
    config_id IN (
      SELECT c.id FROM public.academic_configs c
      WHERE c.tenant_id = (SELECT public.get_current_tenant_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can insert sections"
  ON public.sections FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_configs c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = sections.config_id
        AND c.tenant_id = p.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can update sections"
  ON public.sections FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_configs c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = sections.config_id
        AND c.tenant_id = p.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_configs c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = sections.config_id
        AND c.tenant_id = p.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can delete sections"
  ON public.sections FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_configs c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = sections.config_id
        AND c.tenant_id = p.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
    OR (SELECT public.is_platform_admin())
  );

-- Subjects
DROP POLICY IF EXISTS "Tenant isolation for subjects" ON public.subjects;
CREATE POLICY "Tenant members can read subjects"
  ON public.subjects FOR SELECT TO authenticated
  USING (
    config_id IN (
      SELECT c.id FROM public.academic_configs c
      WHERE c.tenant_id = (SELECT public.get_current_tenant_id())
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can insert subjects"
  ON public.subjects FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_configs c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = subjects.config_id
        AND c.tenant_id = p.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can update subjects"
  ON public.subjects FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_configs c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = subjects.config_id
        AND c.tenant_id = p.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.academic_configs c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = subjects.config_id
        AND c.tenant_id = p.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can delete subjects"
  ON public.subjects FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.academic_configs c
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE c.id = subjects.config_id
        AND c.tenant_id = p.tenant_id
        AND p.role = 'admin'
        AND p.status = 'approved'
        AND p.archived_at IS NULL
    )
    OR (SELECT public.is_platform_admin())
  );

-- Grading periods: tenant members can read; only administrators can mutate.
DROP POLICY IF EXISTS "Users can manage grading periods in their tenant" ON public.grading_periods;
DROP POLICY IF EXISTS "Users can view grading periods in their tenant" ON public.grading_periods;
CREATE POLICY "Tenant members can read grading periods"
  ON public.grading_periods FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can insert grading periods"
  ON public.grading_periods FOR INSERT TO authenticated
  WITH CHECK (
    (tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can update grading periods"
  ON public.grading_periods FOR UPDATE TO authenticated
  USING (
    (tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can delete grading periods"
  ON public.grading_periods FOR DELETE TO authenticated
  USING (
    (tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
    OR (SELECT public.is_platform_admin())
  );

-- Only approved administrators may insert audit rows directly. Server-side
-- service-role operations continue to write through the service-role client.
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant members can insert own audit events" ON public.audit_logs;
CREATE POLICY "Tenant admins can insert audit logs"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = audit_logs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  );

-- Tenant administrators must not gain cross-tenant profile visibility.
-- The old SELECT policy OR-ed is_current_user_admin() without a tenant check.
DROP POLICY IF EXISTS "Users can view profiles in their own tenant" ON public.profiles;
CREATE POLICY "Users can view profiles in their own tenant"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    OR id = (SELECT auth.uid())
    OR (SELECT public.is_platform_admin())
  );

-- Audit records are administrator-only; teachers must not read other
-- staff activity, IP metadata, or administrative event details.
DROP POLICY IF EXISTS "Tenant isolation for audit_logs" ON public.audit_logs;
CREATE POLICY "Tenant admins can read audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = audit_logs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  );

-- Defense in depth for SECURITY DEFINER grading-period RPCs. The caller's
-- JWT identity is retained inside those functions, so non-admin calls fail.
CREATE OR REPLACE FUNCTION public.guard_grading_period_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_tenant uuid;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  target_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.status = 'approved'
      AND p.archived_at IS NULL
      AND (
        (p.role = 'admin' AND p.tenant_id = target_tenant)
        OR p.is_platform_admin = true
      )
  ) THEN
    RAISE EXCEPTION 'Only an approved school administrator can modify grading periods.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_grading_period_writes ON public.grading_periods;
CREATE TRIGGER trg_guard_grading_period_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.grading_periods
  FOR EACH ROW EXECUTE FUNCTION public.guard_grading_period_writes();

-- Enforce AI generation quotas inside the enqueue transaction. Route-level
-- preflight checks improve UX, but only this locked database check prevents
-- parallel requests from racing past per-user and per-school limits.
CREATE OR REPLACE FUNCTION public.enqueue_groq_exam_generation_job(
  p_tenant_id uuid,
  p_tos_id uuid,
  p_created_by uuid,
  p_payload jsonb,
  p_job_kind text
)
RETURNS TABLE(job_id uuid, created_at timestamptz, status text, created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  existing public.exam_generation_jobs;
  created_job public.exam_generation_jobs;
  hourly_limit integer;
  daily_limit integer;
  hourly_count integer;
  daily_count integer;
BEGIN
  IF p_job_kind NOT IN ('full', 'repair') THEN
    RAISE EXCEPTION 'Invalid exam job kind';
  END IF;

  -- Serialize quota accounting per user and per tenant. A retry for the same
  -- TOS returns the already-active job before consuming another quota slot.
  PERFORM pg_advisory_xact_lock(hashtextextended('exam-job-user:' || p_created_by::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('exam-job-tenant:' || p_tenant_id::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_created_by
      AND p.tenant_id = p_tenant_id
      AND p.status = 'approved'
      AND p.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'The requesting user is not an active member of this school.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.tos_documents
  WHERE id = p_tos_id AND tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOS was not found in this school';
  END IF;

  SELECT j.* INTO existing
  FROM public.exam_generation_jobs j
  WHERE j.tos_id = p_tos_id
    AND j.parent_job_id IS NULL
    AND j.provider = 'groq_api'
    AND j.status IN ('queued', 'running', 'needs_attention')
  ORDER BY j.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT existing.id, existing.created_at, existing.status, false;
    RETURN;
  END IF;

  SELECT
    GREATEST(1, COALESCE(t.ai_hourly_user_limit, 5)),
    GREATEST(1, COALESCE(t.ai_daily_school_limit, 100))
  INTO hourly_limit, daily_limit
  FROM public.tenants t
  WHERE t.id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'School was not found';
  END IF;

  SELECT count(*)::integer INTO hourly_count
  FROM public.exam_generation_jobs j
  WHERE j.created_by = p_created_by
    AND j.status <> 'cancelled'
    AND (j.status <> 'failed' OR j.attempts > 0)
    AND j.created_at >= now() - interval '1 hour';

  IF hourly_count >= hourly_limit THEN
    RAISE EXCEPTION 'EXAM_HOURLY_LIMIT_REACHED';
  END IF;

  SELECT count(*)::integer INTO daily_count
  FROM public.exam_generation_jobs j
  WHERE j.tenant_id = p_tenant_id
    AND j.status <> 'cancelled'
    AND (j.status <> 'failed' OR j.attempts > 0)
    AND j.created_at >= now() - interval '24 hours';

  IF daily_count >= daily_limit THEN
    RAISE EXCEPTION 'EXAM_DAILY_LIMIT_REACHED';
  END IF;

  INSERT INTO public.exam_generation_jobs(tenant_id, tos_id, created_by, payload, provider, job_kind)
  VALUES (p_tenant_id, p_tos_id, p_created_by, p_payload, 'groq_api', p_job_kind)
  RETURNING * INTO created_job;

  RETURN QUERY SELECT created_job.id, created_job.created_at, created_job.status, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.enqueue_groq_exam_generation_job(uuid, uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_groq_exam_generation_job(uuid, uuid, uuid, jsonb, text) TO service_role;

-- Support the quota and lease scans without repeatedly scanning the full job
-- history as the school grows.
CREATE INDEX IF NOT EXISTS idx_exam_jobs_user_quota_window
  ON public.exam_generation_jobs (created_by, created_at DESC)
  WHERE status <> 'cancelled' AND (status <> 'failed' OR attempts > 0);

CREATE INDEX IF NOT EXISTS idx_exam_jobs_tenant_quota_window
  ON public.exam_generation_jobs (tenant_id, created_at DESC)
  WHERE status <> 'cancelled' AND (status <> 'failed' OR attempts > 0);

CREATE INDEX IF NOT EXISTS idx_exam_jobs_tenant_status
  ON public.exam_generation_jobs (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exam_jobs_running_lease
  ON public.exam_generation_jobs (provider, lease_expires_at, created_at)
  WHERE status = 'running';

-- Full (non-partial) foreign-key indexes also support cascades and joins for
-- every job row, including cancelled and failed history.
CREATE INDEX IF NOT EXISTS idx_exam_generation_jobs_created_by
  ON public.exam_generation_jobs (created_by);
CREATE INDEX IF NOT EXISTS idx_exam_generation_jobs_tenant_id
  ON public.exam_generation_jobs (tenant_id);
