import { expect, test } from '@playwright/test';
import path from 'node:path';

test('extracts a scanned PDF with the locally bundled OCR runtime', async ({ page }) => {
  test.setTimeout(90_000);
  const externalRequests: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('[ocr browser console]', message.text());
  });
  page.on('pageerror', (error) => console.log('[ocr page error]', error.message));
  page.on('requestfailed', (request) => console.log('[ocr request failed]', request.url(), request.failure()?.errorText));
  page.on('response', (response) => {
    if (response.url().includes('/ocr/') && !response.ok()) console.log('[ocr asset failed]', response.status(), response.url());
  });
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:3100')) externalRequests.push(request.url());
  });

  await page.goto('/ocr-validation');
  await page.getByLabel('Scanned PDF fixture').setInputFiles(
    path.join(process.cwd(), 'src/lib/server/__tests__/fixtures/scanned_image.pdf')
  );

  const output = page.getByTestId('ocr-result');
  await expect.poll(async () => {
    const extracted = (await output.textContent())?.trim();
    if (extracted) return extracted;
    return (await page.locator('p[role="alert"]').textContent())?.trim() || '';
  }, { timeout: 60_000 }).not.toBe('');

  const errorCount = await page.getByRole('alert').count();
  const extractionError = errorCount ? (await page.getByRole('alert').textContent())?.trim() || null : null;
  expect(extractionError).toBeNull();
  const text = await output.textContent();
  expect((text || '').replace(/\[Page \d+\]/g, '').trim().length).toBeGreaterThan(20);
  expect(text).toContain('[local OCR checked]');
  expect(externalRequests).toEqual([]);
});
