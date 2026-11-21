-- The competency API uses the server-only Supabase service-role client after
-- verifying the caller's approved tenant. Browser roles do not need table grants.
REVOKE ALL ON TABLE public.tenant_competencies FROM anon, authenticated;
GRANT ALL ON TABLE public.tenant_competencies TO service_role;

-- Cover the tenant foreign key for tenant deletion and scoped maintenance queries.
CREATE INDEX IF NOT EXISTS tenant_competencies_tenant_id_idx
  ON public.tenant_competencies (tenant_id);

-- OCR job records are intentionally server-only; keep their existing no-policy
-- RLS posture and service-role access intact.
