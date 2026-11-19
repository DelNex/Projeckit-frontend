/// <reference lib="webworker" />
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWorker as createOcrWorker } from 'tesseract.js';
import { isLikelyScannedPdfPage } from './pdf-page-analysis';

type Request = { id: string; file: File };
type Progress = { stage: 'extracting' | 'ocr'; progress: number; message: string; pageNumber?: number; pageCount?: number };
type Response = { id: string; type: 'progress' | 'result' | 'error'; text?: string; error?: string; lowConfidencePages?: number[]; progress?: Progress };
type OcrWorker = Awaited<ReturnType<typeof createOcrWorker>>;
const scope = self as unknown as DedicatedWorkerGlobalScope;
const MAX_CHARACTERS = 900_000;
const MAX_OCR_PIXELS = 12_000_000;
const LOW_CONFIDENCE = 55;

function progress(id: string, value: Progress) {
  scope.postMessage({ id, type: 'progress', progress: value } satisfies Response);
}

function normalizeText(text: string): string {
  const seen = new Set<string>();
  return text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').split(/\n\s*\n/)
    .map((part) => part.replace(/[\t ]+/g, ' ').trim())
    .filter((part) => !part || !seen.has(part) && Boolean(seen.add(part)))
    .join('\n\n').trim();
}

async function createLocalOcr(id: string, pageCount: number, currentPage: () => number): Promise<OcrWorker> {
  progress(id, { stage: 'ocr', progress: 0, pageCount, message: 'Loading local OCR engine and English/Tagalog models…' });
  return createOcrWorker(['eng', 'tgl'], 1, {
    workerPath: new URL('/ocr/worker.min.js', scope.location.origin).toString(),
    corePath: new URL('/ocr/core', scope.location.origin).toString(),
    langPath: new URL('/ocr/lang', scope.location.origin).toString(),
    workerBlobURL: false,
    logger: (event) => {
      if (event.status !== 'recognizing text' || typeof event.progress !== 'number') return;
      const pageNumber = currentPage();
      progress(id, {
        stage: 'ocr',
        progress: Math.min(99, Math.round(((pageNumber - 1 + event.progress) / Math.max(1, pageCount)) * 100)),
        pageNumber,
        pageCount,
        message: 'Reading scanned page ' + pageNumber + ' of ' + pageCount + '…',
      });
    },
  });
}

async function recognizePdfPage(page: pdfjs.PDFPageProxy, worker: OcrWorker) {
  if (typeof OffscreenCanvas === 'undefined') throw new Error('This browser cannot render PDF pages for local OCR. Update your browser or use a text-based PDF.');
  const initial = page.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.sqrt(MAX_OCR_PIXELS / (initial.width * initial.height)));
  const viewport = page.getViewport({ scale });
  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Could not prepare a canvas for local OCR.');
  await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
  const image = await canvas.convertToBlob({ type: 'image/png' });
  const result = await worker.recognize(image);
  return { text: result.data.text.trim(), confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : 0 };
}

async function extractPdf(file: File, id: string) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, useSystemFonts: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  const lowConfidencePages: number[] = [];
  const imageOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject]);
  let ocr: OcrWorker | null = null;
  let currentPage = 1;
  let chars = 0;
  try {
    for (let number = 1; number <= pdf.numPages; number++) {
      currentPage = number;
      progress(id, { stage: 'extracting', progress: Math.round((number - 1) / pdf.numPages * 100), pageNumber: number, pageCount: pdf.numPages, message: 'Reading PDF page ' + number + ' of ' + pdf.numPages + '…' });
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        const selectable = content.items.map((item) => !('str' in item) ? '' : item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ')).join('').trim();
        const operators = await page.getOperatorList();
        const imageCount = operators.fnArray.filter((op) => imageOps.has(op)).length;
        let text = selectable;
        if (isLikelyScannedPdfPage({ textLength: selectable.length, imageOperatorCount: imageCount })) {
          if (!ocr) ocr = await createLocalOcr(id, pdf.numPages, () => currentPage);
          const result = await recognizePdfPage(page, ocr);
          text = result.text;
          if (!text || result.confidence < LOW_CONFIDENCE) lowConfidencePages.push(number);
        }
        const section = '[Page ' + number + ']\n' + text;
        chars += section.length;
        if (chars > MAX_CHARACTERS) throw new Error("'" + file.name + "' exceeds the 900,000-character AI source limit. Split it by chapter before generating an exam.");
        pages.push(section);
      } finally { page.cleanup(); }
    }
  } finally {
    if (ocr) await ocr.terminate().catch(() => undefined);
    await pdf.destroy();
  }
  const text = pages.join('\n\n').trim();
  if (!text || !text.replace(/\[Page \d+\]/g, '').trim()) throw new Error("No readable text was extracted from '" + file.name + "'. Try a clearer source.");
  return { text, lowConfidencePages };
}

async function extractImage(file: File, id: string) {
  const ocr = await createLocalOcr(id, 1, () => 1);
  try {
    const result = await ocr.recognize(file);
    const text = result.data.text.trim();
    if (!text) throw new Error("No readable text was found in '" + file.name + "'. Try a clearer or higher-resolution image.");
    const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : 0;
    return { text, lowConfidencePages: confidence < LOW_CONFIDENCE ? [1] : [] };
  } finally { await ocr.terminate().catch(() => undefined); }
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value || '';
}

async function extractPptx(file: File): Promise<string> {
  const archive = await JSZip.loadAsync(file);
  const paths = Object.keys(archive.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
  const slides: string[] = [];
  for (const [index, path] of paths.entries()) {
    const xml = await archive.file(path)?.async('text');
    if (!xml) continue;
    const text = Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map((match) => (match[1] || '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_e, value) => String.fromCodePoint(Number(value)))
      .replace(/&#x([\da-f]+);/gi, (_e, value) => String.fromCodePoint(parseInt(value, 16))))
      .filter(Boolean).join(' ');
    if (text.trim()) slides.push('[Slide ' + (index + 1) + ']\n' + text);
  }
  return slides.join('\n\n');
}

async function extract(file: File, id: string) {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return extractPdf(file, id);
  if (file.type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'].includes(extension || '')) return extractImage(file, id);
  let text = '';
  if (extension === 'docx') text = await extractDocx(file);
  else if (extension === 'pptx') text = await extractPptx(file);
  else if (extension === 'txt' || extension === 'md') text = await file.text();
  else throw new Error("'" + file.name + "' is not supported. Use PDF, DOCX, PPTX, TXT, Markdown, or an image.");
  return { text, lowConfidencePages: [] as number[] };
}

scope.onmessage = async (event: MessageEvent<Request>) => {
  const { id, file } = event.data;
  try {
    const extracted = await extract(file, id);
    const text = normalizeText(extracted.text);
    if (text.length > MAX_CHARACTERS) throw new Error("'" + file.name + "' contains more than 900,000 readable characters. Split it by chapter so no source content is silently discarded.");
    if (!text) throw new Error("No readable text was found in '" + file.name + "'.");
    scope.postMessage({ id, type: 'result', text, lowConfidencePages: extracted.lowConfidencePages } satisfies Response);
  } catch (error) {
    scope.postMessage({ id, type: 'error', error: error instanceof Error ? error.message : 'Document extraction failed.' } satisfies Response);
  }
};

export {};
