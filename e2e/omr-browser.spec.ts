import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test.setTimeout(360_000);

test('Chrome processes every project image fixture and any supplied attachments', async ({ page }) => {
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
    fiducialDetected?: boolean;
    openCvDiagnostics?: { status?: string };
    error?: string;
  };

  // Keep scanning every fixture and persist diagnostics even if the primary photo fails.

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
    failedRegion?: string | null;
    status?: string;
    openCv?: string;
    correct?: number | null;
    compared?: number | null;
    accuracy?: number | null;
    outcome?: string;
    error?: string;
  }>;

  const artifactPath = path.resolve('.artifacts/omr-validation/omr-results.json');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || null,
    primaryRealWorldFixture: report,
    fixtureCount: scanReports.length,
    scans: scanReports,
    pageErrors,
  }, null, 2) + '\n');

  expect(scanReports).toHaveLength(files.length);
  expect(scanReports.filter((item) => item.outcome === 'ERROR')).toEqual([]);
  expect(report, `Browser decoded ${report.correct}/${report.total}; OpenCV status: ${report.openCvDiagnostics?.status}`).toMatchObject({
    outcome: 'PASS',
    correct: 60,
    total: 60,
    fiducialDetected: true,
    openCvDiagnostics: { status: 'used' },
  });
  expect(report.accuracy).toBe(1);
  expect(report.correct).toBe(report.total);
  expect(pageErrors).toEqual([]);
  // Unknown-key fixtures are coverage-only; never report an invented accuracy for them.
  for (const item of scanReports.filter((entry) => entry.compared == null)) {
    expect(item.correct, `${item.name} has no reviewed answer key`).toBeNull();
    expect(item.accuracy, `${item.name} must not claim unmeasured accuracy`).toBeNull();
  }
  console.log('OMR image scan report:', JSON.stringify(scanReports.map(({ name, fiducialDetected, detectedItems, errorCode, failedRegion, status, openCv, correct, compared, accuracy, outcome }) => ({
    name, fiducialDetected, detectedItems, errorCode, failedRegion, status, openCv, correct, compared, accuracy, outcome,
  }))));

  const knownPhoto = scanReports.find((item) => item.name === 'codex-clipboard-ff4ca3c4-51cd-4e8c-864e-6fcfa459682a.png');
  if (knownPhoto) expect(knownPhoto).toMatchObject({ fiducialDetected: true, detectedItems: 60, correct: 60, compared: 60, accuracy: 1 });
  for (const name of ['real_world_scan.png', 'marked_60.png', 'marked_60.svg', 'rotated_60.png']) {
    const fixture = scanReports.find((item) => item.name === name);
    expect(fixture, `${name} was not tested`).toBeDefined();
    expect(fixture).toMatchObject({ fiducialDetected: true, openCv: 'used', correct: 60, compared: 60, accuracy: 1 });
  }
  const previewScreenshot = scanReports.find((item) => item.name === 'codex-clipboard-b4f9a904-9496-4967-97e7-0618ae91df1c.png');
  if (previewScreenshot) expect(previewScreenshot).toMatchObject({ fiducialDetected: false, status: 'VERIFICATION_REQUIRED' });
});
