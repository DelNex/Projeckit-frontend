/**
 * Project KIT — Client/Server Lesson Text Extractor
 * Extracts readable lesson text from PDF, DOCX, PPTX, and TXT files.
 */

export async function extractTextFromFile(file: File): Promise<string> {
  const filename = file.name.toLowerCase();

  // 1. Plain Text or Markdown
  if (filename.endsWith('.txt') || filename.endsWith('.md') || file.type.startsWith('text/')) {
    return await file.text();
  }

  // 2. Binary files (PDF, DOCX, PPTX)
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return extractTextFromBuffer(buffer, filename);
}

export function extractTextFromBuffer(buffer: Buffer, filename: string): string {
  const lowerName = filename.toLowerCase();

  // If text file
  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return buffer.toString('utf-8');
  }

  // If DOCX or PPTX: XML-based text
  if (lowerName.endsWith('.docx') || lowerName.endsWith('.pptx')) {
    const raw = buffer.toString('utf-8', 0, Math.min(buffer.length, 5000000));
    // Extract XML text enclosed in <w:t>...</w:t> or <a:t>...</a:t>
    const xmlMatches = raw.match(/<(?:\w+:)?t[^>]*>([^<]+)<\/(?:\w+:)?t>/g);
    if (xmlMatches && xmlMatches.length > 0) {
      const texts = xmlMatches.map((m) => m.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
      const combined = texts.join(' ');
      if (combined.length > 100) {
        return cleanExtractedText(combined);
      }
    }
  }

  // PDF or binary fallback: Extract readable UTF-8 / ASCII runs
  const binaryString = buffer.toString('latin1');
  
  // Extract text within PDF parentheses (BT ... ET blocks) or readable strings
  const pdfTextMatches = binaryString.match(/\(([^\(\)]{3,})\)\s*T[jJ]/g);
  if (pdfTextMatches && pdfTextMatches.length > 0) {
    const extracted = pdfTextMatches
      .map((m) => {
        const inner = m.match(/\((.+)\)/);
        return inner ? inner[1] : '';
      })
      .filter((s) => s.length > 2)
      .join(' ');
    if (extracted.length > 100) {
      return cleanExtractedText(extracted);
    }
  }

  // Generic readable ASCII extraction
  const cleanAscii = binaryString
    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
    .replace(/\s{3,}/g, '\n')
    .trim();

  // Filter out noisy fragments
  const lines = cleanAscii
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 20 && /[a-zA-Z]{3,}/.test(l));

  const result = lines.join('\n');
  return cleanExtractedText(result.length > 100 ? result : cleanAscii.slice(0, 30000));
}

function cleanExtractedText(text: string): string {
  return text
    .replace(/\\r/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

