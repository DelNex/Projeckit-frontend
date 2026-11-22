# Project KIT — Product Features and Frontend Guide

> This document describes the frontend as it exists in the repository. It is a feature and architecture guide, not a promise that every optional deployment service is enabled.

## 1. What Project KIT Does

Project KIT is a school assessment and academic analysis platform. It helps teachers and school staff organize learners, sections, subjects, assessment plans, examinations, answer sheets, scan results, and academic reports in one workspace.

The frontend is the user-facing application. It is built with Next.js App Router and React, and it connects to Supabase for authenticated school data. It also connects to the separate NestJS backend for the AI Copilot and server-side lesson-document processing.

## 2. Main User Workflows

A typical teacher workflow is:

1. Sign in to the school workspace.
2. Set up or select sections, subjects, learners, and the active academic period.
3. Create a Table of Specifications (TOS) and map competencies to the planned test items.
4. Create an assessment and prepare its questions and answer key.
5. Print the question paper and OMR answer sheets.
6. Scan completed answer sheets, review uncertain readings, and confirm valid results.
7. Review item analysis and learner performance.
8. Export or print reports for the selected section and assessment.

The application keeps the assessment, TOS, answer key, scan results, and reports connected so that later analysis uses the correct assessment context.

## 3. Authentication, Roles, and School Separation

- Sign-in and registration pages are provided through the Next.js application.
- Supabase Auth provides the signed-in session.
- The application uses a tenant context to identify the active school workspace and related academic settings.
- Browser-side Supabase access is intended for signed-in operations protected by Row Level Security (RLS).
- Privileged actions are routed through server-side Next.js endpoints.
- The frontend must not treat a tenant or school ID submitted by a browser form as proof of access. The server must validate the session and derive the tenant scope.
- Administrative pages provide protected school-level and platform-level management functions, depending on the signed-in role.

## 4. Dashboard

The dashboard summarizes school and assessment activity for the selected school year.

Repository-backed dashboard data includes:
- Assessment records, titles, subjects, sections, grade/strand context, terms, and school year.
- Enrolled learner totals and section totals.
- Saved assessment scan counts and calculated MPS values.
- Grading-period information.
- Performance distribution groups, including mastery and at-risk ranges.
- Quarterly or grading-period performance trends.
- Refresh and loading/error states.

Dashboard values depend on saved records. A missing scan or unconfirmed scan should not be presented as a completed academic result.

## 5. Learner and Section Management

The learner management area supports:
- Viewing learners in the active list.
- Switching between active and archived learners.
- Filtering learners by section.
- Adding and editing learner records.
- Bulk learner entry.
- Selecting multiple learners for supported bulk actions.
- Moving learners between sections.
- Archiving and restoring learner records.
- Permanent deletion through a confirmation flow where the relevant operation is available.
- Duplicate and validation feedback.
- Paginated loading for larger learner lists.

The interface includes unsaved-change protection for learner forms so accidental modal closure does not silently discard entered information.

Learner records are associated with the school workspace. Keep personal learner identifiers protected and do not expose them in external AI prompts or public exports unless the workflow specifically requires them.

## 6. Table of Specifications (TOS)

The TOS workflow helps teachers plan an assessment before generating or entering questions.

It supports the core concepts used by the application:
- Subject and academic-period context.
- Target number of test items.
- Sections linked to a TOS.
- Competencies and learning coverage.
- Taught days and allocation inputs.
- Item distribution and blueprint rows.
- TOS status and assessment linkage.
- Viewing and editing saved TOS records.
- Creating an assessment from the TOS context.
- Exporting TOS documents.

The TOS is an important source of constraints for exam generation. Generated questions should follow the requested item count and the competency distribution rather than inventing a different test structure.

## 7. Assessment and Exam Management

The assessment workflow connects the TOS, question paper, answer key, and scan results.

Available frontend capabilities include:
- Assessment listing and assessment-specific views.
- Assessment metadata such as title, subject, section, term, school year, target item count, passing MPS, and status.
- Exam generation from lesson materials and TOS blueprint slots.
- Pasted lesson text and teacher instructions as generation inputs.
- Question review and editing through the exam draft editor.
- Saving generated exam content.
- Question-paper printing and teacher-copy options.
- Answer-key preparation and OMR sheet printing.
- Exam generation job status, progress, quota information, retry state, and recovery of an existing job.

Generation is asynchronous. The UI can display queued, running, completed, partial, failed, cancelled, and needs-attention states. A failed generation job must not silently replace a previously saved assessment.

