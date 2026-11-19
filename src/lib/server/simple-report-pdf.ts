function pdfText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[•·]/g, '|')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(value: string, width = 100): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? line + ' ' + word : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Dependency-free, multi-page PDF fallback for mobile report downloads. */
export function createSimpleReportPdf(title: string, subtitle: string, lines: string[]): Uint8Array {
  const wrapped = lines.flatMap((line) => wrapLine(String(line || '')));
  const pageLines: string[][] = [];
  for (let index = 0; index < wrapped.length; index += 48) pageLines.push(wrapped.slice(index, index + 48));
  if (!pageLines.length) pageLines.push([]);

  const objects: string[] = [];
  const pageObjectIds = pageLines.map((_, index) => 4 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageLines.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

  pageLines.forEach((items, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    const commands: string[] = [
      `BT /F1 15 Tf 40 760 Td (${pdfText(title)}) Tj ET`,
      `BT /F1 9 Tf 40 742 Td (${pdfText(subtitle)}) Tj ET`,
      'BT /F1 9 Tf 40 720 Td',
    ];
    items.forEach((line, lineIndex) => {
      if (lineIndex > 0) commands.push('0 -13 Td');
      commands.push(`(${pdfText(line)}) Tj`);
    });
    commands.push('ET');
    commands.push(`BT /F1 8 Tf 520 24 Td (Page ${index + 1} of ${pageLines.length}) Tj ET`);
    const stream = commands.join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = new TextEncoder().encode(pdf).length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
