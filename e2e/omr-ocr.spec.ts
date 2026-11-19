import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { expect, test } from '@playwright/test';

function createImageOnlyPdf(pngBytes: Buffer): Buffer {
  const png = PNG.sync.read(pngBytes);
  const rgb = Buffer.alloc(png.width * png.height * 3);
  for (let source = 0, target = 0; source < png.data.length; source += 4) {
    rgb[target++] = png.data[source];
    rgb[target++] = png.data[source + 1];
    rgb[target++] = png.data[source + 2];
  }
  const compressed = deflateSync(rgb);
  const content = Buffer.from('q\n' + png.width + ' 0 0 ' + png.height + ' 0 0 cm\n/Im0 Do\nQ\n');
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + png.width + ' ' + png.height + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([
      Buffer.from('<< /Type /XObject /Subtype /Image /Width ' + png.width + ' /Height ' + png.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ' + compressed.length + ' >>\nstream\n'),
      compressed,
      Buffer.from('\nendstream'),
    ]),
    Buffer.concat([
      Buffer.from('<< /Length ' + content.length + ' >>\nstream\n'),
      content,
      Buffer.from('endstream'),
    ]),
  ];

  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n')];
  const offsets: number[] = [];
  let offset = parts[0].length;
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(offset);
    const object = Buffer.concat([
      Buffer.from((index + 1) + ' 0 obj\n'),
      objects[index],
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(object);
    offset += object.length;
  }

  const xrefOffset = offset;
  const xref = 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n' +
    offsets.map((value) => String(value).padStart(10, '0') + ' 00000 n \n').join('');
  parts.push(Buffer.from(xref + 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF'));
  return Buffer.concat(parts);
}

test('production local document worker OCRs both photos and image-only PDFs using same-origin assets', async ({ page }) => {
  test.setTimeout(240_000);
  const ocrRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/ocr/')) ocrRequests.push(request.url());
  });

  await page.goto('/omr-validation');
  const fixturePath = path.resolve('src/features/omr/__tests__/fixtures/real_world_scan.png');
  expect(fs.existsSync(fixturePath)).toBe(true);
  const image = fs.readFileSync(fixturePath);
  const pdf = createImageOnlyPdf(image);
  const output = page.getByTestId('ocr-browser-result');
  const input = page.getByTestId('ocr-file-input');

  for (const file of [
    { name: 'real_world_scan_photo.png', mimeType: 'image/png', buffer: image },
    { name: 'real_world_scan_image_only.pdf', mimeType: 'application/pdf', buffer: pdf },
  ]) {
    await input.setInputFiles(file);
    await expect.poll(async () => {
      const value = await output.textContent();
      return Boolean(value && value !== 'RUNNING' && value !== 'WAITING');
    }, { timeout: 180_000 }).toBe(true);
    const result = JSON.parse(await output.textContent() || '{}') as {
      outcome: string;
      text?: string;
      error?: string;
      lowConfidencePages?: number[];
    };
    expect(result, result.error || 'Local OCR did not complete').toMatchObject({ outcome: 'PASS' });
    expect((result.text || '').length).toBeGreaterThan(10);
    if (file.name.endsWith('.pdf')) expect(result.text).toContain('[Page 1]');
  }

  expect(ocrRequests.length).toBeGreaterThan(0);
  expect(ocrRequests.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(ocrRequests.some((url) => /cdn\.jsdelivr|unpkg\.com|tessdata\.projectnaptha/i.test(url))).toBe(false);
});
