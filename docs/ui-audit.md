# Project KIT UI audit — ui-redesign

**Branch:** `ui-redesign`  
**Design reference:** Stageshow v1.1.1 (latest published release checked 2026-11-20)  
**Scope:** all 20 App Router page entry points, shared layout and UI components, assessment authoring surfaces, student-management dialogs, and the OMR camera / review flow.

## Review method and limits

Stageshow is primarily a craft guide for staged product UI, not a general-purpose application redesign framework. This audit applies the transferable rules: design at the real viewport size, establish a clear focal hierarchy, keep controls and text properly spaced, use one coherent neutral/accent palette, make compact layouts a deliberate composition, and judge rendered frames rather than trusting source classes.

This pass is a source-level responsive and interaction audit. GitHub Actions provides TypeScript, schema/unit tests, and a production build. It does **not** provide screenshots of every authenticated page at desktop and mobile widths. Real-device camera permission, torch, orientation, and image-capture behavior also require browser/device testing; they are not claimed as visually verified here.

## Global system applied

- One neutral surface family, readable ink, and one blue accent. Legacy Tailwind color families are mapped to the accent scale so status and feature surfaces no longer introduce unrelated colors.
- Consistent focus-visible outlines, disabled cursor behavior, tap handling, and button transition behavior across the app shell, teacher/admin pages, and authentication.
- Minimum button targets of 36px at desktop and 40px at mobile, with 44px controls in the camera viewfinder.
- Inputs, selects, textareas, images, charts and flex/grid children are constrained to their available width.
- Horizontal data tables remain horizontally scrollable with touch momentum and keyboard focus instead of forcing the entire page wider than the viewport.
- Nested dialogs are bounded by the dynamic viewport and can scroll without losing access to their footer actions.
- Mobile authentication forms use full-width fields and 16px input text to avoid iOS browser auto-zoom.
- Reduced-motion preferences remain respected.

## Route inventory

| Route / page | Main UI reviewed | Findings and treatment |
|---|---|---|
| `/admin/audit` | Audit log and DataTable | Dense records need contained horizontal scrolling; shared DataTable now has a named, keyboard-focusable scroll region and mobile swipe hint. |
| `/admin` | Platform overview cards and statistics | Responsive card grid already exists; global min-width and surface rules prevent grid children from forcing page overflow. |
| `/admin/settings` | Platform settings, keys and confirmation actions | Long settings form and feedback panels; shared controls and bounded confirmation dialogs applied. |
| `/admin/tenants` | Tenant list, create/edit actions | Table uses a 500px minimum width; keep scroll inside the table viewport rather than the page. |
| `/admin/users` | User directory, filters, detail and school assignment dialogs | Large interactive page with dense table and several dialogs; shared responsive modal bounds and control targets applied. |
| `/admin/users/pending` | Pending-user review table | 650px table is intentionally data-dense; contained horizontal scroll and touch-safe controls. |
| `/app-hub` | External resource cards | Existing responsive grid retained; common surface and interaction rules applied. |
| `/login` | Authentication form | Added dedicated auth scope, mobile input sizing, viewport-safe vertical spacing and shared button behavior. |
| `/register` | Teacher registration form | Same auth treatment; long form remains vertically scrollable and fields stay within the viewport. |
| `/analytics` | Charts, filters and analytics tables | Large page with a 640px table; chart/table overflow stays within the content column. |
| `/assessments/[id]` | Assessment details, answer key, OMR scanner and actions | Added accessible OMR dialog label, viewport-safe camera shell, live status announcement and responsive review grid. |
| `/assessments` | Assessment listing and authoring actions | Dense list and filters; common control sizing and page-width constraints applied. |
| `/dashboard` | KPI cards, charts and activity table | Existing responsive KPI grid retained; 620px data table stays inside its own scroll region. |
| `/reports` | Report filters, generation and export actions | Existing max-width layout retained; common button, form and overflow behavior applied. |
| `/settings/profile` | Profile form | Existing narrow form retained; field sizing and focus behavior normalized. |
| `/settings/school` | School profile, grading, terms and multiple dialogs | Very large settings surface; global dialog viewport bounds, field constraints and consistent action behavior applied. |
| `/students` | Student roster, bulk import and row actions | DataTable scroll behavior and shared bulk-dialog sizing applied. |
| `/tos` | Table of specifications and editor | Wide planning grid remains scrollable; print stylesheet and paper layout are preserved. |
| `/omr-validation` | Private OMR / OCR validation harness | Development or explicit validation-build only; excluded from public production navigation. |
| `/` | Root redirect | Redirect-only route; no visual page to redesign. |

## Shared component review

- `Sidebar`, `Header`, dashboard/admin layouts: existing responsive drawer and compact header preserved; shared app-shell styling and touch/focus behavior applied.
- `DataTable`: contained horizontal scroll, keyboard focus, touch momentum, and explicit mobile swipe guidance.
- `ConfirmationModal`: max-height and internal scrolling added for short mobile viewports.
- `ToastProvider`: stackable notifications from the previous redesign pass (five visible, independent timers, manual dismiss, action support, live announcement).
- `AiCopilotModal`, `ExamGeneratorModal`, `ExamPrintModal`, `BulkAddStudentsModal`, `TosEditor`: benefit from shared dynamic-viewport dialog bounds and scroll containment.
- `ExamDraftEditor`, `ExamDraftControls`, `TosEditor`: common control sizing, palette and responsive overflow behavior applied through the app shell.
- `AppFooter`, `ThemeToggle`, `NavigationProgress`: reviewed as shared shell elements; no data or navigation behavior intentionally changed.

## OMR scanner changes

1. Camera modal now has an accessible title association and a named, safe-area-aware full-screen mobile layout.
2. Camera viewfinder uses `object-contain` so the live preview does not crop the edges of the answer sheet. The previous fixed 380px mobile / 500px desktop minimum height was replaced by a viewport-aware flexible region.
3. Camera controls use touch-safe targets, including upload, torch, shutter and camera switching.
4. Barcode laser and camera status indicators use the single accent family rather than separate red/green/amber visual effects.
5. Review panel now consumes the available modal height; the answer grid scrolls independently instead of being capped at 380/440px.
6. Answer choices have explicit pressed states and accessible labels. Blank is exposed as pressed only when the item is actually blank.
7. Marked, ambiguous, multiple-mark and erased states use border treatment and explicit labels, not color alone. Erased counts are now visible in the summary.
8. Review footer actions remain reachable on mobile and stack at narrow widths.

## What is not claimed

- No screenshot-based review of every authenticated route has been completed because this CI workflow does not authenticate into each page or capture viewport screenshots.
- No physical Android/iOS camera session has been run in this pass. Camera access, orientation changes, device switching, torch support, low-light capture and browser file-upload fallback still require real-device verification.
- The OMR scoring engine, geometry, thresholds, barcode matching, persistence and database behavior were not intentionally changed by these UI edits.
- Wide data tables still scroll horizontally on small screens; they are not all converted to separate mobile card views because custom cell renderers and action columns vary by route.

## Verification

- TypeScript check: pending latest branch run.
- Schema contract and complete unit test suite: pending latest branch run.
- Production build: pending latest branch run.
- Visual viewport review: pending browser screenshot coverage.
