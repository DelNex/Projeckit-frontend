import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDir, '../docs/research/Project-KIT-Technology-Research-Materials.docx');
const navy = '17365D';
const blue = '1F5EAA';
const paleBlue = 'EAF2F8';
const gray = 'F3F5F7';
const border = { color: 'CBD5E1', size: 1, style: BorderStyle.SINGLE };

const frontendDeps = [
  ['@armghan3071/omrchecker', '1.0.2 (local tarball)', 'Optional/legacy OMR checker adapter; the current default scanner path is the bundled Project KIT optical engine.'],
  ['@supabase/ssr', '^0.5.2', 'Cookie-aware Supabase client integration for server-rendered sessions.'],
  ['@supabase/supabase-js', '^2.49.1', 'Supabase data, authentication, and storage client.'],
  ['@tanstack/react-table', '^9.2.4', 'Headless table state and interaction utilities.'],
  ['@techstark/opencv-js', '4.12.0-release.1', 'OpenCV.js image-processing runtime used by the browser OMR worker.'],
  ['clsx', '^2.1.1', 'Conditional class-name composition.'],
  ['docx', '9.0.3', 'Generate Word reports, examination papers, and this research document.'],
  ['jszip', '3.10.1', 'ZIP archive utilities; DOCX files use the Open XML ZIP container.'],
  ['lucide-react', '^0.475.0', 'React icon components.'],
  ['mammoth', '1.8.0', 'Extract semantic text from DOCX lesson materials.'],
  ['next', '^15.1.7', 'React framework, app routing, server rendering, and API routes.'],
  ['pdf-parse', '1.1.1', 'Extract text from PDF lesson materials.'],
  ['react', '^19.0.0', 'Component-based user interface library.'],
  ['react-dom', '^19.0.0', 'React renderer for the browser DOM.'],
  ['tailwind-merge', '^3.0.1', 'Resolve conflicting Tailwind CSS utility classes.'],
];
const frontendDev = [
  ['@tailwindcss/postcss', '^4.0.0', 'Tailwind CSS integration for the PostCSS build pipeline.'],
  ['@types/node', '^22.13.4', 'TypeScript declarations for Node.js APIs.'],
  ['@types/pngjs', '^6.0.5', 'TypeScript declarations for pngjs.'],
  ['@types/react', '^19.0.8', 'TypeScript declarations for React.'],
  ['@types/react-dom', '^19.0.3', 'TypeScript declarations for React DOM.'],
  ['pngjs', '^7.0.0', 'PNG image decoding/encoding utility used in scanner image workflows.'],
  ['postcss', '^8.5.2', 'CSS transformation pipeline.'],
  ['tailwindcss', '^4.0.0', 'Utility-first CSS framework.'],
  ['tsx', '^4.23.13', 'Run TypeScript scripts and test files in Node.js.'],
  ['typescript', '^5.7.3', 'Type checker and compiler for the frontend TypeScript code.'],
];
const backendDeps = [
  ['@nestjs/common', '^9.0.0', 'NestJS core decorators, guards, pipes, and shared interfaces.'],
  ['@nestjs/config', '^2.2.0', 'Environment configuration integration for NestJS.'],
  ['@nestjs/core', '^9.0.0', 'NestJS application runtime and dependency injection.'],
  ['@nestjs/platform-express', '^9.0.0', 'Express HTTP adapter for the NestJS API.'],
  ['@supabase/supabase-js', '^2.116.0', 'Supabase client used by backend services and repositories.'],
  ['argon2', '^0.45.1', 'Argon2 password hashing implementation.'],
  ['bcrypt', '^5.1.0', 'bcrypt password hashing compatibility.'],
  ['class-transformer', '^0.5.1', 'Transform and serialize validated request objects.'],
  ['class-validator', '^0.14.0', 'Decorator-based request DTO validation.'],
  ['cookie-parser', '^1.4.7', 'Parse cookies on incoming Express requests.'],
  ['csrf-csrf', '^4.0.3', 'CSRF protection utilities.'],
  ['dotenv', '^16.0.0', 'Load environment variables from local dotenv files.'],
  ['helmet', '^8.3.0', 'Set common HTTP security headers.'],
  ['ioredis', '^5.3.2', 'Redis client for backend cache/rate-limiting services.'],
  ['jsonwebtoken', '^9.0.0', 'JWT creation and verification.'],
  ['reflect-metadata', '^0.1.13', 'Runtime metadata support required by NestJS decorators.'],
  ['rxjs', '^7.8.0', 'Reactive primitives used by NestJS internals and APIs.'],
];
const backendDev = [
  ['@types/cookie-parser', '^1.4.8', 'TypeScript declarations for cookie-parser.'],
  ['@types/jest', '^30.0.0', 'TypeScript declarations for Jest tests.'],
  ['@types/multer', '^2.2.0', 'TypeScript declarations for Multer upload middleware.'],
  ['ts-jest', '^29.4.12', 'Jest transformer for TypeScript test files.'],
  ['ts-node', '^10.9.1', 'Execute TypeScript scripts in Node.js.'],
  ['ts-node-dev', '^2.0.0', 'Restart backend development server when TypeScript files change.'],
  ['typescript', '^5.0.0', 'Type checker and compiler for backend TypeScript.'],
];
const helperDeps = [['playwright', '^1.55.0', 'Browser automation for the local Gemini helper worker.']];

