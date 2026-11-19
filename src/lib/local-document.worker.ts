/// <reference lib="webworker" />
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

type WorkerRequest = { id: string; file: File };
type WorkerResponse = { id: string; text?: string; error?: string };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const MAX_CHARACTERS = 900_000;

function normalizeText(text: string): string {
  const seen = new Set<string>();
  return text
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/[\t ]+/g, ' ').trim())
    .filter((paragraph) => {
      if (!paragraph) return true;
      if (seen.has(paragraph)) return false;
      seen.add(paragraph);
      return true;
    })
    .join('\n\n')
    .trim();
}

async function extractPdf(file: File): Promise<string> {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const pages: string[] = [];
  let characterCount = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => {
        if (!('str' in item)) return '';
        return `${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}`;
      }).join('');
      const section = `[Page ${pageNumber}]\n${pageText.trim()}`;
      characterCount += section.length;
      if (characterCount > MAX_CHARACTERS) {
        throw new Error(`'${file.name}' exceeds the 900,000-character AI source limit. Split it by chapter before generating an exam.`);
      }
      pages.push(section);
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  const text = pages.join('\n\n').trim();
  if (!text) {
    throw new Error(`No selectable text was found in '${file.name}'. It may be a scanned PDF; OCR support is required before this file can be used.`);
  }
  return text;
}

async function extractDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value || '';
}

async function extractPptx(file: File): Promise<string> {
  const archive = await JSZip.loadAsync(file);
  const paths = Object.keys(archive.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
  const slides: string[] = [];

  for (const [index, path] of paths.entries()) {
    const xml = await archive.file(path)?.async('text');
    if (!xml) continue;
    const text = Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g))
      .map((match) => (match[1] || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_entity, value) => String.fromCodePoint(Number(value)))
        .replace(/&#x([\da-f]+);/gi, (_entity, value) => String.fromCodePoint(parseInt(value, 16))))
      .filter(Boolean)
      .join(' ');
    if (text.trim()) slides.push(`[Slide ${index + 1}]\n${text}`);
  }
  return slides.join('\n\n');
}

async function extract(file: File): Promise<string> {
  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'pdf') return extractPdf(file);
  if (extension === 'docx') return extractDocx(file);
  if (extension === 'pptx') return extractPptx(file);
  if (extension === 'txt' || extension === 'md') return file.text();
  throw new Error(`'${file.name}' is not supported. Use PDF, DOCX, PPTX, TXT, or Markdown.`);
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, file } = event.data;
  try {
    const text = normalizeText(await extract(file));
    if (text.length > MAX_CHARACTERS) {
      throw new Error(`'${file.name}' contains more than 900,000 readable characters. Split it by chapter so no source content is silently discarded.`);
    }
    if (!text) throw new Error(`No readable text was found in '${file.name}'.`);
    const response: WorkerResponse = { id, text };
    workerScope.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      id,
      error: error instanceof Error ? error.message : 'Document extraction failed.',
    };
    workerScope.postMessage(response);
  }
};

export {};
