-- Prevent authenticated users without an approved tenant from passing
-- SECURITY DEFINER tenant checks through SQL NULL comparison semantics.
-- Platform admins remain allowed to operate across tenant boundaries.

CREATE OR REPLACE FUNCTION public.get_grading_period_usage(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    target_period RECORD;
    caller_tenant UUID;
    ass_count INT := 0;
    tos_count INT := 0;
BEGIN
    caller_tenant := public.get_current_tenant_id();

    IF caller_tenant IS NULL AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Your account is not linked to an approved school.';
    END IF;

    SELECT * INTO target_period
    FROM public.grading_periods
    WHERE id = p_period_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grading period not found.';
    END IF;

    IF target_period.tenant_id <> caller_tenant AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: Grading period belongs to a different school.';
    END IF;

    SELECT count(*) INTO ass_count
    FROM public.assessments
    WHERE tenant_id = target_period.tenant_id AND term = target_period.name;

    SELECT count(*) INTO tos_count
    FROM public.tos_documents
    WHERE tenant_id = target_period.tenant_id AND term = target_period.name;

    RETURN jsonb_build_object(
        'period_id', target_period.id,
        'period_name', target_period.name,
        'is_current', target_period.is_current,
        'is_archived', target_period.is_archived,
        'assessment_count', ass_count,
        'tos_count', tos_count,
        'total_count', ass_count + tos_count
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_grading_period(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    target_period RECORD;
    caller_tenant UUID;
    active_count INT;
    next_pos INT;
    clean_code TEXT;
BEGIN
    caller_tenant := public.get_current_tenant_id();

    IF caller_tenant IS NULL AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Your account is not linked to an approved school.';
    END IF;

    SELECT * INTO target_period
    FROM public.grading_periods
    WHERE id = p_period_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grading period not found.';
    END IF;

    IF target_period.tenant_id <> caller_tenant AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: Grading period belongs to a different school.';
    END IF;

    SELECT count(*) INTO active_count
    FROM public.grading_periods
    WHERE tenant_id = target_period.tenant_id AND is_archived = false;

    IF active_count >= 4 THEN
        RAISE EXCEPTION 'Maximum of 4 active terms reached. Delete or archive one before restoring.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.grading_periods
        WHERE tenant_id = target_period.tenant_id
          AND is_archived = false
          AND lower(trim(name)) = lower(trim(target_period.name))
    ) THEN
        RAISE EXCEPTION 'An active term with the name "%" already exists.', target_period.name;
    END IF;

    SELECT COALESCE(MAX(position), 0) + 1 INTO next_pos
    FROM public.grading_periods
    WHERE tenant_id = target_period.tenant_id AND is_archived = false;

    clean_code := regexp_replace(target_period.code, '_arch_.*$', '');
    IF EXISTS (
        SELECT 1 FROM public.grading_periods
        WHERE tenant_id = target_period.tenant_id AND code = clean_code AND id <> target_period.id
    ) THEN
        clean_code := clean_code || '_' || next_pos::text;
    END IF;

    UPDATE public.grading_periods
    SET is_archived = false,
        is_current = false,
        position = next_pos,
        code = clean_code
    WHERE id = p_period_id;

    PERFORM public.log_period_audit(
        target_period.tenant_id,
        'grading_period.restore',
        jsonb_build_object(
            'period_id', p_period_id,
            'name', target_period.name,
            'position', next_pos
        )
    );

    RETURN jsonb_build_object(
        'id', p_period_id,
        'name', target_period.name,
        'code', clean_code,
        'position', next_pos
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_current_grading_period(p_period_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    target_period RECORD;
    caller_tenant UUID;
BEGIN
    caller_tenant := public.get_current_tenant_id();

    IF caller_tenant IS NULL AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Your account is not linked to an approved school.';
    END IF;

    SELECT * INTO target_period
    FROM public.grading_periods
    WHERE id = p_period_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Grading period not found.';
    END IF;

    IF target_period.tenant_id <> caller_tenant AND NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Access denied: Grading period belongs to a different school.';
    END IF;

    IF target_period.is_archived THEN
        RAISE EXCEPTION 'Cannot set an archived term as current.';
    END IF;

    UPDATE public.grading_periods
    SET is_current = false
    WHERE tenant_id = target_period.tenant_id AND is_current = true;

    UPDATE public.grading_periods
    SET is_current = true
    WHERE id = p_period_id;

    UPDATE public.academic_configs
    SET term = target_period.name,
        updated_at = clock_timestamp()
    WHERE tenant_id = target_period.tenant_id;

    PERFORM public.log_period_audit(
        target_period.tenant_id,
        'grading_period.set_current',
        jsonb_build_object(
            'period_id', p_period_id,
            'period_name', target_period.name
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'current_term', target_period.name
    );
END;
$function$;
