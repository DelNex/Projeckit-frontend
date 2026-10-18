import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  PageOrientation,
  HeadingLevel,
} from 'docx';
import { TosDocument } from '@/types/tos';
import { ExamQuestion } from '@/lib/exam-types';

export interface ExamWordExportOptions {
  schoolName?: string;
  isTeacherCopy?: boolean; // includes answer key & rationale if true
  examDate?: string;
}

export { downloadBlob } from './word-export';

/**
 * Generates an official printable Examination question paper (or Teacher Copy with Answer Key) in Word (.docx).
 */
export async function generateExamDocx(
  tos: TosDocument,
  questions: ExamQuestion[],
  options: ExamWordExportOptions = {}
): Promise<Blob> {
  const schoolName = (options.schoolName || '').toUpperCase();
  const examTitle = (tos.exam_type || 'EXAMINATION').toUpperCase();
  const subject = tos.subject.toUpperCase();
  const schoolYear = tos.school_year;
  const term = tos.term.toUpperCase();
  const isTeacherCopy = options.isTeacherCopy || false;
  const examDate = options.examDate || new Date().toISOString().split('T')[0];

  const questionParagraphs: Paragraph[] = [];

  questions.forEach((q, idx) => {
    const itemNum = q.item_number || idx + 1;
    // Question text
    questionParagraphs.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${itemNum}. `, bold: true }),
          new TextRun({ text: q.question || '' }),
        ],
        spacing: { before: 200, after: 100 },
      })
    );

    // Options A, B, C, D
    const optionsObj = q.options;
    (['A', 'B', 'C', 'D'] as const).forEach((letter) => {
      const optText = optionsObj[letter] || '';
      const isCorrect = isTeacherCopy && q.correct_answer === letter;
      questionParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `    ${letter}. ${optText}`,
              bold: isCorrect,
              color: isCorrect ? '059669' : undefined, // highlight correct green on teacher copy
            }),
            isCorrect ? new TextRun({ text: '  [CORRECT ANSWER]', bold: true, color: '059669' }) : new TextRun({ text: '' }),
          ],
          indent: { left: 400 },
          spacing: { after: 60 },
        })
      );
    });

    if (isTeacherCopy && q.rationale) {
      questionParagraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: '    Rationale: ', italics: true, color: '4B5563' }),
            new TextRun({ text: q.rationale, italics: true, color: '4B5563' }),
          ],
          indent: { left: 400 },
          spacing: { after: 120 },
        })
      );
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.PORTRAIT,
            },
            margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 }, // 0.75 inch
          },
        },
        children: [
          // Header
          new Paragraph({
            text: schoolName,
            alignment: AlignmentType.CENTER,
            style: 'SchoolName',
          }),
          new Paragraph({
            text: `${examTitle} IN ${subject}`,
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            text: `${term} | S.Y. ${schoolYear}${isTeacherCopy ? ' — TEACHER COPY & ANSWER KEY' : ''}`,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),

          // Student Header line
          new Paragraph({
            children: [
              new TextRun({ text: 'NAME: ____________________________________    ' }),
              new TextRun({ text: `DATE: ${examDate}    ` }),
              new TextRun({ text: 'SCORE: _________' }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'GRADE & SECTION: ___________________________    ' }),
              new TextRun({ text: `TEACHER: ${tos.teacher_name || 'Teacher'}` }),
            ],
          }),
          new Paragraph({ text: '' }),

          // Directions
          new Paragraph({
            children: [
              new TextRun({ text: 'GENERAL DIRECTIONS: ', bold: true }),
              new TextRun({
                text: 'Read each question carefully. Shade the circle corresponding to the letter of the correct answer on your OMR answer sheet.',
                italics: true,
              }),
            ],
            spacing: { after: 200 },
          }),

          // Questions
          ...questionParagraphs,
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
