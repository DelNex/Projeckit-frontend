import {
  AlignmentType,
  BorderStyle,
  Document,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { BLOOM_LEVELS, calculateTos, type BloomLevel, type CalculatedCompetencyRow } from '@/lib/tos-calculator';
import { generateOfficialTosDocx } from '@/features/tos/word-export';
import type { TosDocument } from '@/types/tos';
import type { SectionTermMetrics } from './term-report-metrics';

export interface SchoolReportHeader {
  schoolName: string;
  region: string;
  division: string;
  subject: string;
  term: string;
  schoolYear: string;
  assessmentTitle: string;
  preparedBy: string;
}

export interface LearnedItemRow {
  itemNumber: number;
  competency: string;
  correct: number;
  cases: number;
  masteryPct: number;
}

export function getExportableTosRows(tos: TosDocument): CalculatedCompetencyRow[] {
  const sourceRows = Array.isArray(tos.rows) ? tos.rows as Array<Record<string, any>> : [];
  if (!sourceRows.length) throw new Error('The TOS has no learning competencies to export.');
  const hasSavedPlacements = sourceRows.every((row) =>
    row.domainItemNumbers && BLOOM_LEVELS.every((level) => Array.isArray(row.domainItemNumbers[level]))
  );

  if (hasSavedPlacements) {
    return sourceRows.map((row, index) => {
      const domainItemNumbers = Object.fromEntries(BLOOM_LEVELS.map((level) => {
        const items = Array.isArray(row.domainItemNumbers[level])
          ? row.domainItemNumbers[level].map(Number).filter((item: number) => Number.isInteger(item) && item > 0)
          : [];
        return [level, items];
      })) as Record<BloomLevel, number[]>;
      const domains = Object.fromEntries(BLOOM_LEVELS.map((level) => [
        level,
        Number(row.domains?.[level]) || domainItemNumbers[level].length,
      ])) as Record<BloomLevel, number>;
      const itemNumbers = Array.from(new Set(BLOOM_LEVELS.flatMap((level) => domainItemNumbers[level]))).sort((a, b) => a - b);
      const itemCount = Number(row.itemCount) || itemNumbers.length;
      const firstLevel = BLOOM_LEVELS.find((level) => domainItemNumbers[level].length > 0) || 'remembering';
      const domainDisplay = Object.fromEntries(BLOOM_LEVELS.map((level) => [
        level,
        typeof row.domainDisplay?.[level] === 'string' ? row.domainDisplay[level] : domainItemNumbers[level].join(', ') || '—',
      ])) as Record<BloomLevel, string>;
      const domainRanges = Object.fromEntries(BLOOM_LEVELS.map((level) => [level, domainDisplay[level]])) as Record<BloomLevel, string>;
      const startItem = itemNumbers[0] || 0;
      const endItem = itemNumbers[itemNumbers.length - 1] || 0;
      return {
        id: String(row.id || index + 1),
        code: String(row.code || `COMP-${index + 1}`),
        description: String(row.description || `Competency ${index + 1}`),
        daysTaught: Math.max(1, Number(row.daysTaught || row.days) || 1),
        percentage: Number(row.percentage) || (Number(tos.target_items) ? itemCount / Number(tos.target_items) * 100 : 0),
        itemCount,
        itemRange: itemNumbers.join(', ') || '—',
        startItem,
        endItem,
        domains,
        domainRanges,
        domainItemNumbers,
        domainDisplay,
        primaryBloomLevel: firstLevel,
      };
    });
  }

  const competencies = sourceRows.map((row, index) => ({
    id: String(row.id || index + 1),
    code: String(row.code || `COMP-${index + 1}`),
    description: String(row.description || row.competency || `Competency ${index + 1}`),
    daysTaught: Math.max(1, Number(row.daysTaught || row.days || row.days_taught) || 1),
  }));
  const calculation = calculateTos(competencies, Number(tos.target_items) || 50, {
    allocationMode: 'action_verb',
    examType: tos.exam_type || 'Summative Test 1',
  });
  if (!calculation.isValid) throw new Error(calculation.validationError || 'The saved TOS item placements are incomplete.');
  return calculation.rows;
}

const borders = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
};

function cell(text: string, options: { bold?: boolean; center?: boolean; fill?: string } = {}): TableCell {
  return new TableCell({
    shading: options.fill ? { fill: options.fill } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text, bold: options.bold, font: 'Arial', size: 20 })],
    })],
  });
}

function dataTable(headers: string[], rows: string[][], widths: number[]): Table {
  const header = new TableRow({
    tableHeader: true,
    children: headers.map((heading, index) => new TableCell({
      width: { size: widths[index], type: WidthType.PERCENTAGE },
      shading: { fill: 'E8EEF5' },
      margins: { top: 100, bottom: 100, left: 100, right: 100 },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: heading, bold: true, font: 'Arial', size: 19 })] })],
    })),
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [header, ...rows.map((row) => new TableRow({
      cantSplit: true,
      children: row.map((value, index) => new TableCell({
        width: { size: widths[index], type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        children: [new Paragraph({ alignment: index === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, children: [new TextRun({ text: value, font: 'Arial', size: 19 })] })],
      })),
    }))],
  });
}

