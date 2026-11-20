import { expect, test } from '@playwright/test';

test('lesson OCR validation uses backend jobs and does not load browser OCR assets', async ({ page }) => {
  test.setTimeout(90_000);
  const jobs = new Map<string, { name: string; text: string }>();
  const requests: string[] = [];
  let nextJob = 0;

  await page.route('**/api/backend/ai/lesson-extraction/jobs', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const id = '00000000-0000-4000-8000-' + String(++nextJob).padStart(12, '0');
    const fixture = nextJob === 1
      ? { name: 'photosynthesis_lesson_photo.png', text: 'PHOTOSYNTHESIS. Plants use light energy to make chemical energy.' }
      : nextJob === 2
        ? { name: 'photosynthesis_lesson_scanned.pdf', text: '[Page 1]\\nPHOTOSYNTHESIS. Carbon dioxide and water produce glucose and oxygen.' }
        : { name: 'real_world_scan_photo.png', text: 'Lesson notes. Learning objectives and classroom activity.' };
    jobs.set(id, fixture);
    requests.push('POST');
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ jobs: [{ id, fileName: fixture.name, status: 'queued' }] }) });
  });

  await page.route('**/api/backend/ai/lesson-extraction/jobs/*', async (route) => {
    const id = route.request().url().split('/').pop() || '';
    const fixture = jobs.get(id);
    if (!fixture) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Job not found.' }) });
    requests.push('GET');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id,
        status: 'completed',
        progress: { stage: 'completed', percent: 100, label: 'Lesson document is ready' },
        documents: [{ name: fixture.name, text: fixture.text, lowConfidencePages: [] }],
      }),
    });
  });

  const browserOcrRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/ocr/')) browserOcrRequests.push(request.url());
  });

  await page.goto('/omr-validation');
  const output = page.getByTestId('ocr-browser-result');
  const input = page.getByTestId('ocr-file-input');

  const files = [
    { name: 'photosynthesis_lesson_photo.png', mimeType: 'image/png', buffer: Buffer.from('photo fixture') },
    { name: 'photosynthesis_lesson_scanned.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test fixture') },
    { name: 'real_world_scan_photo.png', mimeType: 'image/png', buffer: Buffer.from('scan fixture') },
  ];

  for (const file of files) {
    await input.setInputFiles(file);
    await expect.poll(async () => {
      const value = await output.textContent();
      return Boolean(value && value !== 'RUNNING' && value !== 'WAITING');
    }).toBe(true);
    const result = JSON.parse(await output.textContent() || '{}') as { outcome: string; text?: string; error?: string };
    expect(result, result.error || 'Server extraction result was not returned').toMatchObject({ outcome: 'PASS' });
    expect((result.text || '').length).toBeGreaterThan(10);
  }

  expect(requests.filter((method) => method === 'POST')).toHaveLength(3);
  expect(requests.filter((method) => method === 'GET')).toHaveLength(3);
  expect(browserOcrRequests).toHaveLength(0);
});