function run(text, options = {}) {
  return new TextRun({ text, font: 'Aptos', size: 20, color: '263445', ...options });
}

function paragraph(text, options = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 280 },
    children: typeof text === 'string' ? [run(text)] : text,
    ...options,
  });
}

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 300 : 180, after: 100 },
    keepNext: true,
    children: [run(text, { bold: true, color: level === HeadingLevel.HEADING_1 ? navy : blue, size: level === HeadingLevel.HEADING_1 ? 30 : 24 })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { indent: 360 },
    spacing: { after: 70 },
    children: [run(text)],
  });
}

function cell(text, { header = false, width = 25 } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border },
    shading: header ? { fill: navy, type: ShadingType.CLEAR } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: [new Paragraph({ spacing: { after: 0 }, children: [run(text, { bold: header, color: header ? 'FFFFFF' : '263445', size: 17 })] })],
  });
}

function table(headers, rows, widths) {
  const columnWidths = widths || headers.map(() => 100 / headers.length);
  const tableRows = [
    new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, { header: true, width: columnWidths[i] })) }),
    ...rows.map((row) => new TableRow({ cantSplit: true, children: row.map((value, i) => cell(value, { width: columnWidths[i] })) })),
  ];
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: columnWidths.map((w) => Math.round(w * 100)), rows: tableRows });
}

function librarySection(title, rows, dev = false) {
  return [
    heading(title, HeadingLevel.HEADING_2),
    table(['Package', 'Declared version', 'Role in this repository'], rows, [28, 19, 53]),
    ...(dev ? [paragraph('Development dependencies support authoring, type checking, styling, script execution, and tests; they are not assumed to be shipped as application runtime code.', { spacing: { before: 60, after: 100 } })] : []),
  ];
}

const sourceRows = [
  ['Root coordinator', 'package.json', 'Workspace-level scripts: frontend dev/build/typecheck, backend dev/build, consolidated build, seeding.'],
  ['Frontend', 'frontend/package.json', 'Direct runtime and development dependencies for the web application.'],
  ['Backend', 'backend/package.json', 'NestJS API runtime and TypeScript/Jest development tools.'],
  ['Gemini helper', 'helper/package.json', 'ES module Node.js worker; Playwright is its declared runtime dependency.'],
  ['Database', 'supabase/migrations/*.sql', 'PostgreSQL schema, row-level security policies, RPCs, storage, and application migrations.'],
  ['Implementation evidence', 'frontend/src/features/omr/**; backend/src/**; helper/src/server.mjs', 'Confirms how declared tools are used in the source code.'],
  ['SBOM inventory', 'frontend/scripts/generate-sboms.mjs; frontend/docs/research/sbom/*.cdx.json', 'CycloneDX inventories generated from exact lockfile entries, including transitive, development, and optional packages.'],
  ['OMR calibration record', 'frontend/docs/research/omr-validation.md; omr-validation-dataset-template.csv', 'Versioned thresholds, dataset protocol, evaluation metrics, and pending-baseline status.'],
  ['OpenCV asset measurement', 'frontend/scripts/report-opencv-bundle.mjs; frontend/docs/research/opencv-asset-size.json', 'Recorded raw and gzip size of the OpenCV.js runtime artifact.'],
];

