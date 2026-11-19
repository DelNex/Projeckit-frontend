# Project KIT integration guide

This note records how the running application is wired today and the boundaries that should be kept during future work.

## System boundaries

- **Next.js website:** pages, user-facing workflows, file exports, and server API routes.
- **Supabase:** sign-in, school and learner data, scan records, answer keys, saved assessments, storage, and row-level access rules.
- **NestJS AI service:** the authenticated Copilot chat, streaming, status information, and lesson-material indexing endpoints. It is not the API for assessments or student records.
- **Helper worker:** asynchronous exam generation jobs claimed from the website's durable job queue. A helper being offline must leave a visible failed or queued state that can be retried safely.

Use browser Supabase clients only for signed-in user work covered by RLS. Keep the service-role key in server code and derive each request's school/tenant from the validated profile; never accept a tenant identifier as authority from a browser form. Next.js server routes are the boundary for privileged reports, administration, file generation, and background job transitions.

The AI Copilot uses `/api/backend/ai/*`, a same-origin Next.js proxy. The proxy validates the Supabase session, rejects cross-site writes, forwards only the bearer token to the Nest service, and allows only the four AI endpoints that the website needs. Configure `BACKEND_API_BASE_URL` in the web server environment. The old browser-visible `NEXT_PUBLIC_API_BASE_URL` value is supported as a compatibility fallback only; new deployments should use the server-only setting.

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

Exam generation uses the existing durable `exam_generation_jobs` queue. The database claim function provides per-job row locking and leases; the API also applies per-user hourly and per-school daily limits. Provider failover does not create a second queue. A shared dispatcher now starts the oldest queued job from the least-loaded school. The database serializes claims and caps hosted exam work at four concurrent jobs globally and two per school. Enqueue requests and status polling both trigger dispatch, so queued work resumes when users revisit/poll their jobs; this is not yet an always-on worker that drains the queue after every browser closes.

The server-side provider router supports these adapters when credentials are configured:

- Groq: `GROQ_API_KEY`, optional `GROQ_MODEL`
- OpenRouter: `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`
- Gemini: `GEMINI_API_KEY`, optional `GEMINI_MODEL`
- Cloudflare Workers AI: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, optional `CLOUDFLARE_MODEL`

Set `AI_PROVIDER_ORDER=groq,openrouter,gemini,cloudflare` to choose the failover order. Only providers with server-side credentials are eligible. Never put these keys in `NEXT_PUBLIC_*` variables or browser code. The router skips a provider during its in-process rate-limit cooldown and falls back on retryable provider errors; it does not create accounts, rotate identities, or bypass quotas. Cooldowns are process-local, so they are not a substitute for a shared global rate-limit ledger. Review each provider's current pricing, rate limits, and data-use terms before enabling it. Do not send student records or other personal information to a provider unless the school's data-processing rules permit it.

Local extraction now accepts up to 900,000 readable characters per generation job, subject to the existing 1.5 MB serialized queue-payload limit. Text is stored as bounded lesson sections in the durable job. For each question batch, the worker ranks sections against the requested TOS competency and sends at most eight relevant sections / 120,000 characters to the model. If no section matches, it samples across the document instead of repeatedly sending only the first pages. This is lexical retrieval, not semantic search; teachers must still review generated questions against the source.

## Known operational constraints

- The AI service needs to be reachable from the Next.js server and requires the same Supabase signing configuration to validate user tokens.
- Scanned/image-only PDFs still require OCR or a text-based source. The local OCR engine is not yet integrated; do not treat image-only PDFs as supported until a pinned, self-hosted OCR runtime and language assets are added and tested.
- OpenCV quality depends on camera and printing conditions. Calibration and a recorded validation dataset remain release tasks.
- Retain separate, current lockfile-based SBOMs and review dependency audit findings before production deployment.


## Scheduled exam queue dispatch

The authenticated endpoint `POST /api/internal/ai/dispatch` lets a trusted scheduler process one queued Groq exam job even when no teacher has the application open. It accepts either `Authorization: Bearer <secret>` or `x-cron-secret: <secret>`. The secret must be at least 32 characters and is compared using a constant-time byte comparison. The endpoint is server-only, returns no queue payload, and relies on the existing database claim/lease RPC to prevent duplicate workers.

Configure `AI_DISPATCH_CRON_SECRET` in the Netlify environment for the branch deployment. Use a randomly generated value of at least 32 characters. Store the same value in Supabase Vault as `projectkit_ai_dispatch_secret`; do not put it in SQL source, browser variables, or Git. Supabase Cron can then call the Netlify branch URL every minute using `pg_cron` and `pg_net`. Keep the schedule disabled until the Netlify variable and Vault secret are both configured.

Example Supabase SQL after enabling `pg_cron`, `pg_net`, and Vault:

```sql
select vault.create_secret('https://YOUR-BRANCH-NETLIFY-HOST', 'projectkit_app_url');
select vault.create_secret('YOUR_RANDOM_32_PLUS_CHARACTER_SECRET', 'projectkit_ai_dispatch_secret');

select cron.schedule(
  'projectkit-ai-dispatch',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'projectkit_app_url')
      || '/api/internal/ai/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'projectkit_ai_dispatch_secret'
      )
    ),
    body := jsonb_build_object('source', 'supabase-cron')
  );
  $$
);
```

Replace the host with the branch deployment's HTTPS hostname. Do not use the main production alias for this temporary test. Check `cron.job_run_details` and Netlify function logs after enabling. To stop dispatching, unschedule the job from Supabase Cron. The dispatcher processes at most one job per invocation; it does not increase the existing provider or database concurrency limits.

## Error capture

`src/instrumentation.ts` exports Next.js `onRequestError` for unhandled server-side errors. It dynamically loads the Node-only structured logger only in the Node runtime, includes the request/route context and error digest, and must never replace the original application error if logging fails. Route handlers should continue logging expected failures at their boundaries with their richer tenant and job context.

## Large-document and OCR roadmap

The current browser extraction path supports text-based PDF, DOCX, PPTX, TXT, and Markdown. Image-only PDFs are not supported yet. Do not advertise OCR support until a self-hosted browser OCR runtime, language assets, worker lifecycle, cancellation, page-level confidence, and real-device tests are included.

For large documents, the next architecture step is private object storage with short-lived signed upload URLs and resumable TUS uploads, plus a small database manifest containing tenant ownership, source hash, page/chunk metadata, and object paths. Keep source files private and avoid embedding extracted lesson text in job rows. Supabase recommends TUS resumable uploads for files larger than 6 MB and unstable networks. Chunking and retrieval should be introduced with migration/backfill tests before changing the existing queue payload contract.
