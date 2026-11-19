import { expect, test } from '@playwright/test';

test('production browser performs OCR using only same-origin assets', async ({ page }) => {
  const ocrRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/ocr/')) ocrRequests.push(request.url());
  });

  await page.goto('/omr-validation');
  await page.addScriptTag({ url: '/ocr/tesseract.min.js' });

  const result = await page.evaluate(async () => {
    const tesseract = (window as unknown as {
      Tesseract: {
        createWorker: (langs: string[], oem: number, options: Record<string, unknown>) => Promise<{
          recognize: (image: Blob) => Promise<{ data: { text: string; confidence: number } }>;
          terminate: () => Promise<void>;
        }>;
      };
    }).Tesseract;

    const canvas = document.createElement('canvas');
    canvas.width = 1800;
    canvas.height = 360;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create OCR fixture canvas.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111111';
    context.font = 'bold 88px Arial';
    context.fillText('PROJECT KIT LOCAL OCR TEST', 50, 205);

    const image = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode OCR fixture image.')), 'image/png');
    });

    const worker = await tesseract.createWorker(['eng', 'tgl'], 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      workerBlobURL: false,
    });
    try {
      const recognized = await worker.recognize(image);
      return { text: recognized.data.text, confidence: recognized.data.confidence };
    } finally {
      await worker.terminate();
    }
  });

  expect(result.text.toUpperCase()).toContain('PROJECT KIT');
  expect(result.text.toUpperCase()).toContain('LOCAL OCR');
  expect(result.confidence).toBeGreaterThan(60);
  expect(ocrRequests.length).toBeGreaterThan(0);
  expect(ocrRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(ocrRequests.some((url) => /cdn\.jsdelivr|unpkg\.com|tessdata\.projectnaptha/i.test(url))).toBe(false);
});
