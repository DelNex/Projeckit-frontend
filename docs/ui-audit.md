# Project KIT UI audit — ui-redesign

**Branch:** `ui-redesign`  
**Design reference:** Stageshow v1.1.1 (latest published release checked 2026-11-20)  
**Scope:** all 20 App Router page entry points, shared layout and UI components, assessment authoring surfaces, student-management dialogs, and the OMR camera / review flow.

## Review method and limits

Stageshow is primarily a craft guide for staged product UI, not a general-purpose application redesign framework. This audit applies the transferable rules: design at the real viewport size, establish a clear focal hierarchy, keep controls and text properly spaced, use one coherent neutral/accent palette, make compact layouts a deliberate composition, and judge rendered frames rather than trusting source classes.

This pass is a source-level responsive and interaction audit. GitHub Actions provides TypeScript, schema/unit tests, and a production build. It does **not** provide screenshots of every authenticated page at desktop and mobile widths. Real-device camera permission, torch, orientation, and image-capture behavior also require browser/device testing; they are not claimed as visually verified here.

## Global system applied

- One neutral surface family, readable ink, and one blue accent. Legacy Tailwind color families are mapped to the accent scale so status and feature surfaces no longer introduce unrelated colors.
- Consistent focus-visible outlines, disabled cursor behavior, tap handling, and button transition behavior across the app shell, teacher/admin pages, and authentication. All action-only buttons now declare `type="button"` explicitly, avoiding accidental form submission from modal close, retry, tab, and row-action controls.
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

## Button behavior audit\n\nA source-level pass found action buttons without explicit types across the admin, analytics, assessment, reports, TOS, student, and shared shell components. They were made explicit as `type="button"`; existing explicit submit buttons were preserved. This prevents incidental form submission/reload when a teacher clicks a tab, retry action, row action, modal close, or inline editor control.\n\n## OMR scanner changes

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
- Login and registration layout smoke tests: added for 320px, 390px, 768px and 1440px viewports; checks document overflow, control bounds, mobile input sizing and button hit targets. These are DOM geometry checks, not screenshot-based visual review.


## Follow-up implementation pass — 2026-11-20

### Table and record presentation

- Added an opt-in compact record-card layout to the shared `DataTable`; student roster and audit log use it on phone widths, while desktop retains the full semantic table.
- Kept assessment rows in the table layout because their row-level navigation and embedded actions need a separate interaction design; they remain contained in a horizontally scrollable region on narrow screens.
- Added a screen-reader label to the search field, `aria-sort` state on sortable headers, accessible names for pagination controls, and a polite page-status announcement.
- Added page-index clamping when a refreshed or filtered dataset becomes shorter, preventing the table from remaining on an empty page after deletion/archive/filter changes.
- Card layout keeps field names beside values and preserves the existing cell renderers and action controls; columns can be explicitly hidden from compact cards with `mobileHidden`.

### Charts and interaction

- Dashboard longitudinal MPS chart now has an accessible group description, keyboard-focusable data points with spoken values and benchmark deltas, a larger touch target, and a live tooltip announcement.
- Mastery donut chart now has an accessible image description; the existing exact tier counts remain available in the adjacent text breakdown.
- Chart values remain visible in the SVG itself; no key information is intentionally hover-only.

### Automated accessibility and responsive checks

- Added `@axe-core/playwright` and a dedicated `playwright.ui.config.ts` / `npm run test:ui:browser` target for authentication pages.
- Login and registration were tested at 320×568, 390×844, 768×1024 and 1440×900.
- The first automated accessibility pass found low contrast in the registration email-domain helper text. Its text color was darkened and the suite was rerun.
- Final auth responsive + automated WCAG 2.1 A/AA checks: **8 passed**.
- TypeScript: **passed**.
- Unit/schema suite: **239 passed, 0 failed, 2 skipped** (241 total).
- Production build: **passed** using placeholder public Supabase build-time values; no production secrets were used or changed.

