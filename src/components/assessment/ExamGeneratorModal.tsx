'use client';

import React, { useState, useRef } from 'react';
import { extractTextFromFile } from '@/lib/lesson-parser';
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

interface ExamGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId?: string;
  tosId?: string;
  targetItems: number;
  tosRows: any[];
  subjectTitle: string;
  onExamGenerated: (questions: ExamQuestion[], lessonText: string) => void;
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
  uploading: 'Uploading lesson file...',
  extracting: 'Extracting text from document...',
  analyzing: 'Analyzing lesson coverage against TOS...',
  generating: 'Generating questions matching Bloom cognitive matrix...',
  validating: 'Validating distribution and self-healing...',
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

  const [currentStep, setCurrentStep] = useState<GenerationStep>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    const validExts = ['.pdf', '.docx', '.pptx', '.txt', '.md'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExts.some((ext) => lowerName.endsWith(ext));

    if (!isValid) {
      toast.error('Supported formats: PDF, DOCX, PPTX, or TXT.');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      toast.error('File size exceeds the 25MB limit.');
      return;
    }

    setSelectedFile(file);
    setErrorMsg(null);
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
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleStartGeneration = async () => {
    if (!selectedFile && !pastedText.trim()) {
      toast.error('Please upload a lesson document or paste lesson content.');
      return;
    }

    setErrorMsg(null);
    let extractedLessonText = pastedText.trim();

    try {
      // Step 1: Uploading
      if (selectedFile) {
        setCurrentStep('uploading');
        await new Promise((r) => setTimeout(r, 600));

        // Step 2: Extracting text
        setCurrentStep('extracting');
        extractedLessonText = await extractTextFromFile(selectedFile);

        if (!extractedLessonText.trim()) {
          throw new Error('Could not extract text from the uploaded document. Please check the file or paste text directly.');
        }
      }

      // Step 3: Analyzing lesson coverage
      setCurrentStep('analyzing');
      await new Promise((r) => setTimeout(r, 700));

      // Step 4: Generating questions
      setCurrentStep('generating');

      const res = await fetch('/api/ai/generate-exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assessmentId,
          tosId,
          lessonText: extractedLessonText,
          targetItems: Number(targetItems) || 50,
          tosRows,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Exam generation request failed');
      }

      // Step 5: Validating distribution
      setCurrentStep('validating');
      await new Promise((r) => setTimeout(r, 500));

      // Step 6: Done
      setCurrentStep('done');
      await new Promise((r) => setTimeout(r, 400));

      toast.success(`Generated ${data.questions.length} questions matching the TOS blueprint.`);
      onExamGenerated(data.questions, extractedLessonText);
      onClose();
    } catch (err: any) {
      console.error('Exam generation failed:', err);
      setErrorMsg(err.message || 'Generation failed.');
      setCurrentStep('idle');
      toast.error(friendlyError(err, 'Could not complete exam generation.'));
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

  const isGenerating = currentStep !== 'idle' && currentStep !== 'done';

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

          {!isGenerating && (
            <button
              onClick={onClose}
              className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Stepper Progress Indicator (Active when generating) */}
        {isGenerating && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-900 dark:text-blue-300">
                {STEP_LABELS[currentStep]}
              </span>
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
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
                  : selectedFile
                  ? 'border-emerald-300 bg-emerald-50/30 dark:border-emerald-800'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.txt,.md"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                className="hidden"
              />

              {selectedFile ? (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate max-w-xs">
                      {selectedFile.name}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Click to change file
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <UploadCloud className="mx-auto h-8 w-8 text-blue-500" />
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                    Drop your lesson materials here, or <span className="text-blue-600 underline">browse</span>
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Supports PDF, DOCX, PPTX, or TXT (up to 25MB)
                  </p>
                </div>
              )}
            </div>

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
            disabled={isGenerating || (!selectedFile && !pastedText.trim())}
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