## 8. Lesson Materials and Document Extraction

The exam workflow accepts lesson source materials for question preparation.

The frontend supports document selection and upload flows for supported formats such as PDF, DOCX, PPTX, TXT, Markdown, and common image formats through the document-extraction pipeline. The exact accepted formats and size limits are validated by the server.

The current flow is designed to:
- Upload source documents to private storage.
- Create durable extraction jobs.
- Show extraction progress and processing state.
- Extract text from supported documents.
- Process scanned PDFs page by page using OCR in the backend pipeline.
- Report low-confidence pages or extraction problems.
- Resume a pending lesson extraction in the same browser session.
- Continue to exam generation after extraction completes.

Do not promise perfect OCR. Poor scans, glare, unusual layouts, image-only content, or low-resolution pages can produce incomplete text and require teacher review.

## 9. OMR Answer-Sheet Workflow

The OMR feature is a major part of Project KIT. The frontend includes a camera workflow, printable answer sheets, scanning utilities, and a review interface.

The codebase includes:
- OMR sheet template construction and rendering.
- Personalized print layouts.
- SVG rendering and barcode/QR-related rendering utilities.
- Camera access and camera stream helpers.
- Image normalization.
- Marker and fiducial detection.
- Perspective correction using homography.
- Canonical sheet geometry and geometry validation.
- Bubble sampling and optical analysis.
- Native optical processing and an OMRChecker adapter.
- OpenCV-based bubble analysis and worker support.
- Barcode decoding utilities.
- Scan result review components.
- Confidence and per-item scan states.

Per-item states include marked, blank, ambiguous, and multiple-mark outcomes. A scan with uncertain or conflicting readings should be reviewed by a teacher. The system should preserve the original machine interpretation and distinguish it from a teacher-confirmed correction.

The scanner should be tested with clean sheets, faint marks, erased marks, multiple marks, rotated pages, cropped pages, glare, and low-resolution camera images. Camera recognition is not guaranteed to be correct for every sheet.

## 10. Scoring, Item Analysis, and Analytics

Project KIT includes assessment scoring and analysis utilities.

The analytics area includes:
- Sectional performance views.
- Longitudinal or period-over-period views.
- Cognitive-domain views.
- Item analysis.
- Report-oriented views and exports.
- Filters for school year, grade, strand, section, quarter, subject, and assessment.
- Assessment-level answer-key context.
- Scan-result aggregation and rescan deduplication.
- Item response and distractor analysis.
- Difficulty and discrimination measures.
- Competency and mastery-related summaries.

The scoring pipeline uses the saved assessment answer key. Pending or verification-required scans must not be silently counted as final academic results. Re-scans should be deduplicated according to the application's scan policy.

Use the same roster, assessment set, and scoring rules when comparing analytics with exported term reports.

## 11. Reports and Exports

The reports area allows a user to select a section and access available assessment documents.

Repository-backed report capabilities include:
- TOS document exports.
- Test-result and assessment reports.
- Item-analysis and learning-performance reports.
- Question-paper exports.
- Teacher-copy question papers.
- OMR answer-sheet printing.
- DOCX report generation.
- Spreadsheet/Excel analytics export.
- Printable report layouts.
- Question-paper paper-size selection (A4 or A5).
- Optional two-column question-paper layout.
- Optional teacher copy.

The exact report options depend on the records linked to the selected section and assessment.

## 12. AI Copilot — One Local AI

Project KIT presents one AI assistant: the **Project KIT AI Copilot**.

The AI runtime is configured in the backend to use one local model through **Ollama**. The current example model is `llama3.2:1b`. The model is configured using server-side environment settings; the browser does not connect directly to the model runtime.

The Copilot can help with school and assessment workflows, including:
- Explaining item difficulty and discrimination.
- Interpreting assessment results.
- Suggesting test revisions.
- Explaining OMR evaluation and troubleshooting.
- Guiding teachers through TOS and assessment workflows.
- Answering questions using the active page and assessment context.
- Using uploaded lesson materials as context when supported by the backend indexing flow.
- Streaming responses to the chat interface.
- Showing AI runtime and tool information in its information panel.
- Collecting user feedback on responses.

The frontend sends Copilot requests through the same-origin Next.js proxy. The proxy validates the signed-in session before forwarding the request to the backend. The AI service derives the user's school scope from the validated session.

**AI deployment note:** Ollama must be running and reachable from the backend using the configured server-side URL. The model name and endpoint are deployment settings. Do not put private model endpoint credentials or service keys in browser-visible environment variables.

