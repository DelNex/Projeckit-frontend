import { Packer } from 'docx';
import type { ExamQuestion } from '@/lib/exam-types';
import { createExamPaperDocument } from '@/lib/exam-paper-docx';

export interface ExamPaperExportContext {
  tenantName: string;
  title: string;
  subject: string;
  grade?: string;
  strand?: string;
  term: string;
  schoolYear: string;
  teacherName?: string;
  teacherCopy?: boolean;
  twoColumn?: boolean;
  paperSize?: 'A4' | 'A5';
  questions: ExamQuestion[];
}

export async function createExamPaperDocxBuffer(context: ExamPaperExportContext): Promise<Buffer> {
  const document = createExamPaperDocument({
    ...context,
    generalDirections: 'Read each question carefully. Select the best answer from the given choices and blacken the corresponding circle on your DepEd OMR Answer Sheet. Avoid erasures.',
    isTeacherCopy: Boolean(context.teacherCopy),
    isTwoColumn: context.twoColumn !== false,
    paperSize: context.paperSize || 'A4',
  });
  return Packer.toBuffer(document);
}