### Remaining verification boundaries

- Auth pages have browser-based viewport and axe checks. Authenticated teacher/admin screenshot automation was prototyped with Supabase fixtures, but the run was not reliable: the temporary dev server conflicted with the production build output and the mocked session did not reach the authenticated routes. Screenshot files from that attempt are not accepted as visual sign-off. Seeded test users and a stable isolated test project are still needed for reliable authenticated screenshots and interaction coverage.
- OMR unit and synthetic-raster integration tests passed in the unit suite. Browser camera E2E and physical Android/iOS camera testing remain unverified in this environment. The browser run requires a stable production server and camera permissions; do not treat synthetic raster tests as camera-device validation.
- The Stageshow v1.1.1 craft guidance was used for visual restraint, composition, responsive compact layouts and deliberate interaction states. Its staged-demo kit is intended for illustrative marketing demos, so it was not substituted for the app's production components.
- The data-visualization guidance was applied to mobile-first chart reading, visible labels, keyboard/touch interaction, semantic alternatives and test layering. The dashboard still needs authenticated screenshot review with realistic data before visual sign-off.


## Continuation verification — 2026-11-20

- Restored the original `src/middleware.ts` after a temporary test setup had moved it; middleware is present again and unchanged from its saved original.
- Removed the temporary camera test route and temporary authenticated visual-review spec/config after they proved unstable. No test-only camera page is included in the production route tree.
- Rebuilt after removing the temporary route: production build completed successfully with placeholder public Supabase build values. No live project secrets were used.
- Re-ran the dedicated auth responsive/accessibility suite against the production server: **8 passed** across login and registration at 320px, 390px, 768px and 1440px.
- Re-ran TypeScript and the unit/schema suite: **239 passed, 0 failed, 2 skipped**; schema contract validation reports 20 tables and 0 mismatches.
- Authenticated teacher/admin screenshots are still not signed off. The fixture-based attempt failed because the temporary Next dev server collided with the existing `.next` production output and the fixture session did not authenticate the protected pages. The resulting captures are not treated as valid review evidence.
- The OMR camera recovery UI is implemented (permission-denied explanation, retry, and upload fallback), but browser camera automation and physical-device tests remain outstanding. No claim of Android/iOS camera verification is made.

## Responsive UI continuation — 2026-11-21

### Dashboard charts
- Added a reusable `BarList` primitive with labeled values, semantic progress indicators, clamped percentages, and visible values that do not depend on hover.
- Added a reusable `Sparkline` primitive and placed the quarterly MPS trend in the Average MPS summary card.
- Added a keyboard-operable “View as table” control to the quarterly MPS chart. The table exposes period, scan count, mean score, and percentage-point distance from the 75% target.
- Replaced the tier breakdown's dense table with a labeled horizontal-bar list while keeping the stacked distribution overview.

### Dialog presentation and semantics
- Standardized full-height phone layouts and desktop max-height behavior for exam generation, bulk learner import, TOS create/edit, TOS preview, generated exam, exam print, OMR print preview, and confirmation dialogs.
- Added explicit dialog roles, modal state, and title associations to the updated shells. Confirmation dialogs also expose their description through `aria-describedby`.
- The OMR camera/scanning implementation and document-generation/export logic were not modified by this presentation pass.

### Expanded public-route test matrix
- The auth browser suite now checks login and registration at 320×568, 390×844, 768×1024, 1280×800, and 1440×900 in both light and dark themes.
- The suite continues to assert no horizontal page overflow, mobile input font sizing, minimum touch target height, and automated WCAG A/AA checks.
- Authenticated teacher/admin page screenshots remain unverified because this repository's CI does not have a seeded authenticated browser session. Protected routes must not be marked visually signed off based only on unauthenticated redirects.
- Latest UI changes are isolated in PR #35. CI status is recorded on the PR; no merge or deployment is implied by this audit note.
