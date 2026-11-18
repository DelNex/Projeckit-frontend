import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test.setTimeout(360_000);

test('Chrome validates labeled answers and records diagnostics for every image fixture', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/omr-validation');
  const result = page.getByTestId('omr-browser-result');
  await expect(result).not.toHaveText('RUNNING', { timeout: 60_000 });
  const report = JSON.parse(await result.textContent() || '{}') as {
    outcome: string;
    accuracy?: number;
    correct?: number;
    total?: number;
    nullCount?: number;
    mismatches?: unknown[];
    fiducialDetected?: boolean;
    openCvDiagnostics?: { status?: string };
    error?: string;
  };

  expect(report, `Browser decoded ${report.correct}/${report.total}; nulls=${report.nullCount}; OpenCV status: ${report.openCvDiagnostics?.status}`).toMatchObject({
    outcome: 'PASS',
    correct: 60,
    total: 60,
    nullCount: 0,
    mismatches: [],
    fiducialDetected: true,
    openCvDiagnostics: { status: 'used' },
  });
  expect(report.accuracy).toBe(1);
  expect(pageErrors).toEqual([]);

  const fixturesDir = path.resolve('src/features/omr/__tests__/fixtures');
  const projectImages = fs.readdirSync(fixturesDir)
    .filter((name) => /\.(png|jpe?g|webp|bmp|tiff?|svg)$/i.test(name))
    .map((name) => path.join(fixturesDir, name));
  const attachmentPaths = (process.env.OMR_ATTACHMENT_FILES || '')
    .split(path.delimiter)
    .filter(Boolean);
  const files = [...projectImages, ...attachmentPaths];

  await page.getByTestId('omr-file-input').setInputFiles(files);
  const uploadResults = page.getByTestId('omr-upload-results');
  await expect.poll(async () => {
    const text = await uploadResults.textContent();
    return Boolean(text && !text.includes('"outcome":"RUNNING"'));
  }, { timeout: 300_000 }).toBe(true);
  const scanReports = JSON.parse(await uploadResults.textContent() || '[]') as Array<{
    name: string;
    fiducialDetected?: boolean;
    detectedItems?: number;
    errorCode?: string | null;
    failedRegion?: unknown;
    status?: string;
    openCv?: string;
    correct?: number | null;
    compared?: number | null;
    accuracy?: number | null;
    nullCount?: number;
    validation?: {
      compared: number;
      correct: number;
      nullCount: number;
      expectedNullCount: number;
      mismatches: unknown[];
      accuracy: number | null;
    } | null;
    outcome?: string;
    error?: string;
  }>;

  // Persist the full machine-readable result before assertions so failed runs
  // still upload their diagnostics as a GitHub Actions artifact.
  const artifactPath = path.resolve('.artifacts/omr-validation/omr-results.json');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || null,
    fixtureCount: scanReports.length,
    primaryRealWorldFixture: report,
    scans: scanReports,
  }, null, 2) + '\n');

  expect(scanReports).toHaveLength(files.length);
  expect(scanReports.filter((item) => item.outcome === 'ERROR')).toEqual([]);

  const labeledFixtures = [
    'real_world_scan.png',
    'marked_60.png',
    'marked_60.svg',
    'rotated_60.png',
    'blank_sheet.png',
    'blank_sheet.svg',
    'sample_60_blank_half.png',
    'sample_60_blank_half.svg',
  ];
  for (const name of labeledFixtures) {
    const fixture = scanReports.find((item) => item.name === name);
    expect(fixture, `${name} was not tested`).toBeDefined();
    expect(fixture?.validation, `${name} has no expected-answer comparison`).not.toBeNull();
    expect(fixture?.validation?.mismatches, `${name} contains wrong or missing answers`).toEqual([]);
    expect(fixture?.validation?.correct, `${name} answer count mismatch`).toBe(fixture?.validation?.compared);
    expect(fixture?.validation?.accuracy, `${name} must match every expected answer`).toBe(1);
    expect(
      fixture?.validation?.nullCount,
      `${name} null-answer count differs from the explicit answer key`,
    ).toBe(fixture?.validation?.expectedNullCount);
  }

  console.log('OMR full diagnostic report:', JSON.stringify(scanReports));
});
