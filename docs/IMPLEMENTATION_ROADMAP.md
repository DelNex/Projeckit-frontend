# Project KIT next implementation phases

This roadmap records the requested improvements without treating unimplemented work as shipped. Work stays on `feat/projectkit-ai-omr-reports-competencies` until the user approves a merge.

## Phase 0 — Reliability and release gates

Status: implementation added; verification and scheduler activation pending.

- [x] Port Next.js `onRequestError` capture from the latest main-only instrumentation work.
- [x] Add a constant-time authenticated server-to-server exam dispatcher endpoint.
- [x] Add unit tests for cron-secret validation.
- [x] Add a Netlify deploy-preview-only `AI_DISPATCH_CRON_SECRET` and a matching Supabase Vault secret for PR #15.
- [x] Document the Supabase Cron schedule and rollback instructions.
- [x] Refresh generated database types from the connected Supabase schema.
- [x] Upgrade Project KIT CI to Node.js 22 and run TypeScript, schema checks, all unit tests, and a production build.
- [ ] Enable `pg_cron` and `pg_net` in the Supabase project, then create and verify the scheduled job. The scheduler is not active until this is done.
- [ ] Obtain a successful full CI run and a ready Netlify preview for the final commit.

Acceptance: a queued job is processed after the teacher closes the browser; concurrent invocations do not claim the same job; failed dispatches remain retryable; the existing exam is never overwritten by a failed job.

## Phase 1 — Server-side lesson document intelligence

Status: backend OCR queue and frontend integration added on `feat/backend-ocr-no-cost`; database migration, Render deployment, Supabase wake-up schedule, and full verification remain pending.

- [x] Move lesson PDF/image OCR and document extraction off the teacher's device and into the existing NestJS backend.
- [x] Store original files in the existing private `lesson-uploads` bucket and keep job metadata in Supabase PostgreSQL.
- [x] Add a durable OCR queue with atomic `SKIP LOCKED` claims, leases, retry limits, and recoverable job states.
- [x] Process text PDFs, mixed text/scanned PDFs, image files, DOCX, PPTX, TXT, and Markdown on the server.
- [x] Run scanned PDF OCR one page at a time with Tesseract, Poppler, and English/Filipino language data.
- [x] Return page-level low-confidence warnings and server-side progress to the teacher.
- [x] Persist the OCR job references in the same browser so the main exam modal can resume extraction and continue exam generation after the teacher returns.
- [x] Remove original source files after processing and expire extracted result objects/job rows after 7 days.
- [x] Keep OCR at one active job per backend process to protect the existing free Render memory limit.
- [ ] Apply the `document_extraction_jobs` migration to Supabase.
- [ ] Deploy the backend and frontend branches, set `OCR_DISPATCH_SECRET`, and configure Supabase Cron/Vault to wake the free Render service.
- [ ] Verify clean and scanned PDFs, mixed PDFs, images, DOCX, PPTX, low-confidence warnings, retry after restart, and tenant isolation on the deployed service.

Acceptance: OCR does not execute on the phone; a teacher can close the browser after the upload is accepted; the Render worker completes the durable job; reopening the same TOS modal in the same browser resumes the saved extraction and starts exam generation. The wake-up schedule and Render free-instance-hour usage must be verified before claiming unattended processing is live.

## Phase 2 — Evidence-grounded AI generation

Status: partially implemented; ambiguity/confidence scoring and labeled quality benchmarks remain open.

- [x] Use one shared structured question schema through the Groq, OpenRouter, Gemini, and Cloudflare provider router.
- [x] Require each new AI question to return a source ID, section number, and short verbatim evidence quote.
- [x] Verify evidence against the exact retrieved lesson section before accepting a question; unsupported items enter the existing repair flow.
- [ ] Detect ambiguous wording, multiple defensible answers, and conflicting source statements.
- [ ] Add calibrated per-question confidence and explicit review states.
- [ ] Measure question quality against labeled lesson/question fixtures and provider-specific regression tests.

Acceptance: every accepted question has a verifiable source; unsupported or ambiguous questions are rejected or marked for review; provider failover preserves the same question schema and TOS constraints.

## Phase 3 — Teacher Exam Review Studio

Status: partially implemented; version history and immutable edit snapshots remain open.

- [x] Show question-level source evidence beside the question and rationale in the existing review editor.
- [x] Retain existing TOS competency/cognitive-level alignment, edit, approve, and single-item regeneration controls.
- [ ] Add batch replacement/regeneration with explicit preview.
- [ ] Keep teacher edits immutable from background retries and provider failover.
- [ ] Add version history and explicit save/restore operations.

Acceptance: regenerating one question never changes approved questions or the saved answer key; edits survive reload and are auditable.

## Phase 4 — OMR learning-gap intelligence

Status: partially implemented; remedial quiz generation and evidence-linked recommendations remain open.

- [x] Aggregate processed/graded OMR scans by competency and item; the shared scan helper excludes pending and review-required scans and deduplicates rescans.
- [x] Retain item difficulty, discrimination, distractor distribution, and Bloom-domain breakdowns in the existing assessment analysis.
- [x] Add competency-level mastery percentages and weak-item lists to the assessment analysis.
- [ ] Add explicit cohort comparison confidence intervals and small-sample warnings.
- [ ] Attach original lesson evidence to weak-competency recommendations.
- [ ] Generate remedial quizzes from the original lesson library and the weak competency set.
- [x] Keep student identifiers out of external AI requests in the lesson-generation path.

Acceptance: reports reconcile with existing item-analysis calculations; unconfirmed OMR sheets are excluded; remedial exams target only supported competencies.

## Phase 5 — Admin diagnostics and observability

Status: partially implemented; provider telemetry, alerts, and end-to-end trace views remain open.

- [x] Add a protected diagnostics API and admin dashboard section.
- [x] Show configured provider names, queued/running/needs-attention/failed counts, expired leases, and oldest queued age.
- [ ] Show actual provider health, failure/fallback rates, latency, repair count, and usage limits.
- [ ] Add a unified trace view connecting request, queue, worker, and provider attempts.
- [x] Keep provider secrets and lesson text out of diagnostics responses.
- [ ] Add retention/redaction policies and alerts for stuck jobs, repeated provider failures, and abnormal queue growth.

Acceptance: administrators can identify a failed request from its request ID without seeing API keys, lesson contents, or student data.

## Architecture guardrails

- Keep Supabase/Postgres as the existing source of truth; do not add Redis unless measured queue throughput justifies it.
- Use Supabase Storage for private source objects and PostgreSQL for metadata, manifests, and job state.
- Evaluate `pgmq` separately; do not migrate away from the current lease-based queue until comparative tests prove a benefit.
- Keep lesson OCR on the backend and make remote AI provider use explicit and policy-compliant. The lesson-generation upload path must not run OCR on the phone or retain original lesson files in browser storage.
- Do not claim end-to-end success until browser, database, worker, provider, and saved-exam results are all verified.
