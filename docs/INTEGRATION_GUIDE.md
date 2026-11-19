# Project KIT integration guide

This note records how the running application is wired today and the boundaries that should be kept during future work.

## System boundaries

- **Next.js website:** pages, user-facing workflows, file exports, and server API routes.
- **Supabase:** sign-in, school and learner data, scan records, answer keys, saved assessments, storage, and row-level access rules.
- **NestJS AI service:** the authenticated Copilot chat, streaming, status information, and lesson-material indexing endpoints. It is not the API for assessments or student records.
- **Hosted exam worker:** asynchronous exam generation jobs claimed from the durable Supabase queue and executed on the Next.js server.

Use browser Supabase clients only for signed-in user work covered by RLS. `SUPABASE_SERVICE_ROLE_KEY` must be the actual privileged key for the same Supabase project; it is not interchangeable with `GROQ_API_KEY` or any other AI-provider credential. Keep it in server code only and derive each request's school/tenant from the validated profile; never accept a tenant identifier as authority from a browser form. Next.js server routes are the boundary for privileged reports, administration, file generation, and background job transitions.

The AI Copilot uses `/api/backend/ai/*`, a same-origin Next.js proxy. The proxy validates the Supabase session, rejects cross-site writes, forwards only the bearer token to the Nest service, and allows only the four AI endpoints that the website needs. Configure `BACKEND_API_BASE_URL` in the web server environment. Production requires a valid HTTPS URL; it never falls back to localhost or a browser-visible `NEXT_PUBLIC_API_BASE_URL`. Production also requires `NEXT_PUBLIC_APP_URL` to be a valid HTTPS origin.

## Main school workflow

1. Create a Table of Specifications (TOS), choose the sections that share it, and enter competencies and taught days. Review its item allocation before saving.
2. Create or generate the assessment linked to that TOS. Review the questions and save the exam draft.
3. Configure the answer key for every item. Keep the key tied to the saved assessment so scan scoring and reports use the same answers.
4. In the assessment scanner, identify the learner from the sheet barcode/roll number, scan the answer area, and review uncertain or conflicting marks. Only confirmed sheets should be treated as scored results.
5. Review Item Analysis, including counts for each choice and the saved answer key. Corrected scan records should remain distinguishable from the machine's original interpretation.
6. Open **Print & Reports**, select a section, and use the available TOS, test-result, most/least learned, item-analysis, question-paper, or OMR-sheet actions. Question-paper options include paper size, one/two-column layout, and an optional teacher copy.

## Scoring and evidence rules

- A saved response should be counted once per learner and assessment. Re-scans should use the newest confirmed record.
- Sheets marked `VERIFICATION_REQUIRED` are pending teacher review and must not silently enter academic summaries. Confirming a sheet moves it into the scored set.
- An erased or multiple mark is an invalid/wrong item response under the current OMR policy. It must remain reviewable as a machine-detected state; it is not a correct answer.
- The test-results export uses the documented formulas: cases are learners with at least one saved response; mean is total learner score divided by cases; PL is mean divided by item count times 100; MPS is PL times 0.98 plus 2. The average row is the simple average of the section rows.
- Dashboard analytics has additional cross-assessment views. These should be compared using the same roster, assessment set, and scoring policy before being reconciled to a term export.

## Release and support checks

Before a production release, run the frontend test suite, TypeScript check, production build, backend build and tests. Confirm Supabase migrations are applied; verify a teacher can create/link a TOS, generate and save an exam, save a full key, scan one learner, review a low-confidence scan, and export each report from Print & Reports. Repeat the access checks with a second school to verify tenant separation. Try AI chat, streaming, and PDF/DOCX upload with the AI service online, then verify the website shows a retryable error when it is unavailable.

Record the commit and deployment, database migration status, AI service URL/health, and a small OMR validation sample for every release. Validate clean marks, faint marks, erased marks, multiple marks, rotation/cropping, glare, and low-resolution images. Keep the machine reading, confidence/reason, teacher correction, and final saved response separately auditable. Do not promise perfect camera recognition; ambiguous marks require teacher review.

## Exam AI provider routing and large lessons

