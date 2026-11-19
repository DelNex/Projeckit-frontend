-- Keep legacy helper jobs and hosted Groq jobs independent. A stale legacy
-- browser-helper job must never block a new hosted Groq generation request.

drop index if exists public.idx_exam_generation_jobs_one_active_root_per_tos;

create unique index idx_exam_generation_jobs_one_active_root_per_tos
on public.exam_generation_jobs using btree (tos_id, provider)
where parent_job_id is null
  and status in ('queued', 'running', 'needs_attention');

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

  perform 1 from public.tos_documents
  where id=p_tos_id and tenant_id=p_tenant_id
  for update;
  if not found then raise exception 'TOS was not found in this school'; end if;

  select j.* into existing
  from public.exam_generation_jobs j
  where j.tos_id=p_tos_id
    and j.parent_job_id is null
    and j.provider='helper_queue'
    and j.status in ('queued','running','needs_attention')
  order by j.created_at desc
  limit 1;

  if found then
    return query select existing.id,existing.created_at,existing.status,false;
    return;
  end if;

  insert into public.exam_generation_jobs(tenant_id,tos_id,created_by,payload,provider,job_kind)
  values(p_tenant_id,p_tos_id,p_created_by,p_payload,'helper_queue',p_job_kind)
  returning * into created_job;

  return query select created_job.id,created_job.created_at,created_job.status,true;
end;
$function$;

create or replace function public.enqueue_groq_exam_generation_job(
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
  if p_job_kind not in ('full','repair') then
    raise exception 'Invalid exam job kind';
  end if;

  perform 1 from public.tos_documents
  where id=p_tos_id and tenant_id=p_tenant_id
  for update;
  if not found then raise exception 'TOS was not found in this school'; end if;

  select j.* into existing
  from public.exam_generation_jobs j
  where j.tos_id=p_tos_id
    and j.parent_job_id is null
    and j.provider='groq_api'
    and j.status in ('queued','running','needs_attention')
  order by j.created_at desc
  limit 1;

  if found then
    return query select existing.id,existing.created_at,existing.status,false;
    return;
  end if;

  insert into public.exam_generation_jobs(tenant_id,tos_id,created_by,payload,provider,job_kind)
  values(p_tenant_id,p_tos_id,p_created_by,p_payload,'groq_api',p_job_kind)
  returning * into created_job;

  return query select created_job.id,created_job.created_at,created_job.status,true;
end;
$function$;

revoke all on function public.enqueue_groq_exam_generation_job(uuid,uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.enqueue_groq_exam_generation_job(uuid,uuid,uuid,jsonb,text) to service_role;
