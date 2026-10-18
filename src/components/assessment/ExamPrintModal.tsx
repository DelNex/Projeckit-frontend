'use client';

import React, { useState } from 'react';
import { useTenant } from '@/context/TenantContext';
import { ExamQuestion } from '@/lib/exam-types';
import { Columns2, FileText, Printer, X, CheckCircle, ShieldCheck } from 'lucide-react';

interface ExamPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subject: string;
  grade?: string;
  strand?: string;
  term: string;
  schoolYear: string;
  teacherName?: string;
  generalDirections?: string;
  questions: ExamQuestion[];
}

export function ExamPrintModal({
  isOpen,
  onClose,
  title,
  subject,
  grade,
  strand,
  term,
  schoolYear,
  teacherName,
  generalDirections = 'Read each question carefully. Select the best answer from the given choices and blacken the corresponding circle on your DepEd OMR Answer Sheet. Avoid erasures.',
  questions,
}: ExamPrintModalProps) {
  const { tenantName } = useTenant();
  const [isTwoColumn, setIsTwoColumn] = useState(true);
  const [isTeacherCopy, setIsTeacherCopy] = useState(false);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="w-full max-w-4xl rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 max-h-[92vh] flex flex-col print:max-w-none print:max-h-none print:border-none print:shadow-none print:rounded-none">
        {/* Controls Toolbar (Hidden when printing) */}
        <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-gray-800 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Print Question Paper — DepEd Standard
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* 2-Column Toggle */}
            <button
              type="button"
              onClick={() => setIsTwoColumn(!isTwoColumn)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                isTwoColumn
                  ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-900 dark:text-blue-300'
                  : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
              }`}
              title="Toggle 2-column layout to save paper"
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>{isTwoColumn ? '2 Columns (Paper Saver)' : 'Single Column'}</span>
            </button>

            {/* Teacher Copy Toggle */}
            <button
              type="button"
              onClick={() => setIsTeacherCopy(!isTeacherCopy)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                isTeacherCopy
                  ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-300'
                  : 'bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
              }`}
              title="Toggle Answer Key & Rationales display"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{isTeacherCopy ? 'Teacher Copy (with Key)' : 'Student Copy'}</span>
            </button>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 shadow-sm transition"
            >
              <Printer className="h-4 w-4" />
              <span>Print / Save PDF</span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Paper Document Preview */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 font-serif text-gray-900 dark:text-gray-100 print:text-black print:overflow-visible print:p-0">
          {/* DepEd Standard Header */}
          <div className="border-b-2 border-black pb-4 text-center space-y-1 mb-6">
            <p className="text-[11px] font-sans uppercase tracking-widest text-gray-500 print:text-gray-600">
              Department of Education • Republic of the Philippines
            </p>
            <h2 className="text-base sm:text-lg font-black uppercase tracking-wide">
              {tenantName}
            </h2>
            <h1 className="text-sm sm:text-base font-bold uppercase tracking-wider underline">
              {title || 'Quarterly Examination'}
            </h1>
            <p className="text-xs font-sans text-gray-600 print:text-black">
              {subject} {grade ? `• ${grade}` : ''} {strand ? `(${strand})` : ''} • {term} • S.Y. {schoolYear}
            </p>
          </div>

          {/* Student Header Lines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-sans mb-5 pb-3 border-b border-gray-300 print:border-black">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold">NAME:</span>
                <span className="flex-1 border-b border-dotted border-black min-h-[16px]"></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">SECTION:</span>
                <span className="flex-1 border-b border-dotted border-black min-h-[16px]"></span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-bold">DATE:</span>
                <span className="flex-1 border-b border-dotted border-black min-h-[16px]"></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">TEACHER:</span>
                <span className="flex-1 border-b border-dotted border-black min-h-[16px]">
                  {teacherName || ''}
                </span>
              </div>
            </div>
          </div>

          {/* Teacher Copy Banner */}
          {isTeacherCopy && (
            <div className="mb-4 rounded-lg bg-amber-50 p-2 text-center text-xs font-sans font-bold text-amber-800 border border-amber-300 print:border-black">
              ★ OFFICIAL TEACHER COPY — INCLUDES ANSWER KEY & RATIONALES ★
            </div>
          )}

          {/* General Directions */}
          <div className="mb-6 font-sans text-xs italic bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-200 dark:border-gray-700 print:bg-white print:border-none print:p-0">
            <strong>GENERAL DIRECTIONS: </strong>
            {generalDirections}
          </div>

          {/* Questions Container */}
          <div className={isTwoColumn ? 'columns-1 sm:columns-2 gap-8 text-xs' : 'space-y-5 text-xs'}>
            {questions.map((q) => (
              <div
                key={q.item_number}
                className="break-inside-avoid space-y-1.5 mb-4 font-sans text-gray-900 print:text-black"
              >
                <div className="flex items-start gap-1.5 font-medium leading-snug">
                  <span className="font-bold">{q.item_number}.</span>
                  <p className="flex-1 font-serif text-[13px]">{q.question}</p>
                </div>

                {/* Choices A-D */}
                <div className="pl-5 space-y-1 font-serif text-xs">
                  {(['A', 'B', 'C', 'D'] as const).map((choiceKey) => {
                    const isCorrect = isTeacherCopy && q.correct_answer === choiceKey;
                    return (
                      <div
                        key={choiceKey}
                        className={`flex items-start gap-2 ${
                          isCorrect ? 'font-bold text-blue-900 print:text-black underline' : ''
                        }`}
                      >
                        <span className="font-sans font-bold">{choiceKey}.</span>
                        <span>{q.options[choiceKey]}</span>
                        {isCorrect && (
                          <span className="font-sans text-[10px] uppercase font-bold text-emerald-600 print:text-black">
                            [CORRECT]
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Teacher Rationale & Metadata */}
                {isTeacherCopy && (
                  <div className="mt-1 pl-5 pt-1 text-[11px] font-sans text-gray-600 print:text-gray-800 border-l-2 border-blue-400 dark:border-blue-600 pl-2">
                    <p>
                      <strong>Competency:</strong> {q.competency_id} • <strong>Domain:</strong>{' '}
                      <span className="capitalize">{q.cognitive_level}</span>
                    </p>
                    <p>
                      <strong>Rationale:</strong> {q.rationale}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer Note */}
          <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-800 text-center font-sans text-[10px] text-gray-500 print:text-gray-600">
            End of Examination{tenantName ? ` • ${tenantName}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}
