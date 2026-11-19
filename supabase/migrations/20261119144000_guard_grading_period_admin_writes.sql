-- Grading periods are school-wide academic configuration. Teachers may read
-- them, but only approved tenant administrators (or platform admins) may write.
-- The database RPCs are SECURITY DEFINER, so RLS alone is not sufficient:
-- this trigger also guards writes initiated by those RPCs.

DROP POLICY IF EXISTS "Users can manage grading periods in their tenant" ON public.grading_periods;
DROP POLICY IF EXISTS "Users can view grading periods in their tenant" ON public.grading_periods;

CREATE POLICY "Approved tenant members can view grading periods"
  ON public.grading_periods FOR SELECT TO authenticated
  USING (
    tenant_id = (SELECT public.get_current_tenant_id())
    OR (SELECT public.is_platform_admin())
  );

CREATE POLICY "Tenant admins can manage grading periods"
  ON public.grading_periods FOR ALL TO authenticated
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

CREATE OR REPLACE FUNCTION public.guard_grading_period_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_tenant uuid;
  caller_is_admin boolean := false;
BEGIN
  -- Trusted server-side operations and migrations remain supported.
  IF auth.role() = 'service_role' OR auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  target_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;

  IF public.is_platform_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.tenant_id = target_tenant
      AND p.role = 'admin'
      AND p.status = 'approved'
      AND p.archived_at IS NULL
  ) INTO caller_is_admin;

  IF NOT caller_is_admin THEN
    RAISE EXCEPTION 'Only an approved school administrator can change grading periods.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_grading_period_writes() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_grading_period_writes ON public.grading_periods;
CREATE TRIGGER trg_guard_grading_period_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.grading_periods
  FOR EACH ROW EXECUTE FUNCTION public.guard_grading_period_writes();
