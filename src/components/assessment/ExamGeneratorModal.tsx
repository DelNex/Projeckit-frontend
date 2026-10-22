'use client';

import React, { useState, useRef, useEffect } from 'react';
import { extractTextFromFiles } from '@/lib/lesson-parser';
import { ExamQuestion } from '@/lib/exam-types';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import { buildTosBlueprintSlots } from '@/lib/exam-types';
import { useExamGenerationJob } from '@/lib/exam-generation-client';
import { getClientUploadLimits } from '@/lib/upload-limits-client';

interface ExamGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId?: string;
  tosId?: string;
  targetItems: number;
  tosRows: any[];
  subjectTitle: string;
  onExamGenerated: (
    questions: ExamQuestion[],
    lessonText: string,
    source?: string,
    missingItemNumbers?: number[],
    isSampleDemo?: boolean
  ) => void;
}

type GenerationStep =
  | 'idle'
  | 'uploading'
  | 'extracting'
  | 'analyzing'
  | 'generating'
  | 'validating'
  | 'done';

const STEP_LABELS: Record<GenerationStep, string> = {
  idle: 'Ready to start',
  uploading: 'Uploading lesson file(s)...',
  extracting: 'Extracting text from document(s)...',
  analyzing: 'Analyzing lesson coverage against TOS...',
  generating: 'Writing questions from your lesson...',
  validating: 'Checking question count and answers...',
  done: 'Exam generation complete!',
};

