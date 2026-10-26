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

## Known operational constraints

- The AI service needs to be reachable from the Next.js server and requires the same Supabase signing configuration to validate user tokens.
- Scanned/image-only PDFs have no selectable text and cannot be indexed by text extraction alone; OCR or a text-based source is needed.
- OpenCV quality depends on camera and printing conditions. Calibration and a recorded validation dataset remain release tasks.
- Retain separate, current lockfile-based SBOMs and review dependency audit findings before production deployment.
