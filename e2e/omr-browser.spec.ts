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

  // The primary browser acceptance test must use the real phone photograph only.
  // Synthetic images remain covered by focused unit/regression tests, but they
  // must never inflate the real-world browser accuracy result.
  const realWorldFixture = path.resolve(
    'src/features/omr/__tests__/fixtures/real_world_scan.png',
  );
  expect(fs.existsSync(realWorldFixture), 'real_world_scan.png is required').toBe(true);
  const files = [realWorldFixture];
  expect(files.map((file) => path.basename(file))).toEqual(['real_world_scan.png']);

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
    answers?: Array<{ state: string }>;
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

  expect(scanReports).toHaveLength(1);
  const realWorld = scanReports[0];
  expect(realWorld.name).toBe('real_world_scan.png');
  expect(realWorld).toMatchObject({
    fiducialDetected: true,
    detectedItems: 60,
    status: 'PROCESSED',
    openCv: 'used',
    nullCount: 0,
  });
  expect(realWorld.validation).toMatchObject({
    compared: 60,
    correct: 60,
    nullCount: 0,
    expectedNullCount: 0,
    mismatches: [],
    accuracy: 1,
  });
  expect(
    realWorld.answers?.every((answer) => answer.state === 'MARKED'),
    'Every real-world answer must be classified as a verified mark',
  ).toBe(true);

  // Assert the primary real-world capture only after every fixture has been scanned
  // and its complete diagnostic report has been persisted.
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

  expect(scanReports).toHaveLength(files.length);
  expect(scanReports.filter((item) => item.outcome === 'ERROR')).toEqual([]);

  console.log('OMR full diagnostic report:', JSON.stringify(scanReports));
});
