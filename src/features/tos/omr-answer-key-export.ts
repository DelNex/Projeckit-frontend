/**
 * Project KIT — OMR Master Answer Key Exporter
 * Generates DepEd-compliant OMR Answer Sheet with correct answers pre-shaded.
 * Supports:
 * 1. Automatic Printing (triggers window.print() on vector OMR sheet / Save as PDF)
 * 2. Transform into Word (.docx) with embedded high-resolution master OMR sheet & reference table
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  AlignmentType,
  PageOrientation,
  HeadingLevel,
} from 'docx';
import { TosDocument } from '@/types/tos';
import { ExamQuestion } from '@/lib/exam-types';
import { generateCanonicalGeometry } from '../omr/geometry/canonical-geometry';
import { CanonicalOmrGeometry } from '../omr/geometry/geometry-types';
import { renderOmrMasterSvg } from '../omr/rendering/svg-renderer';
import { A5_TWO_UP_PRINT_SIZE } from '../omr/rendering/personalized-print-layout';
import { downloadBlob } from './word-export';

export interface OmrAnswerKeyExportOptions {
  schoolName?: string;
  examDate?: string;
}

/**
 * Builds the canonical geometry and filled-out SVG answer key.
 */
export function buildOmrAnswerKeyData(
  tos: TosDocument,
  questions: ExamQuestion[],
  options: OmrAnswerKeyExportOptions = {}
): {
  geometry: CanonicalOmrGeometry;
  svgContent: string;
  answerKey: Record<number, string>;
  isHalfSheet: boolean;
  itemCount: number;
  fullTitle: string;
} {
  const itemCount = questions.length || tos.target_items || 30;
  const examDate = options.examDate || new Date().toISOString().split('T')[0];
  const fullTitle = tos.description || `${tos.exam_type || 'Examination'} in ${tos.subject}`;

  // Map correct answers
  const answerKey: Record<number, string> = {};
  questions.forEach((q, idx) => {
    const num = q.item_number || idx + 1;
    if (q.correct_answer) {
      answerKey[num] = q.correct_answer;
    }
  });

  const geometry = generateCanonicalGeometry({
    assessmentId: (tos.assessment_id || tos.id || 'EXAM').replace(/[^0-9A-Za-z]/g, '').slice(0, 10),
    title: fullTitle,
    subject: tos.subject,
    section: tos.section || '',
    schoolYear: tos.school_year,
    term: tos.term,
    schoolName: options.schoolName || '',
    itemCount,
    classSize: 50,
    choices: ['A', 'B', 'C', 'D'],
  });

  const isHalfSheet = geometry.sheetFormat === 'HALF';

  const svgContent = renderOmrMasterSvg(geometry, {
    isAnswerKey: true,
    answerKey,
    examDate,
    schoolName: options.schoolName,
    subject: tos.subject,
    term: tos.term,
    assessmentTitle: fullTitle,
    section: tos.section || undefined,
    totalPoints: itemCount,
    learnerName: 'TEACHER MASTER KEY',
  });

  return {
    geometry,
    svgContent,
    answerKey,
    isHalfSheet,
    itemCount,
    fullTitle,
  };
}

/**
 * Automatically opens the browser print preview for immediate printing or saving as PDF.
 */
