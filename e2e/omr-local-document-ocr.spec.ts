import { expect, test } from '@playwright/test';
import path from 'node:path';

test('extracts a scanned PDF with the locally bundled OCR runtime', async ({ page }) => {
  test.setTimeout(150_000);
  const externalRequests: string[] = [];
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
    return (await page.getByRole('alert').textContent())?.trim() || '';
  }, { timeout: 120_000 }).not.toBe('');

  const extractionError = await page.getByRole('alert').textContent().catch(() => null);
  expect(extractionError).toBeNull();
  const text = await output.textContent();
  expect((text || '').replace(/\[Page \d+\]/g, '').trim().length).toBeGreaterThan(30);
  expect(text).toContain('[local OCR checked]');
  expect(externalRequests).toEqual([]);
});
