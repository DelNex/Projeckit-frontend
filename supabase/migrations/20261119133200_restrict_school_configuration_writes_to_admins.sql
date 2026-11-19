-- Restrict school-wide configuration writes to approved tenant administrators.
-- Tenant members retain read access for normal teaching workflows.

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
          AND p.tenant_id = public.academic_configs.tenant_id
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
          AND p.tenant_id = public.academic_configs.tenant_id
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
          AND p.tenant_id = public.academic_configs.tenant_id
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
          AND p.tenant_id = public.academic_configs.tenant_id
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
      WHERE c.id = public.sections.config_id
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
      WHERE c.id = public.sections.config_id
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
      WHERE c.id = public.sections.config_id
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
      WHERE c.id = public.sections.config_id
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
      WHERE c.id = public.subjects.config_id
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
      WHERE c.id = public.subjects.config_id
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
      WHERE c.id = public.subjects.config_id
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
      WHERE c.id = public.subjects.config_id
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
          AND p.tenant_id = public.grading_periods.tenant_id
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
          AND p.tenant_id = public.grading_periods.tenant_id
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
          AND p.tenant_id = public.grading_periods.tenant_id
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
          AND p.tenant_id = public.grading_periods.tenant_id
          AND p.role = 'admin'
          AND p.status = 'approved'
          AND p.archived_at IS NULL
      ))
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
      AND p.role = 'admin'
      AND p.status = 'approved'
      AND p.archived_at IS NULL
      AND (
        p.tenant_id = target_tenant
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