export function ExamGeneratorModal({
  isOpen,
  onClose,
  assessmentId,
  tosId,
  targetItems,
  tosRows,
  subjectTitle,
  onExamGenerated,
}: ExamGeneratorModalProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const generatedTextRef = useRef('');
  const handledJobRef = useRef<string | null>(null);
  const onExamGeneratedRef = useRef(onExamGenerated);
  const onCloseRef = useRef(onClose);
  onExamGeneratedRef.current = onExamGenerated;
  onCloseRef.current = onClose;
  const generationJob = useExamGenerationJob(tosId);

  const [currentStep, setCurrentStep] = useState<GenerationStep>('idle');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [truncationNotice, setTruncationNotice] = useState<string | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{
    completed: number;
    total: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!generationJob.savedQuestions || !generationJob.job?.id || !['completed', 'partial'].includes(generationJob.job.status) || handledJobRef.current === generationJob.job.id) return;
    handledJobRef.current = generationJob.job.id;
    setCurrentStep('done');
    setChunkProgress(null);
    toast.success(`Loaded ${generationJob.savedQuestions.length} saved exam questions.`);
    onExamGeneratedRef.current(generationJob.savedQuestions, generatedTextRef.current, 'Gemini helper queue', generationJob.job?.resultSummary?.missingItems || [], false);
    onCloseRef.current();
  }, [generationJob.savedQuestions, generationJob.job?.id, generationJob.job?.status, generationJob.job?.resultSummary?.missingItems, toast]);

  useEffect(() => {
    if (!generationJob.job || !['failed', 'cancelled', 'needs_attention'].includes(generationJob.job.status)) return;
    setCurrentStep('idle');
    if (generationJob.job.status === 'failed') setErrorMsg(generationJob.job.error || 'Exam generation failed. You can try again.');
    if (generationJob.job.status === 'needs_attention') setErrorMsg('The Gemini helper needs attention. Resolve the helper issue, clear this paused job, then retry.');
  }, [generationJob.job?.id, generationJob.job?.status, generationJob.job?.error]);

  if (!isOpen) return null;

  const handleFilesSelect = async (files: FileList | File[]) => {
    const validExts = ['.pdf', '.docx', '.pptx', '.txt', '.md'];
    const incoming = Array.from(files);

    if (selectedFiles.length + incoming.length > 5) {
      toast.error('Maximum 5 files allowed per upload.');
      return;
    }

    const validFiles: File[] = [];
    const limits = await getClientUploadLimits();
    for (const file of incoming) {
      const lowerName = file.name.toLowerCase();
      const isValid = validExts.some((ext) => lowerName.endsWith(ext));

      if (!isValid) {
        toast.error(`'${file.name}' is not supported. Use PDF, DOCX, PPTX, or TXT.`);
        return;
      }

      if (file.size > limits.maxModuleUploadMb * 1024 * 1024) {
        toast.error(`This file is ${Math.ceil(file.size / (1024 * 1024))} MB. The limit for your school is ${limits.maxModuleUploadMb} MB.`);
        return;
      }

      validFiles.push(file);
    }

    setSelectedFiles((prev) => [...prev, ...validFiles].slice(0, 5));
    setErrorMsg(null);
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelect(e.dataTransfer.files);
    }
  };

  const handleStartGeneration = async () => {
    if (selectedFiles.length === 0 && !pastedText.trim()) {
      toast.error('Please upload a lesson document or paste lesson content.');
      return;
    }

    setErrorMsg(null);
    setTruncationNotice(null);
    let extractedLessonText = pastedText.trim();
    let lessonDocuments: Array<{ name: string; text: string }> = pastedText.trim()
      ? [{ name: 'Pasted lesson text', text: pastedText.trim() }]
      : [];

    try {
      // Step 1: Uploading
      if (selectedFiles.length > 0) {
        setCurrentStep('uploading');

        // Step 2: Extracting text on server
        setCurrentStep('extracting');
        const extractResult = await extractTextFromFiles(selectedFiles);
        lessonDocuments = [...extractResult.documents, ...lessonDocuments];
        extractedLessonText = (extractResult.text + (extractedLessonText ? `\n\n${extractedLessonText}` : '')).trim();

        if (extractResult.notice) {
          setTruncationNotice(extractResult.notice);
          toast.info(extractResult.notice);
        }

        if (!extractedLessonText.trim()) {
          throw new Error('This file has no readable text. Upload a text-based PDF, DOCX or PPTX.');
        }
      }

      // Step 3: Analyzing lesson coverage
      setCurrentStep('analyzing');

      const allSlots = buildTosBlueprintSlots(tosRows, Number(targetItems) || 50);
      if (!tosId) throw new Error('Save this Table of Specifications before generating an exam.');
      generatedTextRef.current = extractedLessonText;
      const queued = await generationJob.start({ lessonDocuments });
      const label = queued.status === 'queued'
        ? `Queued (position ${queued.queuePosition || 1}). Starts when the Gemini helper is available.`
        : queued.status === 'running' ? 'Gemini is already generating questions for this TOS.' : 'This TOS already has a job that needs helper attention.';
      setChunkProgress({ completed: 0, total: allSlots.length, label });
      setCurrentStep('generating');
    } catch (err: any) {
      console.error('Exam generation failed:', err);
      setErrorMsg(err.message || 'Generation failed.');
      setCurrentStep('idle');
      toast.error(err instanceof Error && err.message ? err.message : friendlyError(err, 'Could not complete exam generation.'));
    }
  };

  const stepOrder: GenerationStep[] = [
    'uploading',
    'extracting',
    'analyzing',
    'generating',
    'validating',
    'done',
  ];

  const getStepStatus = (step: GenerationStep) => {
    if (currentStep === 'idle') return 'pending';
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(step);
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  const isGenerating = (currentStep !== 'idle' && currentStep !== 'done') || ['queued', 'running'].includes(generationJob.job?.status || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-xl rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Generate Exam from Lessons
              </h3>
              <p className="text-xs text-gray-500">
                {subjectTitle} • Anchored on Table of Specifications ({targetItems} items)
              </p>
            </div>
          </div>

          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Close while generation continues">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Stepper Progress Indicator (Active when generating) */}
        {isGenerating && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900 dark:text-blue-300">
                {generationJob.job?.status === 'needs_attention'
                  ? 'The Gemini helper needs a person to sign in or confirm on the helper computer. Tell your administrator.'
                  : generationJob.job?.status === 'queued'
                    ? `Queued (position ${generationJob.job.queuePosition || 1}). Starts when the Gemini helper is available. This is running in the background, you can leave this page.`
                    : generationJob.job?.status === 'running'
                      ? `${generationJob.job.progress?.label || 'Gemini is writing your exam.'} This is running in the background, you can leave this page.`
                      : generationJob.job?.status === 'failed'
                        ? generationJob.job.error || 'Exam generation failed.'
                        : currentStep === 'generating' && chunkProgress ? chunkProgress.label : STEP_LABELS[currentStep]}
              </span>
              {generationJob.helperState === 'offline'
                ? <span className="rounded-full border border-slate-300 px-2 py-1 text-[10px] text-slate-600">Helper offline</span>
                : <span className="rounded-full border border-emerald-300 px-2 py-1 text-[10px] text-emerald-700">Helper {generationJob.helperState.replace('_', ' ')}</span>}
              {['queued', 'running', 'needs_attention'].includes(generationJob.job?.status || '')
                ? <button type="button" onClick={() => void generationJob.cancel().catch((error) => toast.error(error.message))} className="rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-semibold text-rose-700">Cancel</button>
                : ['completed', 'partial', 'failed', 'cancelled'].includes(generationJob.job?.status || '') ? null : <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />}
            </div>

            {/* Stepper Dots */}
            <div className="flex items-center justify-between gap-1">
              {[
                { key: 'uploading', label: 'Upload' },
                { key: 'extracting', label: 'Extract' },
                { key: 'analyzing', label: 'Analyze' },
                { key: 'generating', label: 'Generate' },
                { key: 'validating', label: 'Validate' },
              ].map((s) => {
                const status = getStepStatus(s.key as GenerationStep);
                return (
                  <div key={s.key} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className={`h-2 w-full rounded-full transition-all ${
                        status === 'completed'
                          ? 'bg-emerald-500'
                          : status === 'active'
                          ? 'bg-blue-600 animate-pulse'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    />
                    <span className="text-[10px] text-gray-500">{s.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
            {generationJob.job?.status === 'needs_attention' && <button type="button" onClick={() => void generationJob.cancel().catch((error) => toast.error(error.message))} className="ml-auto shrink-0 rounded-lg border border-rose-300 px-2 py-1 font-semibold">Clear job</button>}
          </div>
        )}

        {generationJob.helperState === 'offline' && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Gemini helper is offline. Generation is disabled and no new job will be queued until it is available.</div>}
        {generationJob.helperState === 'needs_attention' && generationJob.job?.status !== 'needs_attention' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">Gemini helper needs attention. Resolve the prompt on the helper computer before starting another generation.</div>}

        {truncationNotice && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{truncationNotice}</span>
          </div>
        )}

        {/* Upload Dropzone (Disabled when generating) */}
        {!isGenerating && (
          <div className="space-y-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition text-center ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/20'
                  : selectedFiles.length > 0
                  ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-800'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.txt,.md"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFilesSelect(e.target.files);
                  }
                }}
                className="hidden"
              />

              <div className="space-y-1.5">
                <UploadCloud className="mx-auto h-8 w-8 text-blue-500" />
                <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  Drop your lesson materials here, or <span className="text-blue-600 underline">browse</span>
                </p>
                <p className="text-[11px] text-gray-400">
                  Supports PDF, DOCX, PPTX, or TXT (up to 5 files; your school’s file limit is loaded when you select files)
                </p>
              </div>
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-gray-700 dark:text-gray-300">
                  <span>Selected Files ({selectedFiles.length}/5):</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFiles([])}
                    className="text-gray-400 hover:text-rose-500 transition text-[10px]"
                  >
                    Clear All
                  </button>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-gray-800 dark:bg-gray-800/60"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                        <span className="truncate text-xs text-gray-900 dark:text-white font-medium">
                          {file.name}
                        </span>
                        <span className="shrink-0 text-[10px] text-gray-400">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(idx);
                        }}
                        className="rounded p-1 text-gray-400 hover:text-rose-600 hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Remove file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional Paste Area */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                  Or paste lesson text directly:
                </label>
                {pastedText && (
                  <button
                    type="button"
                    onClick={() => setPastedText('')}
                    className="text-[10px] text-gray-400 hover:text-gray-600"
                  >
                    Clear
                  </button>
                )}
              </div>
              <textarea
                rows={3}
                placeholder="Paste key lesson sentences, definitions, formulas, or competencies..."
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isGenerating}
            className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStartGeneration}
            disabled={isGenerating || generationJob.isStarting || generationJob.helperState === 'offline' || generationJob.helperState === 'needs_attention' || (selectedFiles.length === 0 && !pastedText.trim())}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Generating Exam...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Generate {targetItems} Questions</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
