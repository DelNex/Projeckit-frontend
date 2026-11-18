import { expect, test } from '@playwright/test';

test('Chrome decodes the angled phone photo with the real browser OpenCV worker', async ({ page }) => {
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

  expect(report, `Browser decoded ${report.correct}/${report.total}; OpenCV status: ${report.openCvDiagnostics?.status}`).toMatchObject({
    outcome: 'PASS',
    correct: 60,
    total: 60,
    fiducialDetected: true,
    openCvDiagnostics: { status: 'used' },
  });
  expect(report.accuracy).toBeGreaterThanOrEqual(0.95);
  expect(pageErrors).toEqual([]);
});
