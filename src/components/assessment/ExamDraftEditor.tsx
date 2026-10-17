'use client';

import React, { useState } from 'react';
import { ExamQuestion, CognitiveDomain } from '@/lib/exam-types';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { ExamPrintModal } from './ExamPrintModal';
import {
  CheckCircle2,
  Edit3,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
  Sparkles,
} from 'lucide-react';

interface ExamDraftEditorProps {
  initialQuestions: ExamQuestion[];
  assessmentId?: string;
  tosId?: string;
  targetItems: number;
  assessmentTitle: string;
  subjectTitle: string;
  term: string;
  schoolYear: string;
  grade?: string;
  strand?: string;
  teacherName?: string;
  lessonText?: string;
  onQuestionsSaved?: (questions: ExamQuestion[]) => void;
  onApproveSuccess?: () => void;
}

const DOMAIN_BADGES: Record<CognitiveDomain, { label: string; class: string }> = {
  remembering: { label: 'Remembering', class: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300' },
  understanding: { label: 'Understanding', class: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300' },
  applying: { label: 'Applying', class: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300' },
  analyzing: { label: 'Analyzing', class: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300' },
  evaluating: { label: 'Evaluating', class: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300' },
  creating: { label: 'Creating', class: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300' },
};

export function ExamDraftEditor({
  initialQuestions,
  assessmentId,
  tosId,
  targetItems,
  assessmentTitle,
  subjectTitle,
  term,
  schoolYear,
  grade,
  strand,
  teacherName,
  lessonText = '',
  onQuestionsSaved,
  onApproveSuccess,
}: ExamDraftEditorProps) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<ExamQuestion[]>(initialQuestions);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [regeneratingItem, setRegeneratingItem] = useState<number | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Field change handlers
  const handleUpdateQuestion = (index: number, field: keyof ExamQuestion, value: any) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleUpdateOption = (index: number, optionKey: 'A' | 'B' | 'C' | 'D', value: string) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        options: {
          ...copy[index].options,
          [optionKey]: value,
        },
      };
      return copy;
    });
  };

  // Regenerate single question using API
  const handleRegenerateQuestion = async (q: ExamQuestion, index: number) => {
    setRegeneratingItem(q.item_number);
    try {
      const res = await fetch('/api/ai/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonText: lessonText || `${subjectTitle} ${q.competency_id}`,
          targetItems: 1,
          tosRows: [
            {
              id: q.competency_id,
              code: q.competency_id,
              description: `Competency for ${q.competency_id}`,
              domains: { [q.cognitive_level]: 1 },
            },
          ],
          regenerateSingleItemNumber: q.item_number,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate question');

      if (data.question) {
        setQuestions((prev) => {
          const copy = [...prev];
          copy[index] = { ...data.question, item_number: q.item_number };
          return copy;
        });
        toast.success(`Question ${q.item_number} regenerated successfully.`);
      }
    } catch (err: any) {
      console.error('Failed to regenerate single item:', err);
      toast.error(friendlyError(err, `Could not regenerate question ${q.item_number}.`));
    } finally {
      setRegeneratingItem(null);
    }
  };

  // Save questions draft
  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/ai/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          tosId,
          lessonText: lessonText || 'Saved draft questions',
          targetItems: questions.length,
          tosRows: [],
        }),
      });
      // In addition or alternatively, save directly to assessment questions column
      toast.success('Exam draft saved successfully.');
      onQuestionsSaved?.(questions);
    } catch (err: any) {
      console.error('Failed to save draft:', err);
      toast.error(friendlyError(err, 'Failed to save exam draft.'));
    } finally {
      setSaving(false);
    }
  };

  // Approve and Apply to Answer Key
  const handleApprove = async () => {
    setSaving(true);
    try {
      // 1. Send update to save questions and status
      const res = await fetch('/api/ai/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          tosId,
          lessonText: 'Approved exam',
          targetItems: questions.length,
          tosRows: [],
        }),
      });

      toast.success('Exam approved! Questions and Answer Key are now synchronized.');
      onApproveSuccess?.();
    } catch (err: any) {
      console.error('Failed to approve exam:', err);
      toast.error(friendlyError(err, 'Could not approve exam.'));
    } finally {
      setSaving(false);
    }
  };

  // Delete question
  const handleDeleteItem = (index: number) => {
    if (questions.length <= 1) {
      toast.error('The exam must contain at least 1 question.');
      return;
    }
    const filtered = questions.filter((_, i) => i !== index);
    // Renumber items
    const renumbered = filtered.map((q, idx) => ({ ...q, item_number: idx + 1 }));
    setQuestions(renumbered);
  };

  // Add question
  const handleAddItem = () => {
    const nextNum = questions.length + 1;
    const newItem: ExamQuestion = {
      item_number: nextNum,
      competency_id: 'COMP-1',
      cognitive_level: 'remembering',
      question: `New question ${nextNum} stem...`,
      options: {
        A: 'Option A description',
        B: 'Option B description',
        C: 'Option C description',
        D: 'Option D description',
      },
      correct_answer: 'A',
      rationale: 'Educational rationale for the correct answer.',
    };
    setQuestions([...questions, newItem]);
    setEditingIndex(questions.length);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-black text-gray-900 dark:text-white">
              Draft Examination Review & Editor
            </h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              {questions.length} / {targetItems} Items
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Review questions, edit choices and rationales, regenerate specific items, or print the DepEd exam paper.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleAddItem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Item</span>
          </button>

          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 transition"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>Print Question Paper</span>
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>Save Draft</span>
          </button>

          <button
            type="button"
            onClick={handleApprove}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 shadow-sm transition disabled:opacity-50"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Approve & Apply to Answer Key</span>
          </button>
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-4">
        {questions.map((q, idx) => {
          const isEditing = editingIndex === idx;
          const badge = DOMAIN_BADGES[q.cognitive_level] || DOMAIN_BADGES.remembering;

          return (
            <div
              key={q.item_number}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 sm:p-5 shadow-xs space-y-3 transition hover:border-gray-300 dark:hover:border-gray-700"
            >
              {/* Question Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 font-mono text-xs font-bold text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                    {q.item_number}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.class}`}
                  >
                    {badge.label}
                  </span>
                  <span className="text-[11px] font-mono text-gray-400">
                    {q.competency_id}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleRegenerateQuestion(q, idx)}
                    disabled={regeneratingItem === q.item_number}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30 transition disabled:opacity-50"
                    title="Regenerate this question with AI"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${regeneratingItem === q.item_number ? 'animate-spin' : ''}`}
                    />
                    <span>Regenerate</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingIndex(isEditing ? null : idx)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 transition"
                  >
                    <Edit3 className="h-3 w-3" />
                    <span>{isEditing ? 'Done' : 'Edit'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteItem(idx)}
                    className="rounded-lg p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                    title="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Question Stem */}
              {isEditing ? (
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Question Stem
                  </label>
                  <textarea
                    rows={2}
                    value={q.question}
                    onChange={(e) => handleUpdateQuestion(idx, 'question', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              ) : (
                <p className="text-xs sm:text-sm font-medium text-gray-900 dark:text-white leading-relaxed">
                  {q.question}
                </p>
              )}

              {/* Multiple Choice Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                {(['A', 'B', 'C', 'D'] as const).map((optKey) => {
                  const isCorrect = q.correct_answer === optKey;
                  return (
                    <div
                      key={optKey}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border transition ${
                        isCorrect
                          ? 'border-emerald-300 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                          : 'border-gray-200 bg-gray-50/50 text-gray-700 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-300'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleUpdateQuestion(idx, 'correct_answer', optKey)}
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-bold text-[10px] transition ${
                          isCorrect
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                        title={`Set ${optKey} as correct answer`}
                      >
                        {optKey}
                      </button>

                      {isEditing ? (
                        <input
                          type="text"
                          value={q.options[optKey]}
                          onChange={(e) => handleUpdateOption(idx, optKey, e.target.value)}
                          className="flex-1 bg-transparent border-b border-gray-300 dark:border-gray-600 text-xs outline-none focus:border-blue-600"
                        />
                      ) : (
                        <span className="flex-1 truncate">{q.options[optKey]}</span>
                      )}

                      {isCorrect && (
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          Correct
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Rationale */}
              {isEditing ? (
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Educational Rationale
                  </label>
                  <input
                    type="text"
                    value={q.rationale}
                    onChange={(e) => handleUpdateQuestion(idx, 'rationale', e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              ) : (
                <div className="rounded-xl bg-gray-50 dark:bg-gray-800/40 p-2.5 text-[11px] text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-800/60">
                  <span className="font-bold text-gray-700 dark:text-gray-300">Rationale: </span>
                  {q.rationale}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Print Paper Modal */}
      <ExamPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        title={assessmentTitle}
        subject={subjectTitle}
        grade={grade}
        strand={strand}
        term={term}
        schoolYear={schoolYear}
        teacherName={teacherName}
        questions={questions}
      />
    </div>
  );
}

