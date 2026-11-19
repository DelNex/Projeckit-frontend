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

## Phase 1 — Local-first document intelligence

Status: planned; existing text extraction remains unchanged.

- [ ] Add a pinned, self-hosted browser OCR runtime with language assets and a Web Worker.
- [ ] OCR image-only PDFs and photographs locally; preserve page number, reading order, text blocks, and confidence.
- [ ] Add cancellation, progress, memory guards, and low-confidence page review.
- [ ] Store compressed extracted chunks in a private Storage bucket using tenant-scoped paths and short-lived signed uploads.
- [ ] Replace large lesson text in job payloads with a versioned manifest of object references and source hashes.
- [ ] Add server-side retrieval, decompression, cleanup, quota checks, and resumable upload recovery.
- [ ] Keep original documents private; do not expose Storage object URLs or service-role credentials to the browser.

Acceptance: test text PDFs, image-only PDFs, DOCX, PPTX, photos, multi-file sources, interrupted uploads, retry/resume, cross-tenant access denial, and a large file on a low-memory phone. Confirm original file bytes never enter the AI provider request.

## Phase 2 — Evidence-grounded AI generation

Status: planned; current lexical retrieval and structural validation remain in place.

- [ ] Add provider-specific structured-output schemas for Groq, OpenRouter, Gemini, and Cloudflare.
- [ ] Require question-level source references (document, page, chunk) and a short supporting evidence span.
- [ ] Verify evidence spans against retrieved source text before accepting an answer.
- [ ] Detect unsupported facts, ambiguous wording, multiple defensible answers, and source conflicts.
- [ ] Add per-question confidence and teacher-review states; never silently convert uncertain questions into approved items.
- [ ] Measure question quality against labeled lesson/question fixtures and provider-specific regression tests.

Acceptance: every accepted question has a verifiable source; unsupported or ambiguous questions are rejected or marked for review; provider failover preserves the same question schema and TOS constraints.

## Phase 3 — Teacher Exam Review Studio

Status: planned; existing draft editor remains the foundation.

- [ ] Add a review workspace with source evidence, TOS alignment, competency, cognitive level, and answer explanation beside each question.
- [ ] Support approve, edit, replace, regenerate-one-question, and regenerate-batch actions.
- [ ] Keep teacher edits immutable from background retries and provider failover.
- [ ] Add version history and explicit save/restore operations.

Acceptance: regenerating one question never changes approved questions or the saved answer key; edits survive reload and are auditable.

## Phase 4 — OMR learning-gap intelligence

Status: planned; existing OMR scoring and reports remain the source of truth.

- [ ] Aggregate confirmed scan results by competency and item, excluding unverified scans.
- [ ] Add item discrimination, difficulty, distractor analysis, and cohort comparisons with sample-size warnings.
- [ ] Identify weak competencies and show the source evidence used for the recommendation.
- [ ] Generate remedial quizzes from the original lesson library and the weak competency set.
- [ ] Keep student-identifying information out of external AI requests unless school policy explicitly allows it.

Acceptance: reports reconcile with existing item-analysis calculations; unconfirmed OMR sheets are excluded; remedial exams target only supported competencies.

## Phase 5 — Admin diagnostics and observability

Status: planned; structured server logging and Next.js error capture are now present.

- [ ] Add a protected diagnostics API and admin dashboard.
- [ ] Show provider health, failure/fallback rates, latency, queue depth, oldest queued age, lease expiry, repair count, and usage limits.
- [ ] Add trace/request/job IDs that connect API, queue, worker, and provider attempts.
- [ ] Add retention and redaction policies; never expose secrets, student records, or full lesson text.
- [ ] Add alerts for stuck jobs, repeated provider failures, and abnormal queue growth.

Acceptance: administrators can identify a failed request from its request ID without seeing API keys, lesson contents, or student data.

## Architecture guardrails

- Keep Supabase/Postgres as the existing source of truth; do not add Redis unless measured queue throughput justifies it.
- Use Supabase Storage for private source objects and PostgreSQL for metadata, manifests, and job state.
- Evaluate `pgmq` separately; do not migrate away from the current lease-based queue until comparative tests prove a benefit.
- Keep OCR local by default and make remote AI provider use explicit and policy-compliant.
- Do not claim end-to-end success until browser, database, worker, provider, and saved-exam results are all verified.
