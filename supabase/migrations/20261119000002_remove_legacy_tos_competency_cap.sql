-- Align the live database with the hosted Groq exam-generation worker.
-- Preserve the legacy browser helper only for jobs explicitly assigned to it.

create or replace function public.check_tos_competencies_count()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  row_count integer;
  norm_status text;
begin
  norm_status := lower(coalesce(trim(new.status), 'draft'));
  new.status := norm_status;

  if new.rows is not null then
    if jsonb_typeof(new.rows) <> 'array' then
      raise exception 'TOS competencies must be stored as a JSON array.';
    end if;

    row_count := jsonb_array_length(new.rows);
    if row_count > 200 then
      raise exception 'A TOS can have up to 200 learning competencies. Current count: %', row_count;
    end if;

    if row_count < 1 and norm_status not in ('draft', 'pending') then
      raise exception 'A TOS must have at least 1 learning competency.';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.enqueue_exam_generation_job(
  p_tenant_id uuid,
  p_tos_id uuid,
  p_created_by uuid,
  p_payload jsonb,
  p_job_kind text
)
returns table(job_id uuid, created_at timestamptz, status text, created boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  existing public.exam_generation_jobs;
  created_job public.exam_generation_jobs;
begin
  if p_job_kind not in ('full', 'repair') then
    raise exception 'Invalid exam job kind';
  end if;

  perform 1
  from public.tos_documents
  where id = p_tos_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'TOS was not found in this school';
  end if;

  select j.* into existing
  from public.exam_generation_jobs j
  where j.tos_id = p_tos_id
    and j.parent_job_id is null
    and j.status in ('queued', 'running', 'needs_attention')
  order by j.created_at desc
  limit 1;

  if found then
    return query select existing.id, existing.created_at, existing.status, false;
    return;
  end if;

  insert into public.exam_generation_jobs(tenant_id, tos_id, created_by, payload, provider, job_kind)
  values (p_tenant_id, p_tos_id, p_created_by, p_payload, 'groq_api', p_job_kind)
  returning * into created_job;

  return query select created_job.id, created_job.created_at, created_job.status, true;
end;
$function$;

create or replace function public.claim_exam_job(p_helper_id text, p_lease_seconds integer)
returns setof public.exam_generation_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  claimed public.exam_generation_jobs;
begin
  with expired as (
    update public.exam_generation_jobs
    set status = 'failed',
        error = 'The Gemini helper stopped responding.',
        finished_at = now(),
        updated_at = now()
    where provider = 'helper_queue'
      and status = 'running'
      and lease_expires_at <= now()
      and attempts >= max_attempts
    returning id, tenant_id, created_by, parent_job_id
  ),
  failed_roots as (
    update public.exam_generation_jobs root
    set status = 'failed',
        error = 'The Gemini helper stopped responding.',
        finished_at = now(),
        updated_at = now()
    from expired
    where expired.parent_job_id = root.id
      and root.provider = 'helper_queue'
      and root.status = 'running'
    returning root.id, root.tenant_id, root.created_by
  ),
  audit_rows as (
    select id, tenant_id, created_by, 'failed'::text as status from expired
    union all
    select id, tenant_id, created_by, 'failed'::text as status from failed_roots
  )
  insert into public.audit_logs(tenant_id, user_id, action, details, created_at)
  select tenant_id, created_by, 'AI_EXAM_GENERATION',
         jsonb_build_object('job_id', id, 'status', status, 'reason', 'The Gemini helper stopped responding.'),
         now()
  from audit_rows;

  with chosen as (
    select j.id
    from public.exam_generation_jobs j
    where j.provider = 'helper_queue'
      and (
        j.status = 'queued'
        or (j.status = 'running' and j.lease_expires_at <= now() and j.attempts < j.max_attempts)
      )
    order by (
      select count(*)
      from public.exam_generation_jobs active
      where active.tenant_id = j.tenant_id
        and active.provider = 'helper_queue'
        and active.status = 'running'
        and active.lease_expires_at > now()
    ) asc, j.created_at asc
    limit 1
    for update of j skip locked
  )
  update public.exam_generation_jobs j
  set status = 'running',
      claimed_by = p_helper_id,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
      attempts = j.attempts + 1,
      updated_at = now()
  from chosen
  where j.id = chosen.id
  returning j.* into claimed;

  if claimed.id is not null then
    return next claimed;
  end if;
  return;
end;
$function$;

create or replace function public.expire_unserviceable_exam_jobs()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  affected integer := 0;
begin
  with stale as (
    update public.exam_generation_jobs j
    set status = 'failed',
        error = 'The Gemini helper went offline before this job could finish.',
        finished_at = now(),
        updated_at = now(),
        payload = '{}'::jsonb,
        claimed_by = null,
        lease_expires_at = null
    where j.provider = 'helper_queue'
      and j.status = 'queued'
      and j.created_at < now() - interval '60 seconds'
      and not exists (
        select 1
        from public.helper_status h
        where h.state in ('idle', 'busy')
          and h.last_seen_at > now() - interval '45 seconds'
      )
    returning j.id, j.tenant_id, j.created_by, j.parent_job_id
  ),
  stale_running as (
    update public.exam_generation_jobs j
    set status = 'failed',
        error = 'The Gemini helper stopped responding. Retry after the helper is available.',
        finished_at = now(),
        updated_at = now(),
        payload = '{}'::jsonb,
        claimed_by = null,
        lease_expires_at = null
    where j.provider = 'helper_queue'
      and j.status = 'running'
      and j.lease_expires_at <= now()
      and not exists (
        select 1
        from public.helper_status h
        where h.helper_id = j.claimed_by
          and h.state in ('idle', 'busy')
          and h.last_seen_at > now() - interval '45 seconds'
      )
    returning j.id, j.tenant_id, j.created_by, j.parent_job_id
  ),
  failed as (
    select * from stale
    union all
    select * from stale_running
  ),
  failed_roots as (
    update public.exam_generation_jobs root
    set status = 'failed',
        error = 'The Gemini helper stopped responding. Retry after the helper is available.',
        finished_at = now(),
        updated_at = now(),
        payload = '{}'::jsonb,
        claimed_by = null,
        lease_expires_at = null
    from failed f
    where f.parent_job_id = root.id
      and root.provider = 'helper_queue'
      and root.status in ('queued', 'running', 'needs_attention')
      and not exists (
        select 1 from failed root_failure where root_failure.id = root.id
      )
    returning root.id, root.tenant_id, root.created_by
  ),
  audit_rows as (
    select id, tenant_id, created_by from failed
    union all
    select id, tenant_id, created_by from failed_roots
  )
  insert into public.audit_logs(tenant_id, user_id, action, details, created_at)
  select tenant_id, created_by, 'AI_EXAM_GENERATION',
         jsonb_build_object('job_id', id, 'status', 'failed', 'reason', 'Gemini helper unavailable'),
         now()
  from audit_rows;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;
