import {
  AlignmentType,
  BorderStyle,
  Document,
  PageOrientation,
  Packer,
  Paragraph,
  SectionType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { ExamQuestion } from './exam-types';

export interface ExamPaperDocxOptions {
  tenantName: string;
  title: string;
  subject: string;
  grade?: string;
  strand?: string;
  term: string;
  schoolYear: string;
  teacherName?: string;
  generalDirections: string;
  questions: ExamQuestion[];
  isTeacherCopy: boolean;
  isTwoColumn: boolean;
  paperSize?: 'A4' | 'A5';
}

const noBorders = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function centered(text: string, size: number, bold = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 50 },
    children: [new TextRun({ text, font: 'Arial', size, bold })],
  });
}

function studentInfo(label: string, value = ''): Paragraph {
  return new Paragraph({
    spacing: { after: 100 },
    border: { bottom: { style: BorderStyle.DOTTED, size: 4, color: '111111' } },
    children: [new TextRun({ text: `${label}:  `, bold: true, font: 'Arial', size: 19 }), new TextRun({ text: value || '                                             ', font: 'Arial', size: 19 })],
  });
}

export function createExamPaperDocument(options: ExamPaperDocxOptions): Document {
  const pageSize = options.paperSize === 'A5'
    ? { width: 8391, height: 11906 }
    : { width: 11906, height: 16838 };
  const page = { size: { ...pageSize, orientation: PageOrientation.PORTRAIT }, margin: { top: 680, bottom: 680, left: 850, right: 850 } };
  const subtitle = `${options.subject}${options.grade ? ` • ${options.grade}` : ''}${options.strand ? ` (${options.strand})` : ''} • ${options.term} • S.Y. ${options.schoolYear}`;
  const headerChildren: Array<Paragraph | Table> = [
    centered('DEPARTMENT OF EDUCATION • REPUBLIC OF THE PHILIPPINES', 18),
    centered(options.tenantName || 'SCHOOL', 25, true),
    centered(options.title || 'QUARTERLY EXAMINATION', 23, true),
    centered(subtitle, 18),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: '111111' } }, spacing: { after: 220 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({ children: [
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: [studentInfo('NAME'), studentInfo('SECTION')] }),
          new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders, children: [studentInfo('DATE'), studentInfo('TEACHER', options.teacherName)] }),
        ] }),
      ],
    }),
  ];

  if (options.isTeacherCopy) {
    headerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      shading: { fill: 'FFF4D6' },
      spacing: { before: 80, after: 160 },
      children: [new TextRun({ text: '★ OFFICIAL TEACHER COPY — INCLUDES ANSWER KEY & RATIONALES ★', bold: true, font: 'Arial', size: 19, color: '854D0E' })],
    }));
  }

  headerChildren.push(new Paragraph({
    shading: { fill: 'F3F4F6' },
    border: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' },
    },
    spacing: { before: 80, after: 180 },
    indent: { left: 100, right: 100 },
    children: [new TextRun({ text: 'GENERAL DIRECTIONS: ', bold: true, font: 'Arial', size: 18 }), new TextRun({ text: options.generalDirections, italics: true, font: 'Arial', size: 18 })],
  }));

  const questionChildren: Array<Paragraph | Table> = [];
  for (const question of options.questions) {
    questionChildren.push(new Paragraph({
      keepNext: true,
      spacing: { before: 100, after: 60 },
      children: [
        new TextRun({ text: `${question.item_number}. `, bold: true, font: 'Arial', size: 19 }),
        new TextRun({ text: question.question, font: 'Times New Roman', size: 22 }),
      ],
    }));
    for (const choice of ['A', 'B', 'C', 'D'] as const) {
      const correct = options.isTeacherCopy && question.correct_answer === choice;
      questionChildren.push(new Paragraph({
        keepNext: options.isTeacherCopy && correct,
        indent: { left: 360, hanging: 240 },
        spacing: { after: 30 },
        children: [
          new TextRun({ text: `${choice}. `, bold: true, font: 'Arial', size: 18 }),
          new TextRun({ text: question.options[choice] || '', font: 'Times New Roman', size: 20, bold: correct, underline: correct ? {} : undefined, color: correct ? '1E3A8A' : '111111' }),
          ...(correct ? [new TextRun({ text: '  [CORRECT]', bold: true, font: 'Arial', size: 16, color: '15803D' })] : []),
        ],
      }));
    }
    if (options.isTeacherCopy) {
      questionChildren.push(new Paragraph({
        indent: { left: 360 },
        border: { left: { style: BorderStyle.SINGLE, size: 12, color: '60A5FA' } },
        spacing: { before: 40, after: 140 },
        children: [
          new TextRun({ text: `Competency: ${question.competency_id} • Domain: ${question.cognitive_level}\n`, font: 'Arial', size: 16, color: '4B5563' }),
          new TextRun({ text: `Rationale: ${question.rationale || ''}`, font: 'Arial', size: 16, color: '4B5563' }),
        ],
      }));
    } else {
      questionChildren.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    }
  }

  questionChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'D1D5DB' } },
    spacing: { before: 220 },
    children: [new TextRun({ text: `End of Examination${options.tenantName ? ` • ${options.tenantName}` : ''}`, font: 'Arial', size: 16, color: '6B7280' })],
  }));

  return new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 20 } } } },
    sections: options.isTwoColumn ? [
      {
        properties: {
          page,
          column: { count: 1 },
        },
        children: headerChildren,
      },
      {
        properties: {
          type: SectionType.CONTINUOUS,
          page,
          column: { count: 2, space: 500, equalWidth: true },
        },
        children: questionChildren,
      },
    ] : [{
      properties: { page, column: { count: 1 } },
      children: [...headerChildren, ...questionChildren],
    }],
  });
}

export async function createExamPaperDocx(options: ExamPaperDocxOptions): Promise<Blob> {
  return Packer.toBlob(createExamPaperDocument(options));
}
