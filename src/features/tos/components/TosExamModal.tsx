'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  Save,
  FileDown,
  Upload,
  FileText,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Loader2,
  RefreshCw,
  Edit3,
} from 'lucide-react';
import { TosDocument } from '@/types/tos';
import { ExamQuestion } from '@/lib/exam-types';
import { generateExamDocx, downloadBlob } from '../exam-word-export';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';

interface TosExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  tos: TosDocument | null;
  schoolName: string;
}

interface CompetencyMaterial {
  competencyId: string;
  files: Array<{ name: string; text: string }>;
  isUploading: boolean;
  error?: string;
}

export function TosExamModal({
  isOpen,
  onClose,
  tos,
  schoolName,
}: TosExamModalProps) {
  const { toast } = useToast();
  const supabase = createClient();

  const [examDate, setExamDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [materials, setMaterials] = useState<Record<string, CompetencyMaterial>>({});
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [showTeacherCopyModal, setShowTeacherCopyModal] = useState(false);
  const [sharedNotesConfirm, setSharedNotesConfirm] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);

  // Initialize state
  useEffect(() => {
    if (!isOpen || !tos) return;

    // Load any existing questions from tos_documents or assessments
    if (tos.rows) {
      const initMats: Record<string, CompetencyMaterial> = {};
      tos.rows.forEach((r, idx) => {
        const id = r.id || String(idx + 1);
        initMats[id] = {
          competencyId: id,
          files: [],
          isUploading: false,
        };
      });
      setMaterials(initMats);
    }

    // Check if there is an existing assessment linked
    const fetchExistingAssessment = async () => {
      try {
        const { data: assess } = await (supabase as any)
          .from('assessments')
          .select('id, exam_date, questions')
          .eq('tos_id', tos.id)
          .maybeSingle();

        if (assess) {
          if (assess.exam_date) setExamDate(assess.exam_date);
          if (Array.isArray(assess.questions) && assess.questions.length > 0) {
            setQuestions(assess.questions);
          }
        }
      } catch (e) {
        console.error('Failed to load linked assessment data:', e);
      }
    };

    fetchExistingAssessment();
  }, [isOpen, tos, supabase]);

  if (!isOpen || !tos) return null;

  const totalQuestions = tos.target_items || 50;

  // File Upload per competency
  const handleFileUpload = async (competencyId: string, filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;

    setMaterials((prev) => ({
      ...prev,
      [competencyId]: {
        ...prev[competencyId],
        isUploading: true,
        error: undefined,
      },
    }));

    try {
      const formData = new FormData();
      for (let i = 0; i < filesList.length; i++) {
        formData.append('files', filesList[i]);
      }

      const res = await fetch('/api/ai/extract-lesson-text', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to extract text from files');
      }

      const extractedFiles: Array<{ name: string; text: string }> = data.files.map((f: any) => ({
        name: f.name,
        text: f.text,
      }));

      setMaterials((prev) => ({
        ...prev,
        [competencyId]: {
          ...prev[competencyId],
          files: [...(prev[competencyId]?.files || []), ...extractedFiles],
          isUploading: false,
        },
      }));

      toast.success(`Extracted text from ${extractedFiles.length} file(s) for competency.`);
    } catch (err: any) {
      console.error('File upload error:', err);
      setMaterials((prev) => ({
        ...prev,
        [competencyId]: {
          ...prev[competencyId],
          isUploading: false,
          error: err.message || 'Upload failed',
        },
      }));
      toast.error(err.message || 'File upload failed');
    }
  };

  const handleDeleteFile = (competencyId: string, fileIndex: number) => {
    setMaterials((prev) => {
      const current = prev[competencyId];
      if (!current) return prev;
      const nextFiles = [...current.files];
      nextFiles.splice(fileIndex, 1);
      return {
        ...prev,
        [competencyId]: {
          ...current,
          files: nextFiles,
        },
      };
    });
  };

  // Generate Examination
  const handleGenerateExam = async () => {
    // Check if any competency has no files
    const missingCompetencies = (tos.rows || []).filter((r, idx) => {
      const id = r.id || String(idx + 1);
      return !materials[id] || materials[id].files.length === 0;
    });

    if (missingCompetencies.length > 0 && !sharedNotesConfirm) {
      setSharedNotesConfirm(true);
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('Preparing competency specifications...');

    try {
      // Gather all text per competency
      let combinedText = '';
      (tos.rows || []).forEach((r, idx) => {
        const id = r.id || String(idx + 1);
        const compFiles = materials[id]?.files || [];
        const compText = compFiles.map((f) => f.text).join('\n\n');
        if (compText) {
          combinedText += `\n\n--- COMPETENCY ${idx + 1}: ${r.description} ---\n${compText}`;
        }
      });

      if (!combinedText.trim()) {
        combinedText = `Generate a DepEd standardized assessment for ${tos.subject} (${tos.term}) based on competencies:\n` +
          (tos.rows || []).map((r, i) => `${i + 1}. ${r.description}`).join('\n');
      }

      setGenerationProgress('Generating questions in structured chunks...');

      const response = await fetch('/api/ai/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tosId: tos.id,
          lessonText: combinedText,
          targetItems: totalQuestions,
          tosRows: tos.rows,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate examination');
      }

      setQuestions(result.questions || []);
      toast.success(`Generated ${result.questions?.length || 0} exam questions with balanced options!`);
    } catch (err: any) {
      console.error('Exam generation error:', err);
      toast.error(friendlyError(err, 'The AI service is not available right now. Please try again later.'));
    } finally {
      setIsGenerating(false);
      setGenerationProgress('');
      setSharedNotesConfirm(false);
    }
  };

  // Save Examination and Linked Assessment
  const handleSaveExam = async () => {
    if (questions.length === 0) {
      toast.error('No questions to save. Please generate or enter questions first.');
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Upsert linked assessment
      const payload = {
        tos_id: tos.id,
        tenant_id: tos.tenant_id,
        title: tos.description || `${tos.exam_type || 'Examination'} in ${tos.subject}`,
        subject: tos.subject,
        term: tos.term,
        school_year: tos.school_year,
        exam_date: examDate,
        total_items: totalQuestions,
        questions: questions,
        created_by: user?.id,
        teacher_name: tos.teacher_name,
        section: tos.section,
      };

      const { data: saved, error } = await (supabase as any)
        .from('assessments')
        .upsert(payload, { onConflict: 'tos_id' })
        .select()
        .single();

      if (error) throw error;

      // Also link to tos_documents
      if (saved?.id) {
        await (supabase as any)
          .from('tos_documents')
          .update({ assessment_id: saved.id })
          .eq('id', tos.id);
      }

      toast.success('Examination draft and linked assessment successfully saved!');
    } catch (err: any) {
      console.error('Failed to save examination:', err);
      toast.error(friendlyError(err, 'Failed to save examination.'));
    } finally {
      setIsSaving(false);
    }
  };

  // Word Export
  const handleExportWord = async (isTeacherCopy = false) => {
    if (questions.length === 0) {
      toast.error('Please generate or add questions before exporting to Word.');
      return;
    }

    try {
      const blob = await generateExamDocx(tos, questions, {
        schoolName,
        isTeacherCopy,
        examDate,
      });

      const cleanSubj = tos.subject.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `Exam_${cleanSubj}_${isTeacherCopy ? 'TeacherCopy' : 'StudentSheet'}.docx`;
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Failed to export exam docx:', err);
      toast.error('Failed to generate Word document.');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <div className="relative w-full sm:max-w-5xl h-full sm:h-auto sm:max-h-[92vh] bg-white dark:bg-slate-900 sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {tos.description || `${tos.exam_type || 'Examination'} in ${tos.subject}`}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {totalQuestions} questions based on the Table of Specifications allocation
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Exam Date Picker with Save Date */}
              <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-xl text-xs">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <span className="font-semibold text-slate-700 dark:text-slate-300">Exam Date:</span>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="bg-transparent font-medium text-slate-900 dark:text-white outline-none cursor-pointer"
                />
              </div>

              <button
                onClick={handleGenerateExam}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>{isGenerating ? 'Generating...' : 'Generate Exam'}</span>
              </button>

              <button
                onClick={handleSaveExam}
                disabled={isSaving || questions.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>Save Examination</span>
              </button>

              <button
                onClick={() => setShowTeacherCopyModal(true)}
                disabled={questions.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 rounded-xl transition-all disabled:opacity-50"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Export to Word</span>
              </button>

              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* Generation Progress Banner */}
            {isGenerating && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 text-xs text-emerald-900 dark:text-emerald-100">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600 shrink-0" />
                <span className="font-semibold">{generationProgress}</span>
              </div>
            )}

            {/* AI Draft Review Banner */}
            {questions.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center gap-2.5 text-xs text-indigo-900 dark:text-indigo-200">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="font-semibold">
                  AI-generated draft: review every question before approving and administering.
                </span>
              </div>
            )}

            {/* 1. Learning Materials By Competency */}
            <div className="space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Learning Materials by Competency
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Upload lesson presentations or references (PDF, DOCX, PPTX, TXT). Each competency generates questions from its own materials.
                </p>
              </div>

              <div className="space-y-3">
                {(tos.rows || []).map((row, idx) => {
                  const id = row.id || String(idx + 1);
                  const mat = materials[id] || { competencyId: id, files: [], isUploading: false };
                  return (
                    <div
                      key={id}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            Competency {idx + 1}:
                          </span>
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 ml-1.5">
                            {row.description}
                          </span>
                        </div>

                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer shrink-0 transition-colors">
                          <Upload className="h-3.5 w-3.5" />
                          <span>{mat.isUploading ? 'Extracting...' : 'Upload Files'}</span>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.docx,.pptx,.txt,.md"
                            onChange={(e) => handleFileUpload(id, e.target.files)}
                            className="hidden"
                            disabled={mat.isUploading}
                          />
                        </label>
                      </div>

                      {/* File Chips */}
                      {mat.files.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {mat.files.map((file, fIdx) => (
                            <div
                              key={fIdx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-200"
                            >
                              <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span className="truncate max-w-[180px]">{file.name}</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(id, fIdx)}
                                className="text-slate-400 hover:text-rose-500 ml-0.5"
                                title="Remove file"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic">
                          No files uploaded for this competency. Questions will be synthesized from curriculum objectives.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Generated Questions List */}
            {questions.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Questions ({questions.length} Items)
                  </h3>
                  <span className="text-xs text-slate-500">Multiple Choice (A to D)</span>
                </div>

                <div className="space-y-3">
                  {questions.map((q, qIdx) => {
                    const itemNum = q.item_number || qIdx + 1;
                    const optionsObj = q.options as Record<string, string>;
                    const isEditing = editingQuestionIndex === qIdx;

                    return (
                      <div
                        key={itemNum}
                        className="p-4 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-black bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                              Item {itemNum}
                            </span>
                            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              {q.cognitive_level || 'Understanding'}
                            </span>
                            <span className="text-xs text-slate-400">• Multiple Choice</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setEditingQuestionIndex(isEditing ? null : qIdx)}
                            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 font-medium"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>{isEditing ? 'Done' : 'Edit'}</span>
                          </button>
                        </div>

                        {/* Stem */}
                        {isEditing ? (
                          <textarea
                            value={q.question}
                            onChange={(e) => {
                              const next = [...questions];
                              next[qIdx] = { ...next[qIdx], question: e.target.value };
                              setQuestions(next);
                            }}
                            rows={2}
                            className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white"
                          />
                        ) : (
                          <p className="text-xs font-medium text-slate-900 dark:text-white leading-relaxed">
                            {q.question}
                          </p>
                        )}

                        {/* Options A to D */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          {(['A', 'B', 'C', 'D'] as const).map((letter) => {
                            const isCorrect = q.correct_answer === letter;
                            return (
                              <div
                                key={letter}
                                onClick={() => {
                                  if (isEditing) {
                                    const next = [...questions];
                                    next[qIdx] = { ...next[qIdx], correct_answer: letter };
                                    setQuestions(next);
                                  }
                                }}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                                  isCorrect
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 font-semibold text-emerald-900 dark:text-emerald-200'
                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                                } ${isEditing ? 'cursor-pointer' : ''}`}
                              >
                                <span className="font-bold w-4">{letter}.</span>
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={optionsObj[letter] || ''}
                                    onChange={(e) => {
                                      const next = [...questions];
                                      next[qIdx] = {
                                        ...next[qIdx],
                                        options: {
                                          ...optionsObj,
                                          [letter]: e.target.value,
                                        } as { A: string; B: string; C: string; D: string },
                                      };
                                      setQuestions(next);
                                    }}
                                    className="flex-1 bg-transparent text-xs outline-none"
                                  />
                                ) : (
                                  <span className="flex-1">{optionsObj[letter]}</span>
                                )}
                                {isCorrect && (
                                  <span className="text-[10px] font-black uppercase text-emerald-600 shrink-0">
                                    Correct
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Rationale */}
                        {q.rationale && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-900/40 p-2 rounded-lg">
                            <strong>Rationale:</strong> {q.rationale}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shared Notes Confirmation Dialog */}
      <ConfirmationModal
        isOpen={sharedNotesConfirm}
        title="Proceed without files for some competencies?"
        description="One or more learning competencies do not have uploaded materials. Would you like to generate questions using official curriculum objectives and shared topics?"
        confirmLabel="Yes, Generate Now"
        cancelLabel="Upload Files First"
        actionType="neutral"
        onConfirm={() => {
          setSharedNotesConfirm(false);
          handleGenerateExam();
        }}
        onClose={() => setSharedNotesConfirm(false)}
      />

      {/* Export to Word Options Modal */}
      {showTeacherCopyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Export Examination to Word (.docx)
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Select which version of the examination you would like to download:
            </p>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowTeacherCopyModal(false);
                  handleExportWord(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold text-slate-900 dark:text-white transition-colors"
              >
                <span>Student Question Paper</span>
                <span className="text-slate-400 font-normal">Clean test sheet</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowTeacherCopyModal(false);
                  handleExportWord(true);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-xs font-semibold text-emerald-900 dark:text-emerald-200 transition-colors"
              >
                <span>Teacher Copy & Answer Key</span>
                <span className="text-emerald-700 font-normal">Includes rationale</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTeacherCopyModal(false)}
              className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