export function printOmrAnswerKey(
  tos: TosDocument,
  questions: ExamQuestion[],
  options: OmrAnswerKeyExportOptions = {}
): void {
  const { geometry, svgContent, isHalfSheet, fullTitle } = buildOmrAnswerKeyData(
    tos,
    questions,
    options
  );

  let pagesHtml = '';

  if (isHalfSheet) {
    // 2 half sheets side by side on A4 landscape (297 x 210 mm)
    pagesHtml = `
      <div class="omr-print-page-landscape">
        <div class="omr-sheet-half">${svgContent}</div>
        <div class="omr-cut-line"></div>
        <div class="omr-sheet-half">${svgContent}</div>
      </div>
    `;
  } else {
    // 1 full sheet on A4 portrait (210 x 297 mm)
    pagesHtml = `<div class="omr-print-page-portrait">${svgContent}</div>`;
  }

  const pageSizeCss = isHalfSheet ? 'A4 landscape' : 'A4 portrait';

  const printHtml = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${fullTitle} — OMR Master Answer Key</title>
    <style>
      @page {
        size: ${pageSizeCss};
        margin: 0;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        width: 100%;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .omr-print-page-landscape {
        width: ${A5_TWO_UP_PRINT_SIZE.pageWidthMm}mm;
        height: ${A5_TWO_UP_PRINT_SIZE.pageHeightMm}mm;
        display: flex;
        flex-direction: row;
        justify-content: space-between;
        align-items: stretch;
        position: relative;
        page-break-after: always;
        break-after: page;
        background: #ffffff;
      }
      .omr-sheet-half {
        width: ${A5_TWO_UP_PRINT_SIZE.sheetWidthMm}mm;
        height: ${A5_TWO_UP_PRINT_SIZE.sheetHeightMm}mm;
        flex-shrink: 0;
      }
      .omr-sheet-half svg {
        width: 100%;
        height: 100%;
        display: block;
      }
      .omr-cut-line {
        position: absolute;
        left: ${A5_TWO_UP_PRINT_SIZE.cutLineMm}mm;
        top: 0;
        bottom: 0;
        width: 0;
        border-left: 1px dashed #9CA3AF;
      }
      .omr-print-page-portrait {
        width: 210mm;
        height: 297mm;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        background: #ffffff;
        page-break-after: always;
        break-after: page;
      }
      .omr-print-page-portrait svg {
        display: block;
        width: 100%;
        height: 100%;
      }
    </style>
  </head>
  <body>
    ${pagesHtml}
    <script>
      window.addEventListener('load', function () {
        window.print();
      });
    </script>
  </body>
</html>`;

  const blob = new Blob([printHtml], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const printWindow = window.open(blobUrl, '_blank');
  if (!printWindow) {
    URL.revokeObjectURL(blobUrl);
    alert('Popups are blocked. Please allow popups for this site to print or save as PDF.');
    return;
  }

  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

/**
 * Converts an SVG string into a PNG ArrayBuffer using an offscreen Canvas.
 */
function svgToPngArrayBuffer(
  svgString: string,
  width: number,
  height: number,
  scale = 2
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('HTML Canvas 2D context is not supported in this browser.'));
      return;
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Failed to create PNG blob from canvas.'));
          return;
        }
        const buffer = await blob.arrayBuffer();
        resolve(buffer);
      }, 'image/png');
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

/**
 * Transforms the OMR answer sheet into a Word (.docx) document with embedded high-resolution graphics.
 */
export async function exportOmrAnswerKeyDocx(
  tos: TosDocument,
  questions: ExamQuestion[],
  options: OmrAnswerKeyExportOptions = {}
): Promise<void> {
  const { geometry, svgContent, answerKey, isHalfSheet, fullTitle, itemCount } =
    buildOmrAnswerKeyData(tos, questions, options);

  let printableSvg = '';
  let canvasWidth = 0;
  let canvasHeight = 0;
  let docxWidth = 0;
  let docxHeight = 0;

  if (isHalfSheet) {
    // 2-up composite A4 landscape (1123 x 794)
    canvasWidth = 1123;
    canvasHeight = 794;
    docxWidth = 740;
    docxHeight = 523;

    printableSvg = `<svg width="1123" height="794" viewBox="0 0 1123 794" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1123" height="794" fill="#FFFFFF"/>
  <g transform="translate(0, 0)">${svgContent}</g>
  <line x1="561.5" y1="0" x2="561.5" y2="794" stroke="#9CA3AF" stroke-width="1.5" stroke-dasharray="6,4"/>
  <g transform="translate(564, 0)">${svgContent}</g>
</svg>`;
  } else {
    // 1-up A4 portrait (794 x 1123)
    canvasWidth = 794;
    canvasHeight = 1123;
    docxWidth = 540;
    docxHeight = 764;
    printableSvg = svgContent;
  }

  // Convert SVG to PNG buffer
  const imageBuffer = await svgToPngArrayBuffer(printableSvg, canvasWidth, canvasHeight, 2);

  // Build Answer Key Table Rows
  const tableHeader = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        width: { size: 10, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: 'Item', bold: true, alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        width: { size: 15, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: 'Key', bold: true, alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        width: { size: 25, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: 'Cognitive Domain', bold: true, alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: 'Rationale / Explanation', bold: true })],
      }),
    ],
  });

  const tableRows = questions.map((q, idx) => {
    const num = q.item_number || idx + 1;
    const ans = q.correct_answer || answerKey[num] || '-';
    const domain = (q.cognitive_level || 'remembering').toUpperCase();
    const rationale = q.rationale || `Option ${ans} is the correct answer according to the lesson material.`;

    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ text: `${num}`, alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: ans, bold: true, color: '059669' })],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
        new TableCell({
          children: [new Paragraph({ text: domain, alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          children: [new Paragraph({ text: rationale })],
        }),
      ],
    });
  });

  const doc = new Document({
    sections: [
      // Section 1: Official Printable OMR Sheet with Pre-Shaded Answers
      {
        properties: {
          page: {
            size: {
              orientation: isHalfSheet ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT,
            },
            margin: { top: 360, bottom: 360, left: 360, right: 360 }, // 0.25 inch margins
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: {
                  width: docxWidth,
                  height: docxHeight,
                },
              }),
            ],
          }),
        ],
      },
      // Section 2: Itemized Answer Key Reference Table
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.PORTRAIT,
            },
            margin: { top: 720, bottom: 720, left: 720, right: 720 }, // 0.5 inch margins
          },
        },
        children: [
          new Paragraph({
            text: (options.schoolName || '').toUpperCase(),
            alignment: AlignmentType.CENTER,
            style: 'SchoolName',
          }),
          new Paragraph({
            text: `${fullTitle.toUpperCase()} — OFFICIAL ANSWER KEY TABLE`,
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: `${tos.term.toUpperCase()} | S.Y. ${tos.school_year} | Total Items: ${itemCount}`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [tableHeader, ...tableRows],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const cleanSubj = tos.subject.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Exam_${cleanSubj}_OMR_AnswerKey.docx`;
  downloadBlob(blob, filename);
}