Exam generation uses the existing durable `exam_generation_jobs` queue. The database claim function provides per-job row locking and leases; the API also applies per-user hourly and per-school daily limits. Provider failover does not create a second queue. A shared dispatcher now starts the oldest queued job from the least-loaded school. The database serializes claims and caps hosted exam work at four concurrent jobs globally and two per school. Enqueue requests can start work immediately, while status polling is read-mostly and no longer runs queue cleanup on every request. A Netlify Scheduled Function is included to dispatch up to four durable queue workers every minute, including when all teacher browsers are closed. It calls the authenticated `/api/internal/exam-worker` endpoint and uses the server-side `CRON_SECRET` environment variable. Netlify also needs `EXAM_SCHEDULER_ENABLED=true` in the Production deploy context only; the flag is deliberately absent from Deploy Preview and branch contexts because those deployments share the configured Supabase project. The scheduler secret and enable flag are configured in Netlify, but environment changes are frozen into a deploy, so a new published deploy is required before the scheduler can run. Netlify Scheduled Functions only run on published deploys; after release, verify the function shows a Scheduled badge and check its invocation logs.

The server-side provider router supports these adapters when credentials are configured:

- Groq: `GROQ_API_KEY`, optional `GROQ_MODEL`
- OpenRouter: `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`
- Gemini: `GEMINI_API_KEY`, optional `GEMINI_MODEL`
- Cloudflare Workers AI: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, optional `CLOUDFLARE_MODEL`

Set `AI_PROVIDER_ORDER=groq,openrouter,gemini,cloudflare` to choose the failover order. Only providers with server-side credentials are eligible. Never put these keys in `NEXT_PUBLIC_*` variables or browser code. The router skips a provider during its in-process rate-limit cooldown and falls back on retryable provider errors; it does not create accounts, rotate identities, or bypass quotas. Cooldowns are process-local, so they are not a substitute for a shared global rate-limit ledger. Review each provider's current pricing, rate limits, and data-use terms before enabling it. Do not send student records or other personal information to a provider unless the school's data-processing rules permit it.

Local extraction now accepts up to 900,000 readable characters per generation job, subject to the existing 1.5 MB serialized queue-payload limit. Text is stored as bounded lesson sections in the durable job. For each question batch, the worker ranks sections against the requested TOS competency and sends at most eight relevant sections / 120,000 characters to the model. If no section matches, it samples across the document instead of repeatedly sending only the first pages. This is lexical retrieval, not semantic search; teachers must still review generated questions against the source.

## Known operational constraints

- The AI service needs to be reachable from the Next.js server and requires the same Supabase signing configuration to validate user tokens.
- Scanned/image-only PDFs are now routed through local Tesseract.js OCR in the browser worker. The worker, WASM core variants, and English traineddata are copied from pinned npm dependencies into same-origin `/ocr/` assets during build; no third-party OCR script or remote language-data CDN is loaded at runtime. OCR currently bundles English and Filipino language data. Validate the scanned-PDF fixture and real phone scans in a browser before claiming full OCR accuracy.
- OpenCV quality depends on camera and printing conditions. Calibration and a recorded validation dataset remain release tasks.
- Retain separate, current lockfile-based SBOMs and review dependency audit findings before production deployment.


## School administration access

School-wide academic configuration (school year, grading periods, sections, subjects, and audit history) is restricted to approved school administrators. Teachers retain read access needed by their teaching workflows, but cannot mutate school-wide configuration or read administrative audit logs. The database migration `20261119133200_restrict_school_configuration_writes_to_admins.sql` must be applied before promoting this release; it replaces the old tenant-wide write policies and adds a database trigger as defense in depth.

## Production environment sanity check

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` identify the Supabase project used by browser/session clients.
- `SUPABASE_SERVICE_ROLE_KEY` must be that same project's privileged server key. If Supabase gateway logs report `UNAUTHORIZED_INVALID_API_KEY` with a `gsk_` prefix, the Groq key has been placed in the Supabase variable by mistake; replace it with the correct Supabase server key.
- `GROQ_API_KEY` is only for Groq model requests. It must never be copied into `SUPABASE_SERVICE_ROLE_KEY`.
- `BACKEND_API_BASE_URL` must point to the NestJS backend over HTTPS in production. `NEXT_PUBLIC_APP_URL` must be the public HTTPS site origin.
- The OMR camera, print, TOS, student-import and DOCX-export modules are loaded on demand. Exam-status polling pauses in hidden tabs and backs off while no generation is active.
