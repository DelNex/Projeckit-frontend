'use client';

import { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  FileDown,
  Upload,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Loader2,
} from 'lucide-react';
import { TosDocument } from '@/types/tos';
import { ExamQuestion } from '@/lib/exam-types';
import { generateExamDocx, downloadBlob } from '../exam-word-export';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { useExamGenerationJob } from '@/lib/exam-generation-client';
import { extractTextFromFiles } from '@/lib/lesson-parser';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { ExamDraftEditor } from '@/components/assessment/ExamDraftEditor';

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
  const generationJob = useExamGenerationJob(tos?.id);

  const [examDate, setExamDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [materials, setMaterials] = useState<Record<string, CompetencyMaterial>>({});
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [showTeacherCopyModal, setShowTeacherCopyModal] = useState(false);
  const [sharedNotesConfirm, setSharedNotesConfirm] = useState(false);
  const [examDraftDirty, setExamDraftDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (generationJob.savedQuestions) setQuestions(generationJob.savedQuestions);
    if (generationJob.job && ['queued', 'running'].includes(generationJob.job.status)) {
      setIsGenerating(true);
      setGenerationProgress(generationJob.job.progress?.label || (generationJob.job.status === 'queued' ? `Queued (position ${generationJob.job.queuePosition || 1}). Starts when the Gemini helper is available.` : 'Gemini is writing your exam.'));
    } else if (generationJob.job?.status === 'needs_attention') {
      setIsGenerating(false);
      setGenerationProgress('');
    } else if (generationJob.job && ['completed', 'partial', 'failed', 'cancelled'].includes(generationJob.job.status)) {
      setIsGenerating(false);
      setGenerationProgress('');
      if (generationJob.job.status === 'failed') toast.error(generationJob.job.error || 'Exam generation failed. Try again.');
    }
  }, [generationJob.savedQuestions, generationJob.job?.id, generationJob.job?.status, generationJob.job?.progress?.label, generationJob.job?.queuePosition, generationJob.job?.error, toast]);

  // Initialize state
  useEffect(() => {
    if (!isOpen || !tos) return;
    const currentTos = tos;
    setExamDate(new Date().toISOString().split('T')[0]);

    // Load any existing questions from tos_documents or assessments
    if (currentTos.rows) {
      const initMats: Record<string, CompetencyMaterial> = {};
      currentTos.rows.forEach((r, idx) => {
        const id = r.id || String(idx + 1);
        initMats[id] = {
          competencyId: id,
          files: [],
          isUploading: false,
        };
      });
      setMaterials(initMats);
    }

    // Generated questions are first saved on the TOS. A separately saved exam
    // is also stored on linked assessments. Read both and use the newest copy.
    const fetchExistingAssessment = async () => {
      try {
        const [tosResult, assessmentResult] = await Promise.all([
          supabase
            .from('tos_documents')
            .select('questions, updated_at')
            .eq('id', currentTos.id)
            .maybeSingle(),
          supabase
            .from('assessments')
            .select('id, exam_date, questions, section_id, updated_at, created_at')
            .eq('tos_id', currentTos.id)
            .order('updated_at', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1),
        ]);

        if (tosResult.error) console.error('Failed to load saved TOS questions:', tosResult.error);
        if (assessmentResult.error) console.error('Failed to load linked assessment data:', assessmentResult.error);

        const assess = assessmentResult.data?.[0];
        if (assess?.exam_date) setExamDate(assess.exam_date);

        const tosQuestions = Array.isArray(tosResult.data?.questions) ? tosResult.data.questions : [];
        const assessmentQuestions = Array.isArray(assess?.questions) ? assess.questions : [];
        const tosUpdatedAt = Date.parse(tosResult.data?.updated_at || '') || 0;
        const assessmentUpdatedAt = Date.parse(assess?.updated_at || assess?.created_at || '') || 0;
        const savedQuestions = tosQuestions.length > 0 && tosUpdatedAt > assessmentUpdatedAt
          ? tosQuestions
          : assessmentQuestions.length > 0 ? assessmentQuestions : tosQuestions;

        setQuestions(savedQuestions as ExamQuestion[]);
      } catch (e) {
        console.error('Failed to load linked assessment data:', e);
      }
    };

    fetchExistingAssessment();
  }, [isOpen, tos?.id]);

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
      const extraction = await extractTextFromFiles(Array.from(filesList));
      const extractedFiles = extraction.documents;

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
    const hasAnyLessonMaterial = Object.values(materials).some((material) =>
      material.files.some((file) => file.text.trim().length > 0)
    );
    if (!hasAnyLessonMaterial) {
      toast.error('Upload at least one lesson module before generating the exam.');
      return;
    }

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
      const lessonDocuments: Array<{ name: string; text: string }> = [];
      (tos.rows || []).forEach((r, idx) => {
        const id = r.id || String(idx + 1);
        const compFiles = materials[id]?.files || [];
        const compText = compFiles.map((f) => f.text).join('\n\n');
        if (compText) {
          compFiles.forEach((file) => lessonDocuments.push({
            name: `Competency ${idx + 1}: ${r.description} — ${file.name}`,
            text: file.text,
          }));
          combinedText += `\n\n--- COMPETENCY ${idx + 1}: ${r.description} ---\n${compText}`;
        }
      });

      if (!combinedText.trim()) {
        throw new Error('Upload at least one lesson module before generating the exam.');
      }

      setGenerationProgress('Generating questions in structured chunks...');

      const queued = await generationJob.start(lessonDocuments.length ? { lessonDocuments } : { lessonText: combinedText });
      setGenerationProgress(queued.status === 'queued'
        ? `Queued (position ${queued.queuePosition || 1}). Starts when the Gemini helper is available.`
        : queued.status === 'running' ? 'Gemini is already generating questions for this TOS.' : 'This TOS already has a job that needs helper attention.');
    } catch (err: any) {
      console.error('Exam generation error:', err);
      setIsGenerating(false);
      setGenerationProgress('');
      const errorMessage = err instanceof Error && err.message
        ? err.message
        : friendlyError(err, 'The AI service is not available right now. Please try again later.');
      toast.error(errorMessage);
    } finally {
      setSharedNotesConfirm(false);
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
                disabled={isGenerating || generationJob.isStarting || generationJob.helperState === 'offline' || generationJob.helperState === 'needs_attention' || ['queued', 'running', 'needs_attention'].includes(generationJob.job?.status || '')}
                title={generationJob.helperState === 'offline' ? 'The Gemini helper is offline. No generation job can be started.' : undefined}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>{isGenerating ? 'Generating...' : 'Generate Exam'}</span>
              </button>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${generationJob.helperState === 'offline' ? 'border-slate-300 text-slate-600' : generationJob.helperState === 'needs_attention' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
                Helper {generationJob.helperState === 'needs_attention' ? 'needs attention' : generationJob.helperState}
              </span>
              <button
                onClick={() => setShowTeacherCopyModal(true)}
                disabled={questions.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 rounded-xl transition-all disabled:opacity-50"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>Export to Word</span>
              </button>

              <button
                onClick={() => examDraftDirty ? setConfirmClose(true) : onClose()}
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
            {generationJob.job?.status === 'needs_attention' && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span className="font-semibold">The Gemini helper needs attention. This job is paused and will not be retried automatically. Resolve the helper issue, then clear this job to retry.</span>
                <button onClick={() => void generationJob.cancel().catch((error) => toast.error(error.message))} className="ml-auto shrink-0 rounded-lg border border-amber-300 px-3 py-1.5 font-semibold">Clear job</button>
              </div>
            )}

            {generationJob.helperState === 'offline' && !isGenerating && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Gemini helper is offline. Generation is disabled and no new job will be queued until it is available.</div>
            )}
            {generationJob.helperState === 'needs_attention' && generationJob.job?.status !== 'needs_attention' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">Gemini helper needs attention. Resolve the prompt on the helper computer before starting another generation.</div>
            )}

            {isGenerating && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 text-xs text-emerald-900 dark:text-emerald-100">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600 shrink-0" />
                <span className="font-semibold">{generationJob.job?.status === 'needs_attention'
                  ? 'The Gemini helper needs a person to sign in or confirm on the helper computer. Tell your administrator.'
                  : generationJob.job?.status === 'running'
                    ? `${generationJob.job.progress?.label || generationProgress} This is running in the background, you can leave this page.`
                    : generationJob.job?.status === 'queued'
                      ? `Queued (position ${generationJob.job.queuePosition || 1}). Starts when the Gemini helper is available. This is running in the background, you can leave this page.`
                      : generationProgress}</span>
                {['queued', 'running', 'needs_attention'].includes(generationJob.job?.status || '') && <button onClick={() => void generationJob.cancel().catch((error) => toast.error(error.message))} className="ml-auto rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700">Cancel</button>}
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

            {questions.length > 0 && (
              <ExamDraftEditor
                initialQuestions={questions}
                tosId={tos.id}
                targetItems={totalQuestions}
                assessmentTitle={tos.description || tos.subject}
                subjectTitle={tos.subject}
                term={tos.term}
                schoolYear={tos.school_year}
                grade={tos.grade || undefined}
                strand={tos.strand || undefined}
                lessonText={Object.values(materials).flatMap((material) => material.files.map((file) => file.text)).join("\n\n")}
                onQuestionsSaved={setQuestions}
                onQuestionsChange={setQuestions}
                onDraftDirtyChange={setExamDraftDirty}
                onApproveSuccess={() => toast.success('Exam approved and answer key synchronized.')}
              />
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
      <ConfirmationModal isOpen={confirmClose} title="Discard unsaved exam changes?"
        description="Your latest edits have not been saved yet. Close anyway and discard them?"
        actionType="neutral" confirmLabel="Discard changes" cancelLabel="Keep editing"
        onConfirm={() => { setConfirmClose(false); setExamDraftDirty(false); onClose(); }}
        onClose={() => setConfirmClose(false)} />
    </>
  );
}