## 13. Administration

The admin area includes routes and screens for:
- Admin dashboard.
- User management.
- Pending-user review.
- User role, status, school, and email management.
- Tenant/school management.
- School and platform settings.
- Audit-related views.
- Health and schema diagnostics.
- Deletion-code management and protected deletion workflows.

Administrative actions should use server-side authorization and confirmation steps. Destructive operations should explain their impact before execution.

## 14. User Experience and Accessibility

The frontend includes shared layout and interface components such as:
- Header, sidebar, footer, and navigation progress.
- Theme toggle.
- Toast notifications and status banners.
- Confirmation modals.
- Data-table and chart primitives.
- Loading, empty, success, and error states.
- Accessible dialog helpers and keyboard handling.
- Responsive layouts for dashboard and workflow screens.

The application supports light and dark theme styling. New UI work should follow the existing component patterns and should be checked on narrow mobile screens as well as desktop.

## 15. Frontend Technology

The frontend repository currently uses:
- Next.js 15 with the App Router.
- React 19 and TypeScript.
- Supabase JavaScript client and Supabase SSR helpers.
- Tailwind CSS 4.
- Lucide React icons.
- TanStack React Table.
- Tesseract.js and language data for browser-side OCR utilities where used.
- OpenCV.js and OMR-related libraries.
- ZXing for barcode/QR workflows.
- PDF parsing and PDF.js utilities.
- Mammoth for DOCX text extraction.
- DOCX and JSZip utilities for document output and packaging.
- Playwright for browser tests.
- ESLint and TypeScript checks.

See `package.json` for the exact installed versions and scripts.

## 16. Important Frontend Routes and Areas

| Area | Repository location |
|---|---|
| Public landing page | `src/app/page.tsx` |
| Authentication | `src/app/(auth)/` |
| Teacher dashboard | `src/app/(dashboard)/dashboard/` |
| Assessments | `src/app/(dashboard)/assessments/` |
| Learners | `src/app/(dashboard)/students/` |
| Analytics | `src/app/(dashboard)/analytics/` |
| Reports | `src/app/(dashboard)/reports/` |
| Profile and school settings | `src/app/(dashboard)/settings/` |
| TOS and assessment components | `src/features/tos/`, `src/components/assessment/` |
| OMR and scanner | `src/features/omr/`, `src/features/scanner/` |
| AI Copilot | `src/components/ai/AiCopilotModal.tsx` |
| Admin pages | `src/app/(admin)/admin/` |
| API routes | `src/app/api/` |
| Supabase clients | `src/lib/supabase/` |

## 17. Frontend-to-Backend Integration

- Supabase is the primary application data platform for authentication, school records, storage, and row-level access control.
- The NestJS backend provides the authenticated AI Copilot and server-side lesson document extraction/processing.
- The frontend calls the backend AI service through `/api/backend/ai/*`, a same-origin proxy.
- Configure `BACKEND_API_BASE_URL` as a server-only environment variable in the frontend deployment.
- The browser should not call the private backend service directly or receive backend secrets.
- Exam-generation and document-processing jobs have durable status records and should remain retryable when a worker or service is temporarily unavailable.

See `docs/INTEGRATION_GUIDE.md` for the detailed system boundaries and release checks.

## 18. Local Development

Install dependencies:

```bash
npm ci
```

Create a local environment file based on `.env.example` and configure the Supabase values and server-only backend URL.

Start the frontend:

```bash
npm run dev
```

The development server runs on port 3000.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run test:omr:browser
npm run test:ui:browser
npm run build
```

Not every optional integration can be verified without the matching Supabase project, backend service, storage configuration, and environment variables.

## 19. Known Boundaries and Careful Claims

- A scan is not automatically trustworthy just because an answer was detected. Review low-confidence and ambiguous results.
- OCR quality depends on the source document and image quality.
- AI-generated questions require teacher review before use in a real examination.
- AI availability depends on the configured local Ollama runtime being reachable.
- Reports depend on complete and correctly linked TOS, assessment, answer-key, learner, and scan records.
- Some deployment tasks and scheduled background processing require external configuration; the presence of code does not prove that a production scheduler is active.
- The repository's tests and deployment status should be checked before claiming that a feature is fully verified in production.

## 20. Related Documentation

- `docs/INTEGRATION_GUIDE.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/SERVER_SIDE_OCR.md`
- `docs/ui-audit.md`
- `docs/operations/production-deploy.md`
- `docs/research/omr-validation.md`
