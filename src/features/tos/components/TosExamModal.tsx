'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X,
  FileDown,
  Upload,
  FileText,
  Calendar,
  Loader2,
  Printer,

  Sparkles,
  AlertTriangle,
  CheckCircle2,} from 'lucide-react';
import { TosDocument } from '@/types/tos';
import { ExamQuestion, getTosCompetencyId } from '@/lib/exam-types';
import { generateExamDocx, downloadBlob } from '../exam-word-export';
import { printOmrAnswerKey, exportOmrAnswerKeyDocx } from '../omr-answer-key-export';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { useExamGenerationJob } from '@/lib/exam-generation-client';
import { clearPendingLessonExtraction, extractTextFromFiles, resumePendingLessonExtraction } from '@/lib/lesson-parser';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { ExamDraftEditor } from '@/components/assessment/ExamDraftEditor';
import { clearLessonMaterials, loadLessonMaterials, saveLessonMaterials } from '@/lib/lesson-material-storage';
import { useDialogAccessibility } from '@/hooks/use-dialog-accessibility';

interface TosExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  tos: TosDocument | null;
  schoolName: string;
  aiReadiness: { status: 'checking' | 'available' | 'degraded' | 'rate_limited' | 'unavailable' | 'unconfigured'; providers: Array<{ provider: string; status: string }>; checkedAt: string | null };
}

interface CompetencyMaterial {
  competencyId: string;
  files: Array<{ name: string; text: string }>;
  isUploading: boolean;
  error?: string;
  progress?: string;
}

