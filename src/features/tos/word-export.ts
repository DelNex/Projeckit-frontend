import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  AlignmentType,
  WidthType,
  BorderStyle,
  PageOrientation,
  HeadingLevel,
} from 'docx';
import { TosDocument } from '@/types/tos';
import { CalculatedCompetencyRow, BLOOM_LEVELS, BLOOM_LEVEL_LABELS } from '@/lib/tos-calculator';

export interface TosWordExportOptions {
  schoolName?: string;
  region?: string;
  division?: string;
  preparedBy?: string;
  checkedBy?: string;
  approvedBy?: string;
}

/**
 * Generates an official DepEd Table of Specifications Word (.docx) document in landscape.
 */
export async function generateOfficialTosDocx(
  tos: TosDocument,
  calcRows: CalculatedCompetencyRow[],
  options: TosWordExportOptions = {}
): Promise<Blob> {
  const schoolName = (options.schoolName || 'Project KIT School').toUpperCase();
  const region = options.region || 'National Capital Region';
  const division = options.division || 'Schools Division Office';
  const teacher = options.preparedBy || tos.teacher_name || 'Subject Teacher';
  const checkedBy = options.checkedBy || 'Master Teacher / Head Teacher';
  const approvedBy = options.approvedBy || 'School Principal';

  const totalDays = calcRows.reduce((sum, r) => sum + r.daysTaught, 0);
  const totalItems = calcRows.reduce((sum, r) => sum + r.itemCount, 0);

  // Table header cells
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      new TableCell({
        rowSpan: 2,
        width: { size: 5, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: 'No.', alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        rowSpan: 2,
        width: { size: 28, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: 'LEARNING COMPETENCIES', alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        rowSpan: 2,
        width: { size: 8, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: 'DAYS TAUGHT', alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        rowSpan: 2,
        width: { size: 7, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: '%', alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        rowSpan: 2,
        width: { size: 7, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: 'ITEMS', alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        columnSpan: 6,
        width: { size: 45, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ text: "BLOOM'S TAXONOMY / ITEM PLACEMENT", alignment: AlignmentType.CENTER })],
      }),
    ],
  });

  const subHeaderRow = new TableRow({
    tableHeader: true,
    children: BLOOM_LEVELS.map(
      (level) =>
        new TableCell({
          width: { size: 7.5, type: WidthType.PERCENTAGE },
          children: [
            new Paragraph({
              text: BLOOM_LEVEL_LABELS[level].toUpperCase(),
              alignment: AlignmentType.CENTER,
            }),
          ],
        })
    ),
  });

  // Table body rows
  const bodyRows = calcRows.map((row, index) => {
    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({ text: `${index + 1}`, alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          children: [new Paragraph({ text: row.description })],
        }),
        new TableCell({
          children: [new Paragraph({ text: `${row.daysTaught}`, alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          children: [new Paragraph({ text: `${row.percentage}%`, alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          children: [new Paragraph({ text: `${row.itemCount}`, alignment: AlignmentType.CENTER })],
        }),
        ...BLOOM_LEVELS.map((level) => {
          const items = row.domainDisplay[level];
          return new TableCell({
            children: [
              new Paragraph({
                text: items,
                alignment: AlignmentType.CENTER,
              }),
            ],
          });
        }),
      ],
    });
  });

  // Table Total Row
  const totalRow = new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        children: [new Paragraph({ text: 'TOTAL', alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        children: [new Paragraph({ text: `${totalDays}`, alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        children: [new Paragraph({ text: '100%', alignment: AlignmentType.CENTER })],
      }),
      new TableCell({
        children: [new Paragraph({ text: `${totalItems}`, alignment: AlignmentType.CENTER })],
      }),
      ...BLOOM_LEVELS.map((level) => {
        const count = calcRows.reduce((sum, r) => sum + r.domains[level], 0);
        return new TableCell({
          children: [new Paragraph({ text: `${count}`, alignment: AlignmentType.CENTER })],
        });
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: 720, // 0.5 inch
              bottom: 720,
              left: 720,
              right: 720,
            },
          },
        },
        children: [
          // DepEd Header
          new Paragraph({
            text: 'Republic of the Philippines',
            alignment: AlignmentType.CENTER,
            style: 'HeaderLine',
          }),
          new Paragraph({
            text: 'Department of Education',
            alignment: AlignmentType.CENTER,
            style: 'HeaderBold',
          }),
          new Paragraph({
            text: region,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: division,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: schoolName,
            alignment: AlignmentType.CENTER,
            style: 'SchoolName',
          }),
          new Paragraph({ text: '' }), // spacer
          new Paragraph({
            text: 'TABLE OF SPECIFICATION',
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: `${(tos.exam_type || 'SUMMATIVE TEST').toUpperCase()} - ${tos.subject.toUpperCase()}`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `${tos.term.toUpperCase()} | S.Y. ${tos.school_year}`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),

          // Context summary
          new Paragraph({
            children: [
              new TextRun({ text: 'Teacher: ', bold: true }),
              new TextRun({ text: `${teacher}    ` }),
              new TextRun({ text: 'Sections: ', bold: true }),
              new TextRun({
                text: `${
                  tos.sections && tos.sections.length > 0
                    ? tos.sections.map((s) => s.name).join(', ')
                    : tos.section || 'General'
                }    `,
              }),
              new TextRun({ text: 'Total Items: ', bold: true }),
              new TextRun({ text: `${totalItems} items    ` }),
              new TextRun({ text: 'Total Instructional Days: ', bold: true }),
              new TextRun({ text: `${totalDays} days` }),
            ],
          }),
          new Paragraph({ text: '' }),

          // Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, subHeaderRow, ...bodyRows, totalRow],
          }),
          new Paragraph({ text: '' }),
          new Paragraph({ text: '' }),

          // Signatures Block
          new Paragraph({
            children: [
              new TextRun({ text: 'Prepared by:\t\t\t\tChecked by:\t\t\t\tApproved by:\n\n\n' }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `${teacher}\t\t\t\t`, bold: true, underline: {} }),
              new TextRun({ text: `${checkedBy}\t\t\t\t`, bold: true, underline: {} }),
              new TextRun({ text: `${approvedBy}`, bold: true, underline: {} }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Subject Teacher\t\t\t\tMaster / Head Teacher\t\t\t\tSchool Principal' }),
            ],
          }),
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}

/**
 * Triggers browser download for generated blob.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

