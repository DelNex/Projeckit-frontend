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

-- School-wide configuration is readable by approved tenant members but writable
-- only by approved tenant administrators (or platform administrators).
DROP POLICY IF EXISTS "Tenant isolation for academic_configs" ON public.academic_configs;
CREATE POLICY "Tenant members can read academic configs"
  ON public.academic_configs FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can insert academic configs"
  ON public.academic_configs FOR INSERT TO authenticated
  WITH CHECK (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = academic_configs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can update academic configs"
  ON public.academic_configs FOR UPDATE TO authenticated
  USING (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = academic_configs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = academic_configs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can delete academic configs"
  ON public.academic_configs FOR DELETE TO authenticated
  USING (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = academic_configs.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  );

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

DROP POLICY IF EXISTS "Users can manage grading periods in their tenant" ON public.grading_periods;
DROP POLICY IF EXISTS "Users can view grading periods in their tenant" ON public.grading_periods;
DROP POLICY IF EXISTS "Approved tenant members can view grading periods" ON public.grading_periods;
CREATE POLICY "Approved tenant members can view grading periods"
  ON public.grading_periods FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can insert grading periods"
  ON public.grading_periods FOR INSERT TO authenticated
  WITH CHECK (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can update grading periods"
  ON public.grading_periods FOR UPDATE TO authenticated
  USING (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  )
  WITH CHECK (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  );
CREATE POLICY "Tenant admins can delete grading periods"
  ON public.grading_periods FOR DELETE TO authenticated
  USING (
    (
      tenant_id = (SELECT public.get_current_tenant_id())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.tenant_id = grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      )
    )
    OR (SELECT public.is_platform_admin())
  );

-- Optimize existing tenant-scoped read policies and exclude archived accounts.
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

-- Preserve tenant members' ability to write their own activity events.
-- Reads remain administrator-only below; the service logger uses service_role.
DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant admins can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant members can insert own audit events" ON public.audit_logs;
CREATE POLICY "Tenant members can insert own audit events"
  ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = (SELECT public.get_current_tenant_id())
    AND user_id = (SELECT auth.uid())
    AND action NOT IN (
      'SYSTEM_ERROR',
      'SYSTEM_WARNING',
      'SYSTEM_INFO',
      'AI_PROVIDER_FAILURE',
      'EXAM_WORKER_FAILURE'
    )
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
  IF auth.uid() IS NULL AND COALESCE(current_setting('request.jwt.claim.role', true), '') NOT IN ('anon', 'authenticated') THEN
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

-- These helper functions are needed by authenticated RLS policies, but they
-- should not be callable by anonymous clients. The trigger function itself is
-- only invoked by PostgreSQL triggers and is not an RPC endpoint.
REVOKE ALL ON FUNCTION public.get_current_tenant_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_grading_period_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_profile_updates() FROM PUBLIC, anon, authenticated;

-- Grading-period RPCs remain available to signed-in users, but their writes
-- are checked by trg_guard_grading_period_writes before any row is changed.
REVOKE ALL ON FUNCTION public.add_grading_period(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_grading_period_preset(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_or_archive_grading_period(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_grading_period_usage(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_grading_period(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_current_grading_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_grading_period(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_grading_period_preset(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_or_archive_grading_period(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_grading_period_usage(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_grading_period(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_current_grading_period(uuid) TO authenticated, service_role;

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

