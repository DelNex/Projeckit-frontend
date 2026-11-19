# Production readiness notes

This document describes the production-oriented changes in the isolated
`perf/production-api-lazy-loading` branch. These changes are not active on the
production site until the branch is reviewed, its database migration is applied,
and a deployment is promoted.

## Local document processing and OCR

- Original PDF, DOCX, PPTX, TXT, and Markdown files are read in the browser.
  Original files are not uploaded to Supabase Storage.
- PDF/DOCX/PPTX extraction runs in a Web Worker. Scanned/image-only PDF pages
  are rendered locally and passed through the locally bundled Tesseract WASM
  runtime; English and Filipino language data are bundled under `public/ocr`. English is the faster default; teachers can select English + Filipino for Tagalog-heavy scans.
- Only extracted lesson text is sent to the authenticated exam-generation API.
- The default local file ceiling is 100 MB. Devices reporting sufficient memory
  and browser storage may be allowed up to 500 MB. This is a device-side limit,
  not a Supabase upload limit.
- Extracted lesson text is capped at 900,000 characters. Larger documents must
  be split into chapters instead of silently truncating source content.
- Browsers without Worker or OffscreenCanvas support receive a clear
  compatibility error; scanned PDFs are not silently sent to a third-party OCR
  service.

## AI providers and queue processing

- Groq remains the only configured provider in the current Netlify environment.
- Gemini, OpenRouter, and Cloudflare Workers AI are supported as optional
  server-side fallback providers. Their credentials must be added to Netlify
  as server-only environment variables; never use `NEXT_PUBLIC_*` for API keys.
- The scheduled Netlify function dispatches queued work every minute, including
  when all teacher browsers are closed. It is scheduled processing, not a
  permanently running process.
- Each scheduler tick dispatches up to four worker invocations. Database claims
  enforce a global concurrency ceiling and a per-school ceiling.
- Enqueue operations are idempotent for an active TOS job. The new migration
  also serializes per-user and per-school quota accounting so concurrent clicks
  cannot race past hourly/daily limits.

## Administrator diagnostics

The administrator audit page combines audit history, persisted system errors,
and failed/attention-required exam jobs. Events include severity, source,
route, HTTP status, error code, timestamp, and a trace identifier. API failures
are associated with the authenticated user's school when request context is
available. Unhandled Next.js server errors are captured through
`src/instrumentation.ts`.

This is application-level observability. Netlify edge/function logs and
Supabase database logs remain available in their respective provider consoles;
they are not automatically copied wholesale into the application database.

## Access control and production-only behavior

- School-wide academic settings, grading-period changes, section/subject
  configuration writes, and audit-log reads are restricted to approved
  administrators by the migration.
- Teacher navigation no longer exposes School Settings.
- OMR/OCR validation pages and their fixture endpoint are available in local
  development and in GitHub Actions only. Production visitors do not receive
  these test pages or fixtures.
- The frontend is pinned to Node 22 with `.nvmrc` and `package.json`.

## Release requirements

Before promoting this branch:

1. Review and apply the pending migrations in timestamp order, including
   `20261119133200_restrict_school_configuration_writes_to_admins.sql`,
   `20261119140500_index_application_foreign_keys.sql`, and
   `20261119150000_atomic_exam_generation_quotas.sql`, to the target Supabase project.
2. Add authorized Gemini, OpenRouter, and Cloudflare credentials to Netlify if
   those fallback providers are required. Without them, Groq remains the only
   available provider.
3. `CRON_SECRET` is already configured as a masked secret for the production
   Netlify Functions/Runtime context. Keep it out of all `NEXT_PUBLIC_*` variables.
4. Deploy a preview and verify authenticated school-admin settings, system
   logs, local OCR, exam queue recovery, and the scheduled worker.
5. Promote to production only after the preview checks pass.

The production branch and live database are not changed by this branch's CI
runs. A green GitHub build does not by itself prove live authenticated
connectivity, provider failover, or scheduled execution; those require a
deployed preview with real credentials.

## Supabase advisor review

The live advisor reported these items during the release audit:

- The previous profile SELECT policy called `is_current_user_admin()` without
  a tenant condition. Because that helper returns true for any approved school
  administrator, it could expose profiles across schools. The migration
  replaces it with same-tenant access plus explicit platform-admin access.
- Tenant and administrator helper functions previously ignored
  `archived_at`. The migration makes archived accounts lose tenant and
  administrator helper privileges.
- Grading-period SECURITY DEFINER RPCs remain callable by authenticated users
  because the existing UI uses them. The migration adds an administrator-only
  database trigger as a second enforcement layer; client-side checks alone are
  not trusted.
- `tenant_competencies` has RLS enabled without client policies intentionally:
  its data is accessed through the authenticated, tenant-scoped
  `/api/competencies` route using the server service client.
- Supabase reports leaked-password protection as disabled. This setting must
  be enabled in Supabase Auth settings; the available project connector does
  not expose that Auth setting for safe modification here.
- The advisor flags 19 unindexed foreign keys. The branch adds one index for each
  flagged foreign key to avoid future join and referential-action scans as data
  grows. The exam-job table is the immediate hot path: it has accumulated over
  124,000 sequential scans despite a small current row estimate, so additional
  quota-window, tenant-status, and worker-lease indexes are included.
