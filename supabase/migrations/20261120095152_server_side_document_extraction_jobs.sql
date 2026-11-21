-- Durable server-side lesson extraction queue.
-- Original documents and extracted results remain in the existing private lesson-uploads bucket.
create table if not exists public.document_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  source_path text not null,
  source_name text not null,
  source_mime text not null,
  source_bytes bigint not null check (source_bytes > 0 and source_bytes <= 20971520),
  result_path text,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','failed','cancelled')),
  progress jsonb not null default '{"stage":"queued","percent":0,"label":"Waiting for document processing"}'::jsonb,
  error_code text,
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5),
  claimed_by text,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint document_extraction_source_path_unique unique(source_path)
);

create index if not exists document_extraction_jobs_queue_idx
  on public.document_extraction_jobs(status, created_at)
  where status in ('queued','processing');
create index if not exists document_extraction_jobs_owner_idx
  on public.document_extraction_jobs(created_by, created_at desc);

alter table public.document_extraction_jobs enable row level security;
revoke all on public.document_extraction_jobs from anon, authenticated;
grant all on public.document_extraction_jobs to service_role;

create or replace function public.claim_document_extraction_job(p_worker_id text, p_lease_seconds integer default 180)
returns setof public.document_extraction_jobs
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.document_extraction_jobs
  set status = 'failed',
      error_code = 'WORKER_TIMEOUT',
      error_message = 'The document processor stopped before finishing. Please upload the file again.',
      progress = jsonb_build_object('stage','failed','percent',0,'label','Processing stopped. Please upload the file again.'),
      claimed_by = null,
      lease_expires_at = null,
      finished_at = now(),
      updated_at = now()
  where status = 'processing'
    and lease_expires_at < now()
    and attempts >= max_attempts;

  return query
  with candidate as (
    select id
    from public.document_extraction_jobs
    where status = 'queued'
       or (status = 'processing' and lease_expires_at < now() and attempts < max_attempts)
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.document_extraction_jobs j
  set status = 'processing',
      claimed_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(p_lease_seconds, 600))),
      attempts = j.attempts + 1,
      updated_at = now(),
      progress = jsonb_build_object('stage','starting','percent',1,'label','Preparing your lesson document')
  from candidate
  where j.id = candidate.id
  returning j.*;
end;
$$;

revoke all on function public.claim_document_extraction_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_document_extraction_job(text, integer) to service_role;
