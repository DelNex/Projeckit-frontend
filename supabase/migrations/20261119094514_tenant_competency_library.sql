-- Shared competency library scoped to each school tenant.
create table if not exists public.tenant_competencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  description text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists tenant_competencies_tenant_code_description_uidx
  on public.tenant_competencies (tenant_id, code, description);

create index if not exists tenant_competencies_tenant_description_idx
  on public.tenant_competencies (tenant_id, description);

alter table public.tenant_competencies enable row level security;

comment on table public.tenant_competencies is
  'Reusable learning competencies shared by approved teachers within one school tenant. Access is mediated by authenticated server routes.';