function headerParagraphs(header: SchoolReportHeader): Paragraph[] {
  const lines = [
    'Republic of the Philippines',
    header.region,
    header.division,
    header.schoolName,
  ].filter((line) => line.trim());
  return [
    ...lines.map((line, index) => new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 30 },
      children: [new TextRun({ text: line, bold: index === lines.length - 1, font: 'Arial', size: index === lines.length - 1 ? 24 : 20 })],
    })),
    new Paragraph({ text: '', spacing: { after: 80 } }),
  ];
}

function titleParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, bold: true, font: 'Arial', size: 26 })],
  });
}

function contextParagraph(header: SchoolReportHeader): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 180 },
    children: [new TextRun({
      text: [header.assessmentTitle, `IN ${header.subject}`, `${header.term} · S.Y. ${header.schoolYear}`].filter(Boolean).join('  |  '),
      font: 'Arial', size: 20,
    })],
  });
}

function signatureTable(preparedBy: string, preparedTitle = 'Subject Teacher'): Table {
  const names = [preparedBy || '____________________', '____________________', '____________________'];
  const titles = [preparedTitle, 'Master Teacher / Head Teacher', 'School Principal'];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    },
    rows: [
      new TableRow({ children: ['Prepared by:', 'Checked and reviewed by:', 'Noted:'].map((text) => cell(text, { bold: true })) }),
      new TableRow({ children: names.map((text) => cell(text, { bold: true, center: true })) }),
      new TableRow({ children: titles.map((text) => cell(text, { center: true })) }),
    ],
  });
}

function makeDocument(children: (Paragraph | Table)[], orientation = PageOrientation.LANDSCAPE): Promise<Buffer> {
  const document = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation },
          margin: { top: 680, bottom: 680, left: 680, right: 680 },
        },
      },
      children,
    }],
  });
  return Packer.toBuffer(document);
}

export async function createTermResultsDocx(header: SchoolReportHeader, rows: SectionTermMetrics[]): Promise<Buffer> {
  const populated = rows.filter((row) => row.cases > 0 && row.mean !== null && row.pl !== null && row.mps !== null);
  const average = (field: 'mean' | 'pl' | 'mps') => populated.length
    ? (populated.reduce((sum, row) => sum + Number(row[field]), 0) / populated.length).toFixed(2)
    : '—';
  const fmt = (value: number | null) => value === null ? '—' : value.toFixed(2);
  const tableRows = rows.map((row) => [
    row.sectionName,
    String(row.cases),
    String(row.items),
    row.highest === null ? '—' : String(row.highest),
    row.lowest === null ? '—' : String(row.lowest),
    fmt(row.mean), fmt(row.pl), fmt(row.mps),
  ]);
  tableRows.push(['Average', '', '', '', '', average('mean'), average('pl'), average('mps')]);
  return makeDocument([
    ...headerParagraphs(header),
    titleParagraph('TERM CONSOLIDATED TEST RESULTS'),
    contextParagraph(header),
    dataTable(['Strand and Section', 'No. of Cases', 'No. of Items', 'Highest Score', 'Lowest Score', 'Mean', 'PL', 'MPS'], tableRows, [23, 10, 10, 11, 11, 11, 12, 12]),
    new Paragraph({ text: '', spacing: { after: 220 } }),
    signatureTable(header.preparedBy),
  ]);
}

export async function createMostLeastLearnedDocx(header: SchoolReportHeader, ranked: LearnedItemRow[]): Promise<Buffer> {
  const most = [...ranked].sort((a, b) => b.masteryPct - a.masteryPct || a.itemNumber - b.itemNumber).slice(0, 5);
  const least = [...ranked].sort((a, b) => a.masteryPct - b.masteryPct || a.itemNumber - b.itemNumber).slice(0, 5);
  const body = Array.from({ length: Math.max(most.length, least.length) }, (_, index) => [
    most[index] ? String(most[index].itemNumber) : '—',
    most[index]?.competency || '—',
    most[index] ? String(index + 1) : '—',
    least[index]?.competency || '—',
    least[index] ? String(least[index].itemNumber) : '—',
  ]);
  return makeDocument([
    ...headerParagraphs(header),
    titleParagraph('CONSOLIDATED MOST LEARNED AND LEAST LEARNED SKILLS'),
    contextParagraph(header),
    dataTable(['Item No.', 'Most Learned Skills', 'Rank', 'Least Learned Skills', 'Item No.'], body, [10, 35, 8, 37, 10]),
    new Paragraph({ text: '', spacing: { after: 220 } }),
    signatureTable(header.preparedBy),
    new Paragraph({
      spacing: { before: 120 },
      children: [new TextRun({ text: 'Ranking basis: percentage of scored cases answering each item correctly. Unanswered items count as incorrect.', italics: true, font: 'Arial', size: 16 })],
    }),
  ], PageOrientation.LANDSCAPE);
}

export async function createTosDocx(tos: TosDocument, school: { name: string; region?: string | null; division?: string | null }): Promise<Buffer> {
  const calculatedRows = getExportableTosRows(tos);
  const blob = await generateOfficialTosDocx(tos, calculatedRows, {
    schoolName: school.name,
    region: school.region || '',
    division: school.division || '',
    preparedBy: tos.teacher_name || '',
    checkedBy: '',
    approvedBy: '',
  });
  return Buffer.from(await blob.arrayBuffer());
}