export function TosExamModal({
  isOpen,
  onClose,
  tos,
  schoolName,
  aiReadiness,
}: TosExamModalProps) {
  const { toast } = useToast();
  const supabase = createClient();
  const generationJob = useExamGenerationJob(tos?.id);

  const [examDate, setExamDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [materials, setMaterials] = useState<Record<string, CompetencyMaterial>>({});
  const [materialsReadyForTos, setMaterialsReadyForTos] = useState<string | null>(null);
  const materialsRef = useRef(materials);
  materialsRef.current = materials;
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [showTeacherCopyModal, setShowTeacherCopyModal] = useState(false);
  const [sharedNotesConfirm, setSharedNotesConfirm] = useState(false);
  const [examDraftDirty, setExamDraftDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmClearMaterials, setConfirmClearMaterials] = useState(false);
  const handledSavedQuestionsJobId = useRef<string | null>(null);
  const draftWasEditedRef = useRef(false);
  const activeTosIdRef = useRef<string | null>(tos?.id || null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(dialogRef, isOpen && Boolean(tos) && !confirmClose && !sharedNotesConfirm && !showTeacherCopyModal, () => {
    if (examDraftDirty) setConfirmClose(true);
    else onClose();
  });

  useEffect(() => {
    if (tos?.id && activeTosIdRef.current !== tos.id) {
      activeTosIdRef.current = tos.id;
      handledSavedQuestionsJobId.current = null;
      draftWasEditedRef.current = false;
    }
  }, [tos?.id]);

  useEffect(() => {
    const jobId = generationJob.job?.id;
    if (generationJob.savedQuestions && jobId && handledSavedQuestionsJobId.current !== jobId) {
      handledSavedQuestionsJobId.current = jobId;
      if (!examDraftDirty) setQuestions(generationJob.savedQuestions);
    }
    if (generationJob.job && ['queued', 'running'].includes(generationJob.job.status)) {
      setIsGenerating(true);
      setGenerationProgress(generationJob.job.progress?.label || (generationJob.job.status === 'queued' ? `Queued (position ${generationJob.job.queuePosition || 1}). AI will process this exam in the background.` : 'AI is generating your exam.'));
    } else if (generationJob.job?.status === 'needs_attention') {
      setIsGenerating(false);
      setGenerationProgress('');
    } else if (generationJob.job && ['completed', 'partial', 'failed', 'cancelled'].includes(generationJob.job.status)) {
      setIsGenerating(false);
      setGenerationProgress('');
    }
  }, [generationJob.savedQuestions, generationJob.job?.id, generationJob.job?.status, generationJob.job?.progress?.label, generationJob.job?.queuePosition, generationJob.job?.error, examDraftDirty]);

  // Initialize state
  useEffect(() => {
    if (!isOpen || !tos) return;
    const currentTos = tos;
    setExamDate(new Date().toISOString().split('T')[0]);

    // Load any existing questions from tos_documents or assessments
    if (currentTos.rows) {
      const initMats: Record<string, CompetencyMaterial> = {};
      currentTos.rows.forEach((r, idx) => {
        const id = getTosCompetencyId(r);
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

        if (!draftWasEditedRef.current && handledSavedQuestionsJobId.current === null) {
          setQuestions(savedQuestions as ExamQuestion[]);
        }
      } catch (e) {
        console.error('Failed to load linked assessment data:', e);
      }
    };

    fetchExistingAssessment();
  }, [isOpen, tos?.id]);

  useEffect(() => {
    if (!isOpen || !tos?.id || !Array.isArray(tos.rows)) return;
    let cancelled = false;
    tos.rows.forEach((row, index) => {
      const competencyId = getTosCompetencyId(row);
      void resumePendingLessonExtraction(tos.id, (progress) => {
        if (cancelled) return;
        setMaterials((previous) => ({
          ...previous,
          [competencyId]: { ...previous[competencyId], competencyId, isUploading: true, progress: progress.message },
        }));
      }, competencyId).then((resumed) => {
        if (cancelled || !resumed) return;
        setMaterials((previous) => ({
          ...previous,
          [competencyId]: {
            ...previous[competencyId],
            competencyId,
            files: [...(previous[competencyId]?.files || []), ...resumed.documents],
            isUploading: false,
            error: undefined,
            progress: resumed.notice,
          },
        }));
        clearPendingLessonExtraction(tos.id, competencyId);
        if (resumed.notice) toast.info(resumed.notice);
        toast.success('Recovered saved lesson files for competency ' + (index + 1) + '.');
      }).catch((error) => {
        if (cancelled) return;
        setMaterials((previous) => ({
          ...previous,
          [competencyId]: {
            ...previous[competencyId],
            competencyId,
            isUploading: false,
            error: error instanceof Error ? error.message : 'Could not resume lesson processing.',
          },
        }));
      });
    });
    return () => { cancelled = true; };
  }, [isOpen, tos?.id]);

  useEffect(() => {
    if (!isOpen || !tos?.id) return;
    let cancelled = false;
    setMaterialsReadyForTos(null);
    void loadLessonMaterials(tos.id).then((saved) => {
      if (cancelled) return;
      if (saved) {
        setMaterials((previous) => {
          const merged = { ...previous };
          for (const [competencyId, files] of Object.entries(saved)) {
            const current = merged[competencyId];
            const combinedFiles = [...files, ...(current?.files || [])];
            const seenFiles = new Set<string>();
            const uniqueFiles = combinedFiles.filter((file) => {
              const signature = `${file.name}:${file.text.length}:${file.text.slice(0, 32)}:${file.text.slice(-32)}`;
              if (seenFiles.has(signature)) return false;
              seenFiles.add(signature);
              return true;
            });
            merged[competencyId] = {
              competencyId,
              files: uniqueFiles,
              isUploading: current?.isUploading || false,
              error: current?.error,
              progress: current?.progress || 'Recovered saved lesson materials from this browser.',
            };
          }
          return merged;
        });
      }
      setMaterialsReadyForTos(tos.id);
    }).catch((error) => {
      console.warn('Could not recover saved lesson materials:', error);
      if (!cancelled) {
        setMaterialsReadyForTos(tos.id);
      }
    });
    return () => { cancelled = true; };
  }, [isOpen, tos?.id]);

  const materialPersistenceKey = Object.entries(materials).map(([competencyId, material]) =>
    `${competencyId}:${material.files.map((file) => `${file.name}:${file.text.length}:${file.text.slice(0, 32)}:${file.text.slice(-32)}`).join('|')}`
  ).join('||');

  useEffect(() => {
    if (!isOpen || !tos?.id || materialsReadyForTos !== tos.id) return;
    const stored: Record<string, Array<{ name: string; text: string }>> = {};
    for (const [competencyId, material] of Object.entries(materialsRef.current)) {
      const files = material.files.filter((file) => file.text.trim()).map(({ name, text }) => ({ name, text }));
      if (files.length) stored[competencyId] = files;
    }
    void saveLessonMaterials(tos.id, stored).catch((error) => console.warn('Could not save lesson materials:', error));
  }, [isOpen, tos?.id, materialsReadyForTos, materialPersistenceKey]);

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
      const extraction = await extractTextFromFiles(Array.from(filesList), {
        tosId: tos?.id,
        contextId: competencyId,
        onProgress: (progress) => setMaterials((prev) => ({
          ...prev,
          [competencyId]: { ...prev[competencyId], isUploading: true, progress: progress.message },
        })),
      });
      if (tos?.id) clearPendingLessonExtraction(tos.id, competencyId);
      if (extraction.notice) toast.info(extraction.notice);
      const extractedFiles = extraction.documents;

      setMaterials((prev) => ({
        ...prev,
        [competencyId]: {
          ...prev[competencyId],
          files: [...(prev[competencyId]?.files || []), ...extractedFiles],
          isUploading: false,
          progress: extraction.notice,
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

  const handleClearSavedMaterials = async () => {
    if (!tos?.id) return;
    setConfirmClearMaterials(false);
    setMaterials((previous) => Object.fromEntries(Object.entries(previous).map(([id, material]) => [id, { ...material, files: [] }])));
    try { await clearLessonMaterials(tos.id); }
    catch (error) { console.warn('Could not clear saved lesson materials:', error); }
    toast.info('Saved lesson materials were cleared from this browser.');
  };

  const handleDraftDirtyChange = (dirty: boolean) => {
    if (dirty) draftWasEditedRef.current = true;
    setExamDraftDirty(dirty);
  };

  const handleQuestionsSaved = (saved: ExamQuestion[]) => {
    setQuestions(saved);
  };

  const handleExamApproved = () => {
    if (tos?.id) void clearLessonMaterials(tos.id).catch((error) => console.warn('Could not clear saved lesson materials:', error));
    setMaterials((previous) => Object.fromEntries(Object.entries(previous).map(([id, material]) => [id, { ...material, files: [] }])));
    toast.success('Exam approved and answer key synchronized.');
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

  // Generate examination
  const handleGenerateExam = async () => {
    if (examDate < new Date().toLocaleDateString("en-CA")) {
      toast.error('Exam date cannot be in the past.');
      return;
    }
    const hasAnyLessonMaterial = Object.values(materials).some((material) =>
      material.files.some((file) => file.text.trim().length > 0)
    );
    if (!hasAnyLessonMaterial) {
      toast.error('Choose at least one lesson module before generating the exam.');
      return;
    }

    // Check if any competency has no files
    const missingCompetencies = (tos.rows || []).filter((r, idx) => {
      const id = getTosCompetencyId(r);
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
      const lessonDocuments: Array<{ name: string; text: string; competencyId: string }> = [];
      (tos.rows || []).forEach((r, idx) => {
        const id = getTosCompetencyId(r);
        const compFiles = materials[id]?.files || [];
        const compText = compFiles.map((f) => f.text).join('\n\n');
        if (compText) {
          compFiles.forEach((file) => lessonDocuments.push({
            name: `Competency ${idx + 1}: ${r.description} — ${file.name}`,
            text: file.text,
            competencyId: getTosCompetencyId(r),
          }));
          combinedText += `\n\n--- COMPETENCY ${idx + 1}: ${r.description} ---\n${compText}`;
        }
      });

      if (!combinedText.trim()) {
        throw new Error('Choose at least one lesson module before generating the exam.');
      }

      setGenerationProgress('Generating questions in structured chunks...');

      const queued = await generationJob.start(lessonDocuments.length ? { lessonDocuments } : { lessonText: combinedText });
      setGenerationProgress(queued.status === 'queued'
        ? `Queued (position ${queued.queuePosition || 1}). AI will process this exam in the background.`
        : queued.status === 'running' ? 'Exam generation is already in progress.' : 'This TOS already has a job that needs worker attention.');
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

  // Word Export (Student Question Paper)
  const handleExportWord = async (isTeacherCopy = false) => {
    if (!tos) return;
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

  // OMR Answer Key Export (Auto-Print / PDF or Transform into DOCX)
  const handleExportOmrAnswerKey = async (mode: 'print' | 'docx') => {
    if (!tos) return;
    if (questions.length === 0) {
      toast.error('Please generate or add questions before exporting the answer key.');
      return;
    }

    try {
      if (mode === 'print') {
        printOmrAnswerKey(tos, questions, { schoolName, examDate });
        toast.success('Print preview opened for OMR Answer Key.');
      } else {
        toast.info('Generating Word document with OMR Answer Key...');
        await exportOmrAnswerKeyDocx(tos, questions, { schoolName, examDate });
        toast.success('OMR Answer Key Word document downloaded successfully.');
      }
    } catch (err) {
      console.error('Failed to export OMR answer key:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to export OMR answer key.');
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="generated-exam-title">
        <div ref={dialogRef} tabIndex={-1} className="relative box-border flex h-[100dvh] max-h-[100dvh] w-full max-w-full min-w-0 flex-col overflow-x-hidden overflow-y-hidden border border-slate-200 bg-white shadow-none outline-none dark:border-slate-800 dark:bg-slate-900 sm:mx-auto sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-[16px] sm:shadow-xl">
          {/* Header */}
          <div className="sticky top-0 z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pr-16 sm:px-6 sm:py-4 sm:pt-4 sm:pr-6 border-b border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 shrink-0">
            <div>
              <h2 id="generated-exam-title" className="break-words text-base font-bold leading-snug text-slate-900 dark:text-white sm:text-xl">
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
                  min={new Date().toLocaleDateString("en-CA")}
                  className="min-h-11 min-w-0 bg-transparent font-medium text-slate-900 dark:text-white outline-none cursor-pointer"
                />
              </div>
              {examDate < new Date().toLocaleDateString("en-CA") && <p className="w-full text-xs font-semibold text-rose-700 dark:text-rose-300" role="alert">Exam date cannot be in the past.</p>}

              <button
                onClick={handleGenerateExam}
                disabled={isGenerating || examDate < new Date().toLocaleDateString("en-CA") || generationJob.isStarting || generationJob.retryAfterSeconds > 0 || (generationJob.quotaAvailable && Boolean(generationJob.quota && (generationJob.quota.hourly.remaining <= 0 || generationJob.quota.daily.remaining <= 0))) || ['queued', 'running', 'needs_attention'].includes(generationJob.job?.status || '')}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                <span>{isGenerating ? 'Generating...' : 'Generate exam'}</span>
              </button>
              <button
                onClick={() => setShowTeacherCopyModal(true)}
                disabled={questions.length === 0}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 rounded-xl transition-all disabled:opacity-50"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span className="whitespace-nowrap">Export Exam / Key</span>
              </button>

              <button
                onClick={() => examDraftDirty ? setConfirmClose(true) : onClose()}
                className="absolute right-4 top-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors sm:static"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 space-y-6">
            {/* Provider access is checked on the TOS page in the background. It never gates uploads. */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
                {aiReadiness.status === 'checking'
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : aiReadiness.status === 'available'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
                <span>
                  {aiReadiness.status === 'checking' ? 'AI provider: Checking…'
                    : aiReadiness.status === 'available' ? 'AI provider: Connected'
                      : aiReadiness.status === 'degraded' ? 'AI provider: Partially available'
                        : aiReadiness.status === 'rate_limited' ? 'AI provider: Rate limited'
                          : aiReadiness.status === 'unconfigured' ? 'AI provider: Not configured'
                            : 'AI provider: Unavailable'}
                </span>
              </div>
              <p className="mt-1 hidden sm:block">You can choose and process lesson files while this check runs. It does not use an exam-generation attempt. The check verifies provider API access, not model output or generation quota.</p>
            </div>

            {/* Generation Progress Banner */}
            {generationJob.job?.status === 'needs_attention' && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <span className="font-semibold">This AI job needs attention. Review its error, then clear the job to retry.</span>
                <button onClick={() => void generationJob.cancel().catch((error) => toast.error(error.message))} className="ml-auto shrink-0 rounded-lg border border-amber-300 px-3 py-1.5 font-semibold">Clear job</button>
              </div>
            )}

            {generationJob.quotaAvailable && generationJob.quota && (
              <p className={`text-[11px] font-medium ${generationJob.quota.hourly.remaining <= 1 || generationJob.quota.daily.remaining <= 5 ? "text-amber-700 dark:text-amber-300" : "text-slate-600 dark:text-slate-300"}`}>
                {generationJob.quota.hourly.remaining} of {generationJob.quota.hourly.limit} left this hour · {generationJob.quota.daily.remaining} of {generationJob.quota.daily.limit} left today
              </p>
            )}
            {generationJob.job?.status === 'failed' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-semibold">{generationJob.retryState.lastError || generationJob.job.error || 'The last generation attempt did not complete. Your saved TOS and existing questions were not changed.'}</p>
                {generationJob.retryAfterSeconds <= 0 && <p className="mt-1">You can try generating again. Your saved lesson materials are still available.</p>}
              </div>
            )}
            {generationJob.retryAfterSeconds > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <p className="font-semibold">Please wait before retrying this exam.</p>
                <p className="mt-1">Retry available in {Math.floor(generationJob.retryAfterSeconds / 60)}:{String(generationJob.retryAfterSeconds % 60).padStart(2, '0')}. The server will check this limit again when you submit.</p>
              </div>
            )}
            {generationJob.quotaAvailable && generationJob.quota && (generationJob.quota.hourly.remaining <= 0 || generationJob.quota.daily.remaining <= 0) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                {generationJob.quota.hourly.remaining <= 0 ? 'You have reached your hourly exam-generation limit.' : 'Your school has reached its daily exam-generation limit.'} Please wait before generating another exam.
              </div>
            )}
            {isGenerating && (
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center gap-3 text-xs text-emerald-900 dark:text-emerald-100">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600 shrink-0" />
                <span className="font-semibold">{generationJob.job?.status === 'needs_attention'
                  ? 'The AI generation job needs attention. Review the error and retry.'
                  : generationJob.job?.status === 'running'
                    ? `${generationJob.job.progress?.label || generationProgress} This is running in the background, you can leave this page.`
                    : generationJob.job?.status === 'queued'
                      ? `Queued (position ${generationJob.job.queuePosition || 1}). AI will process this exam in the background. This is running in the background, you can leave this page.`
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
                  Choose lesson presentations, scanned PDFs, or photos from this device (PDF, DOCX, PPTX, TXT, Markdown, PNG, JPG, WebP). Extracted text is kept in this browser for up to 7 days so you can return after closing the page.
                </p>
              </div>

              <div className="space-y-3">
                {(tos.rows || []).map((row, idx) => {
                  const id = getTosCompetencyId(row);
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
                          <span className="ml-1.5 break-words text-xs font-semibold text-[var(--pk-text-secondary)]">
                            {row.description}
                          </span>
                        </div>

                        <label className="inline-flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--pk-text)] bg-white dark:bg-[var(--pk-raised)] border border-slate-200 dark:border-[var(--pk-line)] rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 cursor-pointer shrink-0 transition-colors">
                          <Upload className="h-3.5 w-3.5" />
                          <span>{mat.isUploading ? 'Processing on the server...' : 'Choose Files'}</span>
                          <input
                            type="file"
                            multiple
                            accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
                            onChange={(e) => handleFileUpload(id, e.target.files)}
                            className="hidden"
                            disabled={mat.isUploading}
                          />
                        </label>
                      </div>

                      {mat.progress && <p className={'text-xs ' + (mat.isUploading || mat.progress.includes('Recovered') ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300')}>{mat.progress}</p>}

                      {/* File Chips */}
                      {mat.files.length > 0 ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {mat.files.map((file, fIdx) => (
                            <div
                              key={fIdx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[var(--pk-raised)] border border-slate-200 dark:border-[var(--pk-line)] text-xs text-[var(--pk-text)]"
                            >
                              <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span className="max-w-[180px] truncate">{file.name} <span className="text-[10px] text-slate-500">({Math.max(1, Math.ceil(file.text.length / 1024))} KB)</span></span>
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(id, fIdx)}
                                className="ml-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-slate-300 dark:hover:text-rose-400"
                                title="Remove file"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500 dark:text-slate-300">
                          No local lesson files selected for this competency. Questions will be synthesized from curriculum objectives.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {Object.values(materials).some((material) => material.files.length > 0) && (
                <div className="flex justify-end border-t border-slate-200 pt-3 dark:border-slate-700">
                  <button type="button" onClick={() => setConfirmClearMaterials(true)} className="min-h-11 rounded-lg px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-rose-300">Clear saved lesson materials</button>
                </div>
              )}
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
                onQuestionsSaved={handleQuestionsSaved}
                onQuestionsChange={setQuestions}
                onDraftDirtyChange={handleDraftDirtyChange}
                onApproveSuccess={handleExamApproved}
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

      {/* Export Options Modal */}
      {showTeacherCopyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 ">
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Export Examination
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Select which version of the examination you would like to get:
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              {/* Option 1: Student Question Paper (.docx) */}
              <button
                type="button"
                onClick={() => {
                  setShowTeacherCopyModal(false);
                  handleExportWord(false);
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold text-slate-900 dark:text-white transition-colors text-left"
              >
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">Student Question Paper</div>
                  <div className="text-[11px] text-slate-400 font-normal">Clean test sheet</div>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-md shrink-0">
                  .docx
                </span>
              </button>

              {/* Option 2: OMR with answers filled out (The ONLY Answer Key Choice) */}
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-3 space-y-2">
                <div className="flex items-start justify-between gap-1.5">
                  <div>
                    <div className="text-xs font-bold text-emerald-950 dark:text-emerald-100">
                      OMR with answers filled out
                    </div>
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">
                      Official answer sheet with bubbles shaded
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
                    ANSWER KEY
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTeacherCopyModal(false);
                      handleExportOmrAnswerKey('print');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
                    title="Automatically open print preview / save as PDF"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    <span>Auto-Print</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowTeacherCopyModal(false);
                      handleExportOmrAnswerKey('docx');
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-slate-700 text-emerald-900 dark:text-emerald-200 text-xs font-bold transition shadow-xs cursor-pointer"
                    title="Transform OMR answer sheet into Word (.docx)"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span>Word (.docx)</span>
                  </button>
                </div>
              </div>
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
      <ConfirmationModal isOpen={confirmClearMaterials} title="Clear saved lesson materials?" description="This removes the lesson files saved in this browser for this TOS. You can upload them again later." confirmLabel="Clear materials" actionType="danger" onConfirm={handleClearSavedMaterials} onClose={() => setConfirmClearMaterials(false)} />
      <ConfirmationModal isOpen={confirmClose} title="Discard unsaved exam changes?"
        description="Your latest edits have not been saved yet. Close anyway and discard them?"
        actionType="neutral" confirmLabel="Discard changes" cancelLabel="Keep editing"
        onConfirm={() => { setConfirmClose(false); setExamDraftDirty(false); onClose(); }}
        onClose={() => setConfirmClose(false)} />
    </>
  );
}