const overview = [
  new Paragraph({
    spacing: { before: 1300, after: 220 },
    alignment: AlignmentType.CENTER,
    children: [run('PROJECT KIT', { bold: true, color: blue, size: 24, characterSpacing: 32 })],
  }),
  new Paragraph({
    spacing: { after: 160 },
    alignment: AlignmentType.CENTER,
    children: [run('Technology & Materials Research', { bold: true, color: navy, size: 40 })],
  }),
  new Paragraph({
    spacing: { after: 500 },
    alignment: AlignmentType.CENTER,
    children: [run('Languages, libraries, frameworks, infrastructure, and the client-side OMR pipeline', { color: '52657A', size: 23 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 1000 },
    children: [run('Repository inventory date: 26 October 2026  |  Prepared from declared manifests and implementation files', { color: '64748B', size: 19 })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { bottom: { style: BorderStyle.SINGLE, size: 14, color: blue, space: 1 } },
    spacing: { after: 400 },
    children: [run('Research material for software architecture and implementation review', { italics: true, color: '52657A', size: 20 })],
  }),
  new Paragraph({ children: [], pageBreakBefore: true }),
];

const body = [
  heading('Executive summary'),
  paragraph('Project KIT is organized as a JavaScript/TypeScript application with separate frontend, API, and local browser-helper workspaces. PostgreSQL and Supabase migrations provide the database and access-control layer. Current work adds browser-side OpenCV.js measurements to the optical mark recognition (OMR) flow, using a Web Worker so image processing does not block the main UI thread.'),
  paragraph('This inventory reports direct dependencies declared in the workspace package manifests. It is not a complete list of transitive npm packages. Version ranges are copied from package.json; where a dependency is a local archive, that is stated. Roles are summarized from package names and repository imports/source, and should be read as implementation context rather than a security or quality endorsement.'),
  heading('Research scope and method'),
  table(['Evidence source', 'Repository path', 'What it establishes'], sourceRows, [22, 31, 47]),
  paragraph('The report treats checked-in application code and package manifests as primary evidence. Vendor documentation is used for concise descriptions of technologies, not to infer that every vendor capability is used by Project KIT.'),
  heading('Languages and formats'),
  table(['Language / format', 'Evidence in repository', 'Observed use'], [
    ['TypeScript / TSX', 'frontend/src/**/*.ts(x); backend/src/**/*.ts; scripts/*.ts', 'Main typed application language for the frontend, API, and maintenance scripts. TSX combines TypeScript with React markup.'],
    ['JavaScript / ESM', 'helper/src/**/*.mjs; frontend configuration and scripts', 'Playwright helper process and JavaScript tooling/configuration.'],
    ['SQL (PostgreSQL)', 'supabase/migrations/*.sql; seed and consolidated SQL files', 'Schema, row-level security, functions/RPCs, constraints, data setup, and migration history.'],
    ['CSS', 'frontend/src/app/globals.css; PostCSS/Tailwind configuration', 'Global styles and utility-class build pipeline.'],
    ['JSON', 'package manifests, lockfiles, tsconfig, app configs', 'Dependency declarations, build configuration, and machine-readable data.'],
    ['Shell', 'helper/scripts/*.sh; Dockerfile commands', 'Local process start/stop scripts and container build commands.'],
    ['Dockerfile', 'backend/Dockerfile', 'Container build instructions for the backend.'],
    ['HTML / SVG', 'Next.js rendered UI; OMR templates and public verification file', 'Browser document output, vector OMR template rendering, and static verification content.'],
  ], [21, 34, 45]),
  heading('System architecture at a glance'),
  table(['Layer', 'Primary technology', 'Observed responsibility'], [
    ['Web frontend', 'Next.js 15, React 19, TypeScript', 'Assessment workflow, reporting, exports, scanning UI, server routes, and session-aware application views.'],
    ['Backend API', 'NestJS 9, TypeScript, Express adapter', 'API modules for authentication/session guards, AI services, repositories, health, metrics, CSRF, and OMR support.'],
    ['Local helper', 'Node.js ESM, Playwright', 'Pull-based visible-browser worker that handles Gemini prompts and reports job status/results back to Project KIT.'],
    ['Database and storage', 'Supabase, PostgreSQL, SQL migrations', 'Application records, access policies, storage buckets, and database functions.'],
    ['Cache / rate limits', 'Redis client (ioredis)', 'Backend cache and rate-limiting integration.'],
    ['Document pipeline', 'docx, Mammoth, pdf-parse, JSZip', 'Generate DOCX reports and examination papers; parse uploaded DOCX/PDF materials and ZIP content.'],
  ], [21, 30, 49]),
  heading('Frontend direct runtime libraries'),
  ...librarySection('Application dependencies', frontendDeps),
  ...librarySection('Frontend development dependencies', frontendDev, true),
  heading('Backend API direct libraries'),
  ...librarySection('Backend runtime dependencies', backendDeps),
  ...librarySection('Backend development dependencies', backendDev, true),
  heading('Local helper dependencies'),
  table(['Package', 'Declared version', 'Role in this repository'], helperDeps.map((r) => [...r]), [28, 19, 53]),
  paragraph('The helper manifest requires Node.js >=20.6.0. Its README documents a dedicated visible Chromium profile, a shared server-side token, queue polling, status recovery, and a person-in-the-loop flow when Gemini requires sign-in or another verification step.'),
  heading('Client-side OMR research material'),
  paragraph('The current scanner uses a bundled OpenCV.js runtime through @techstark/opencv-js 4.12.0-release.1. The frontend adapter routes scan analysis through the Project KIT optical engine. That engine batches pixel samples to a module Web Worker, which converts RGBA pixels to grayscale, applies adaptive Gaussian thresholding, and measures bubble fill ratio and local contrast. OpenCV matrix allocations are released after each analysis pass.'),
  paragraph('The scanner worker is instantiated only when analysis is requested. Worker initialization and per-capture analysis durations are returned as diagnostics. A worker error, timeout, or incomplete response fails the OpenCV pass, terminates the failed worker, and leaves the scan in the review-required path; a later attempt can create a fresh worker.'),
  table(['Stage', 'Current implementation evidence', 'Interpretation'], [
    ['Image preparation', 'src/features/omr/engines/native-optical-engine.ts', 'The scanner aligns the sheet/coordinates and builds circle samples for the roll grid and answer bubbles.'],
    ['Pixel analysis', 'src/features/omr/engines/opencv-bubble.worker.ts', 'OpenCV.js measures thresholded dark-pixel fill and contrast per sampled bubble.'],
    ['Worker bridge', 'src/features/omr/engines/opencv-bubble-analysis.ts', 'Transfers pixel buffers to a browser worker; request IDs map results back to the scan.'],
    ['Review and scoring', 'native-optical-engine.ts; OmrCameraModal.tsx; item-response-analysis.ts', 'Multiple or erased marks are flagged as wrong/uncertain for teacher review; persisted item states feed item-analysis summaries.'],
  ], [20, 37, 43]),
  paragraph('Accuracy boundary: optical mark recognition is sensitive to focus, lighting, skew, print scaling, paper quality, erasures, and alignment. The implementation reports measured features and review flags; it does not justify a claim of 100% accuracy. Uncertain or multiple marks should remain reviewable by a teacher, and a production study should measure false accept, false reject, and retake rates on representative sheets and devices.'),
  heading('Declared libraries: complete direct-dependency inventory'),
  paragraph('The tables below include every direct dependency and development dependency declared in the four checked package manifests at the report date. Root coordinator scripts are also listed. Package versions may change after this repository snapshot.'),
  table(['Workspace', 'Script / tool', 'Declared purpose'], [
    ['Root coordinator', 'dev, build, typecheck', 'Forward the common development and verification commands to the frontend.'],
    ['Root coordinator', 'backend:dev, backend:build', 'Start or compile the backend workspace.'],
    ['Root coordinator', 'build:consolidated, seed, seed:demo', 'Consolidated build and Supabase seed workflows.'],
    ['Frontend', 'Next.js, React, Supabase clients, OpenCV.js, document/image parsing/export packages, UI utilities', 'Direct and dev dependency lists are enumerated above from frontend/package.json.'],
    ['Backend', 'NestJS, Supabase client, authentication/security, Redis, validation and serialization', 'Direct and dev dependency lists are enumerated above from backend/package.json.'],
    ['Helper', 'Playwright', 'Automated browser control in helper/package.json.'],
  ], [22, 39, 39]),
  heading('Research maintenance and validation status'),
  bullet('Run `npm run sbom` from the frontend workspace to regenerate CycloneDX SBOMs from the frontend, backend, and helper package lockfiles. The generator includes exact locked transitive, development, and optional package entries.'),
  bullet('The backend README contains scaffold-era Prisma instructions that do not match the current manifest/scripts. For the current database workflow, inspect the Supabase SQL migrations and source rather than relying on those stale instructions.'),
  bullet('The versioned OMR profile and release data-collection/evaluation protocol are in docs/research/omr-validation.md. A labeled photographic dataset has not yet been collected, so accuracy and error rates are explicitly pending measurement.'),
  bullet('Staged scan reviews retain machine choice/state/scores/confidence/reason flags, teacher choice/change, final choice/state, engine, OpenCV diagnostics, and threshold-profile version in the existing JSONB scan record.'),
  bullet('Run `npm run report:opencv-bundle` to measure the source runtime size or pass the emitted runtime asset path. Measurements append to docs/research/opencv-asset-size.json for release history. Worker readiness and analysis duration are recorded at runtime. The OpenCV runtime is isolated behind the scanner worker bridge.'),
  heading('References'),
  paragraph('Repository evidence (primary): frontend/package.json and package-lock.json; backend/package.json and package-lock.json; helper/package.json; root package.json; Supabase SQL migration files; implementation files cited in the report. Repository snapshot reviewed 26 October 2026.'),
  paragraph('Official / primary technical documentation:'),
  ...[
    ['[1] Next.js App Router documentation', 'https://nextjs.org/docs/app'],
    ['[2] React documentation: describing the UI', 'https://react.dev/learn/describing-the-ui'],
    ['[3] TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/'],
    ['[4] Supabase JavaScript reference', 'https://supabase.com/docs/reference/javascript/introduction'],
    ['[5] Supabase SSR/server package selection guidance', 'https://supabase.com/docs/guides/auth/choosing-a-server-package'],
    ['[6] OpenCV.js usage documentation', 'https://docs.opencv.org/5.0/js_tutorials/js_setup/js_usage/js_usage.html'],
    ['[7] OpenCV.js tutorials', 'https://docs.opencv.org/4.5.5/d5/d10/tutorial_js_root.html'],
    ['[8] docx JS/TS document-generation library', 'https://docx.js.org/'],
  ].map(([label, url]) => new Paragraph({ spacing: { after: 80 }, children: [run(`${label}: `, { bold: true }), new TextRun({ text: url, font: 'Aptos', size: 18, color: blue, underline: {} })] })),
  paragraph('Method note: the reference list supports general descriptions of the technologies. Claims about which package versions and workflows Project KIT actually declares are derived from this repository snapshot, not vendor documentation.'),
];

const doc = new Document({
  creator: 'Project KIT',
  title: 'Project KIT Technology and Materials Research',
  subject: 'Repository-based inventory of programming languages, libraries, frameworks, and the client-side OMR pipeline',
  description: 'Research materials compiled from project manifests and source files.',
  styles: {
    default: { document: { run: { font: 'Aptos', size: 20, color: '263445' }, paragraph: { spacing: { after: 100, line: 280 } } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 30, bold: true, color: navy }, paragraph: { spacing: { before: 300, after: 100 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 24, bold: true, color: blue }, paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1000, right: 950, bottom: 1000, left: 950 } } },
    headers: { default: new Header({ children: [] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('Project KIT Technology Research  •  '), new TextRun({ children: [PageNumber.CURRENT], font: 'Aptos', size: 16, color: '64748B' })] })] }) },
    children: [...overview, ...body],
  }],
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, await Packer.toBuffer(doc));
console.log(`Created ${outputPath}`);
