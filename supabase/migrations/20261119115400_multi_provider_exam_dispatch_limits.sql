-- Bound hosted exam generation concurrency and prevent one school from
-- occupying every worker slot. Advisory locking makes the active-job count
-- and claim decision atomic across concurrent Next.js invocations.

create or replace function public.claim_groq_exam_job(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 75
)
returns setof public.exam_generation_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target public.exam_generation_jobs;
  global_active integer := 0;
  tenant_active integer := 0;
begin
  if p_worker_id is null or length(trim(p_worker_id)) = 0 then
    raise exception 'A worker identifier is required';
  end if;

  -- Serialize only the short claim transaction, never the model request.
  perform pg_advisory_xact_lock(91020261119);

  select * into target
  from public.exam_generation_jobs
  where id = p_job_id
    and provider = 'groq_api'
    and (
      status in ('queued', 'needs_attention')
      or (status = 'running' and lease_expires_at is not null and lease_expires_at <= now())
      or (status = 'running' and lease_expires_at is null)
    )
  for update skip locked;

  if not found then
    return;
  end if;

  select count(*)::integer into global_active
  from public.exam_generation_jobs
  where provider = 'groq_api'
    and status = 'running'
    and lease_expires_at > now()
    and id <> target.id;

  if global_active >= 4 then
    return;
  end if;

  select count(*)::integer into tenant_active
  from public.exam_generation_jobs
  where provider = 'groq_api'
    and tenant_id = target.tenant_id
    and status = 'running'
    and lease_expires_at > now()
    and id <> target.id;

  if tenant_active >= 2 then
    return;
  end if;

  if target.attempts >= target.max_attempts then
    update public.exam_generation_jobs
    set status = 'failed',
        error = 'The hosted exam worker repeatedly stopped before completing this exam. Retry generation; the existing exam was kept.',
        finished_at = now(),
        updated_at = now(),
        payload = '{}'::jsonb,
        claimed_by = null,
        lease_expires_at = null
    where id = target.id;

    if target.parent_job_id is not null then
      update public.exam_generation_jobs
      set status = 'failed',
          error = 'An exam repair job repeatedly stopped before completing this exam. Retry generation; the existing exam was kept.',
          finished_at = now(),
          updated_at = now(),
          payload = '{}'::jsonb,
          claimed_by = null,
          lease_expires_at = null
      where id = target.parent_job_id
        and status in ('queued', 'running', 'needs_attention');
    end if;
    return;
  end if;

  update public.exam_generation_jobs
  set status = 'running',
      claimed_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 75), 120))),
      attempts = attempts + 1,
      updated_at = now()
  where id = target.id
  returning * into target;

  return next target;
end;
$function$;

revoke all on function public.claim_groq_exam_job(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_groq_exam_job(uuid, text, integer) to service_role;
