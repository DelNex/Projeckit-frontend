/**
 * Project KIT — OMR Camera & Scanner Modal Component
 * Comprehensive mobile-first scanning interface with hardware-accelerated / WASM barcode decoding,
 * student pre-identification, real-time corner alignment HUD, client-side AI diagnostics,
 * full-sheet OMR bubble evaluation, and an interactive review/correction grid.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  QrCode,
  RefreshCw,
  UserCheck,
  X,
} from 'lucide-react';
import { useToast } from '@/components/ui/toast';

import { KitOmrTemplate, OmrScanResult, ProcessedItemResult } from '../types';
import { processOmrScan } from '../adapter';
import { persistOmrScan } from '../storage';
import { OMR_THRESHOLD_PROFILE_VERSION } from '../thresholds';

// Modular Scanner Engine Imports
import { useCameraStream } from '../../scanner/camera/useCameraStream';
import { useContinuousBarcode } from '../../scanner/barcode/useContinuousBarcode';
import { decodeBarcodeFromBlob } from '../../scanner/barcode/barcode-engine';
import { DecodedBarcode } from '../../scanner/barcode/barcode-types';
import { analyzeDocumentQuality } from '../../scanner/ai/document-quality';
import { adviseOnQuality, clientAiAdvisor } from '../../scanner/ai/client-ai-advisor';
import { DocumentQualityMetrics } from '../../scanner/ai/ai-types';
import { CameraViewfinder } from '../../scanner/components/CameraViewfinder';
import { OmrResultsReview, RosterStudent } from '../../scanner/components/OmrResultsReview';

export type OmrCameraModalStudent = RosterStudent;

export interface OmrCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  template?: KitOmrTemplate;
  students?: OmrCameraModalStudent[];
  onScanComplete?: (
    result: OmrScanResult,
    studentId?: string,
    imageBlob?: Blob | File
  ) => Promise<'saved' | 'duplicate' | void> | 'saved' | 'duplicate' | void;
  /** 'answer_key' mode skips Supabase save and calls onApplyAnswerKey instead */
  mode?: 'examinee' | 'answer_key';
  /** Optional header title override */
  title?: string;
  /** Called in answer_key mode when user confirms detected answers */
  onApplyAnswerKey?: (detectedAnswers: Record<number, string>) => void;
}

function shortCode(value: string) {
  return value.replace(/[^0-9a-f]/gi, '').slice(0, 6).toUpperCase();
}

export function OmrCameraModal({
  isOpen,
  onClose,
  assessmentId,
  template,
  students = [],
  onScanComplete,
  mode = 'examinee',
  title,
  onApplyAnswerKey,
}: OmrCameraModalProps) {
  const isAnswerKey = mode === 'answer_key';
  const totalItems = template?.targetItems || 50;
  const choices = template?.choices || ['A', 'B', 'C', 'D'];
  const { toast } = useToast();

  // Session state: 'identify' -> 'scan' -> 'review' -> 'saved'
  const [phase, setPhase] = useState<'identify' | 'scan' | 'review' | 'saved'>(
    isAnswerKey ? 'scan' : 'identify'
  );
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [detectedBarcode, setDetectedBarcode] = useState<DecodedBarcode | null>(null);
  const detectedBarcodeRef = useRef<DecodedBarcode | null>(null);
  const [qualityMetrics, setQualityMetrics] = useState<DocumentQualityMetrics | null>(null);
  const [currentResult, setCurrentResult] = useState<OmrScanResult | null>(null);
  const [editableItems, setEditableItems] = useState<ProcessedItemResult[]>([]);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Camera stream management
  const {
    videoRef,
    cameraState,
    startStream,
    stopStream,
    cycleCamera,
    captureFrame,
    toggleTorch,
  } = useCameraStream({
    preferredFacingMode: 'environment',
    onError: (err) => toast.error(err.message),
  });

  // Matched student derived from selectedStudentId or detected barcode
  const matchedStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Handler for continuous barcode detection in 'identify' phase
  const handleBarcodeDetected = useCallback(
    (barcode: DecodedBarcode) => {
      detectedBarcodeRef.current = barcode;
      setDetectedBarcode(barcode);
      setErrorMessage(null); // Clear any stale snapshot error when continuous scanner finds barcode
      const identity = barcode.parsedIdentity;

      // Check if barcode assessment matches current assessment (if specified)
      if (identity?.assessmentId && shortCode(assessmentId) !== shortCode(identity.assessmentId)) {
        setStatusMessage('Barcode matches another assessment. Verify sheet.');
        return;
      }

      // Attempt to auto-assign student by id, LRN, or shortcode prefix
      const rawCode = barcode.rawValue.trim();
      const studentCode = identity?.studentId || identity?.studentLrn || rawCode;

      if (studentCode) {
        // 1. Direct ID match
        let match = students.find((s) => s.id === studentCode || s.id === rawCode);

        // 2. Exact or partial LRN match
        if (!match) {
          const digits = studentCode.replace(/\D/g, '');
          if (digits.length >= 6) {
            match = students.find((s) => {
              if (!s.lrn) return false;
              const sDigits = s.lrn.replace(/\D/g, '');
              return sDigits === digits || sDigits.endsWith(digits) || digits.endsWith(sDigits);
            });
          }
        }

        // 3. ShortCode match
        if (!match) {
          const targetSc = shortCode(studentCode);
          if (targetSc.length >= 4) {
            const prefixMatches = students.filter(
              (s) => shortCode(s.id) === targetSc
            );
            if (prefixMatches.length === 1) {
              match = prefixMatches[0];
            }
          }
        }

        // 4. Hex ID prefix match
        if (!match && studentCode.length >= 4) {
          const cleanCode = studentCode.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
          if (cleanCode.length >= 4) {
            const idMatches = students.filter((s) =>
              s.id.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().startsWith(cleanCode) ||
              cleanCode.startsWith(s.id.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 6))
            );
            if (idMatches.length === 1) {
              match = idMatches[0];
            }
          }
        }

        if (match) {
          setSelectedStudentId(match.id);
          setStatusMessage(`Identified: ${match.name}. Position the answer sheet.`);
          setPhase('scan');
          return;
        }
      }

      setStatusMessage(`Barcode decoded: ${barcode.rawValue}. Tap Scan Sheet or select learner.`);
    },
    [assessmentId, students]
  );

  // Continuous barcode detection active during 'identify' phase
  useContinuousBarcode(videoRef, {
    enabled: isOpen && phase === 'identify' && cameraState.isStreaming,
    onBarcodeDetected: handleBarcodeDetected,
    throttleMs: 250,
  });

  // Real-time quality evaluation loop (client-side CV diagnostics active during 'scan' phase)
  useEffect(() => {
    if (!isOpen || phase !== 'scan' || !cameraState.isStreaming) {
      setQualityMetrics(null);
      return;
    }

    let active = true;
    const interval = setInterval(async () => {
      if (!active || !videoRef.current || videoRef.current.videoWidth === 0) return;
      try {
        const metrics = await analyzeDocumentQuality(videoRef.current);
        if (!active) return;
        setQualityMetrics(metrics);
        const advice = adviseOnQuality(metrics);
        if (advice.message && !statusMessage) {
          setStatusMessage(advice.message);
        }
      } catch {
        // Fallback silently if frame cannot be grabbed
      }
    }, 450);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isOpen, phase, cameraState.isStreaming, statusMessage]);

  // Keep camera streaming throughout 'identify' and 'scan' phases
  useEffect(() => {
    if (isOpen && (phase === 'identify' || phase === 'scan')) {
      void startStream();
    } else {
      stopStream();
    }
  }, [isOpen, phase, startStream, stopStream]);

  if (!isOpen) return null;

  // Manual or automatic transition from Barcode phase to OMR phase
  const proceedToOmrScan = () => {
    setErrorMessage(null);
    setStatusMessage('Position the answer sheet within the 4 corner markers.');
    setPhase('scan');
  };

  // Process a captured image (from camera or file upload)
  const processImageBlob = async (blob: Blob) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Evaluating OMR bubbles with client engine…');

    try {
      setCapturedBlob(blob);
      stopStream();

      // Parallelize OMR processing and fallback barcode extraction from the snapshot
      // Add a timeout so the user isn't stuck on a spinner indefinitely
      const omrWithTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s. Please try again.`)), ms)
          ),
        ]);

      const [omrResult, barcodeResult] = await Promise.all([
        omrWithTimeout(
          processOmrScan(blob, template, {
            assessmentId,
            includeMarkedImage: true,
          }),
          30000,
          'OMR bubble analysis'
        ),
        decodeBarcodeFromBlob(blob).catch(() => null),
      ]);

      if (!omrResult.items.length) {
        throw new Error(
          'Answer sheet was not recognized. Please align the sheet within frame, ensure all 4 corner markers are visible, and hold steady.'
        );
      }

      // Handle barcode resolution if not already matched
      const effectiveBarcode = barcodeResult || detectedBarcode;
      const effectiveStudentCode =
        effectiveBarcode?.parsedIdentity?.studentId ||
        effectiveBarcode?.parsedIdentity?.studentLrn;

      if (effectiveStudentCode && !selectedStudentId) {
        const match = students.find(
          (s) =>
            s.id === effectiveStudentCode ||
            s.lrn === effectiveStudentCode ||
            shortCode(s.id) === shortCode(effectiveStudentCode)
        );
        if (match) setSelectedStudentId(match.id);
      } else if (
        omrResult.detectedRollNumber !== null &&
        students.length >= omrResult.detectedRollNumber &&
        !selectedStudentId
      ) {
        const match = students[omrResult.detectedRollNumber - 1];
        if (match) setSelectedStudentId(match.id);
      } else if (omrResult.detectedStudentLrn && students.length > 0 && !selectedStudentId) {
        const match = students.find((s) => s.lrn === omrResult.detectedStudentLrn);
        if (match) setSelectedStudentId(match.id);
      }

      // Populate review items
      setCurrentResult(omrResult);
      setEditableItems(omrResult.items.map((item) => ({ ...item })));
      setPhase('review');
      if (!omrResult.fiducialDetected) {
        setStatusMessage('Low marker alignment confidence. Please review and verify answers below.');
      } else {
        setStatusMessage(null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Scan processing failed. Please try again.';
      toast.error(msg, { duration: 6000 });
      setErrorMessage(null);
      // Restart stream if processing failed
      void startStream();
    } finally {
      setIsProcessing(false);
    }
  };

  // Trigger frame capture
  const handleCapture = async () => {
    if (isProcessing) return;

    if (phase === 'identify') {
      // If a barcode was already decoded or learner is selected, shutter tap directly advances to sheet scan
      if (detectedBarcode || selectedStudentId) {
        setErrorMessage(null);
        proceedToOmrScan();
        return;
      }

      // In identify phase, shutter captures snapshot to force barcode decode
      const blob = await captureFrame({ quality: 0.92 });
      if (!blob) {
        toast.error('Camera preview is not ready. Please wait a moment.');
        return;
      }
      setIsProcessing(true);
      try {
        const barcode = await decodeBarcodeFromBlob(blob);
        if (barcode) {
          handleBarcodeDetected(barcode);
        } else {
          // Don't show error if continuous scanner already found a barcode
          if (!detectedBarcodeRef.current) {
            toast.info('No barcode detected in this frame. Position barcode in center box or select learner manually.');
          }
        }
      } catch {
        if (!detectedBarcodeRef.current) {
          toast.info('Could not read barcode. You can choose the learner manually below.');
        }
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // In scan phase, shutter captures full OMR score sheet
    setIsProcessing(true); // Block immediately to prevent double-tap
    try {
      const blob = await captureFrame({ quality: 0.92 });
      if (!blob) {
        toast.error('Camera preview is not ready. Please wait a moment and try again.');
        setIsProcessing(false);
        return;
      }
      await processImageBlob(blob);
    } catch {
      setIsProcessing(false);
    }
  };

  // Trigger file upload fallback
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (phase === 'identify') {
      setIsProcessing(true);
      try {
        const barcode = await decodeBarcodeFromBlob(file);
        if (barcode) {
          handleBarcodeDetected(barcode);
        } else {
          toast.info('No barcode detected in uploaded image. Please select learner manually.');
        }
      } catch {
        toast.error('Could not decode barcode from file.');
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    await processImageBlob(file);
  };

  // Teacher manual override of an answer in review
  const handleUpdateItem = (itemNumber: number, newChoice: string | null) => {
    setEditableItems((current) =>
      current.map((item) => {
        if (item.itemNumber !== itemNumber) return item;
        const selectedChoice = newChoice || null;
        const scores = Object.fromEntries(
          choices.map((c) => [c, selectedChoice === c ? 1 : 0])
        );
        return {
          ...item,
          selectedChoice,
          scores,
          state: selectedChoice ? 'MARKED' : 'BLANK',
          confidence: 1, // Manual override carries full teacher confidence
        };
      })
    );
  };

  // Finalize & Persist Scan Result
  const handleSave = async () => {
    if (isAnswerKey) {
      if (onApplyAnswerKey && editableItems.length > 0) {
        const detected: Record<number, string> = {};
        editableItems.forEach((item) => {
          if (item.selectedChoice) {
            detected[item.itemNumber] = item.selectedChoice;
          }
        });
        onApplyAnswerKey(detected);
        onClose();
      }
      return;
    }

    if (!selectedStudentId) {
      toast.error('Please select or verify the learner before saving.');
      return;
    }

    if (!currentResult || !capturedBlob) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const rawAnswers = Object.fromEntries(
        editableItems.map((item) => [item.itemNumber, item.selectedChoice])
      );
      const itemStates = Object.fromEntries(
        editableItems.map((item) => [item.itemNumber, item.state])
      );

      // Construct teacher review audit object
      const auditItems: Record<number, any> = {};
      for (const item of editableItems) {
        const original = currentResult.items.find((i) => i.itemNumber === item.itemNumber);
        const machineState = original?.state || item.state;
        const machineChoice = original?.selectedChoice || null;
        const machineConfidence = original?.confidence || 1;
        const machineScores = original?.scores || item.scores || {};
        const reasonFlags: string[] = [];
        if (machineState === 'AMBIGUOUS') reasonFlags.push('ambiguous_mark');
        if (machineState === 'MULTIPLE_MARK') reasonFlags.push('multiple_marks');
        if (machineState === 'ERASED_MARK') reasonFlags.push('erased_mark');
        if (machineState === 'BLANK') reasonFlags.push('blank_item');
        if (machineConfidence < 0.65) reasonFlags.push('low_confidence');

        auditItems[item.itemNumber] = {
          machineChoice,
          machineState,
          machineConfidence,
          machineScores,
          reasonFlags,
          teacherConfirmed: true,
          teacherChoice: item.selectedChoice,
          teacherChanged:
            item.selectedChoice !== machineChoice || item.state !== machineState,
          finalChoice: item.selectedChoice,
          finalState: item.state,
        };
      }

      const finalResult: OmrScanResult = {
        ...currentResult,
        idempotencyKey: `session-${assessmentId}-${selectedStudentId}-${Date.now()}`,
        detectedAssessmentId: assessmentId,
        detectedStudentId: selectedStudentId,
        overallConfidence: 1, // Teacher verified
        items: editableItems,
        itemStates,
        rawAnswers,
        normalizedAnswers: editableItems.map((item) => item.selectedChoice),
        hasAmbiguity: editableItems.some((i) => i.state === 'AMBIGUOUS'),
        hasMultipleMarks: editableItems.some((i) => i.state === 'MULTIPLE_MARK'),
        hasErasedMarks: editableItems.some((i) => i.state === 'ERASED_MARK'),
        status: 'PROCESSED',
        reviewAudit: {
          reviewedAt: new Date().toISOString(),
          engineUsed: currentResult.engineUsed || 'client-optical',
          thresholdProfileVersion:
            currentResult.thresholdProfileVersion || OMR_THRESHOLD_PROFILE_VERSION,
          openCv: currentResult.openCvDiagnostics || { status: 'not_loaded' },
          items: auditItems,
        },
      };

      if (onScanComplete) {
        const saved = await onScanComplete(finalResult, selectedStudentId, capturedBlob);
        if (saved === 'duplicate') {
          throw new Error('This learner already has a saved scan for this assessment.');
        }
      } else {
        const saved = await persistOmrScan({
          assessmentId,
          studentId: selectedStudentId,
          scanResult: finalResult,
          imageBlob: capturedBlob,
        });
        if (saved.error) throw new Error(saved.error);
      }

      setPhase('saved');
    } catch (err: any) {
      // Extract the most useful error message from various error shapes
      const msg =
        (err instanceof Error ? err.message : null) ||
        err?.message ||
        err?.error_description ||
        err?.details ||
        err?.hint ||
        (typeof err === 'string' ? err : null) ||
        (err?.code ? `Database error (${err.code})` : null) ||
        (() => { try { return JSON.stringify(err); } catch { return null; } })() ||
        'Could not save the scan. Please check your connection and try again.';
      toast.error(msg, { duration: 8000 });
      setErrorMessage(null); // Clear inline banner — toast handles it
      console.error('[OmrCameraModal] Save error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to scan another sheet starting with barcode identification
  const handleScanAnother = () => {
    setCurrentResult(null);
    setEditableItems([]);
    setCapturedBlob(null);
    setSelectedStudentId('');
    detectedBarcodeRef.current = null;
    setDetectedBarcode(null);
    setQualityMetrics(null);
    setErrorMessage(null);
    setStatusMessage(null);
    setPhase(isAnswerKey ? 'scan' : 'identify');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-gray-900 border-0 sm:border sm:border-gray-800 shadow-2xl text-white sm:h-auto sm:max-h-[94vh] sm:max-w-4xl sm:rounded-3xl">
        {/* Header with Compact Stepper */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-3.5 py-2.5 sm:px-6 sm:py-3.5 bg-gray-900 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 shrink-0" />
            <h3 className="text-xs sm:text-base font-bold truncate">
              {title ||
                (isAnswerKey
                  ? 'Master Answer Key Camera Scanner'
                  : 'Project KIT — OMR Exam Scanner')}
            </h3>

            {!isAnswerKey && (
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-950/80 border border-blue-800/60 text-blue-300 shrink-0">
                {phase === 'identify'
                  ? '1. Barcode'
                  : phase === 'scan'
                  ? '2. Answers'
                  : '3. Review'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Flashlight Header Toggle (active during camera phases) */}
            {(phase === 'identify' || phase === 'scan') && cameraState.isStreaming && cameraState.hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                title={cameraState.isTorchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                aria-label={cameraState.isTorchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition border active:scale-95',
                  cameraState.isTorchOn
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.5)] ring-1 ring-amber-400/50'
                    : 'bg-gray-800/90 border-gray-700 text-gray-300 hover:text-white hover:bg-gray-700'
                )}
              >
                {cameraState.isTorchOn ? (
                  <Flashlight className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <FlashlightOff className="h-3.5 w-3.5 text-gray-400" />
                )}
                <span className="text-[11px] font-medium hidden xs:inline sm:inline">
                  {cameraState.isTorchOn ? 'Light On' : 'Light'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopStream();
                onClose();
              }}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition shrink-0"
              aria-label="Close scanner"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex flex-col p-2 sm:p-5 min-h-0 overflow-hidden">

          {phase === 'saved' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-950/70 border border-emerald-700/60 text-emerald-400">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h4 className="text-lg font-bold text-white">Scan Verified & Saved</h4>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  Answers were scored and saved to Supabase for{' '}
                  <span className="font-semibold text-emerald-300">
                    {matchedStudent?.name || 'Learner'}
                  </span>
                  .
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleScanAnother}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gray-800 hover:bg-gray-700 px-5 py-2.5 text-xs font-bold text-white transition border border-gray-700"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Scan Next Student</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-2xl bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-xs font-bold text-white transition shadow-sm"
                >
                  Done
                </button>
              </div>
            </div>
          ) : phase === 'review' && currentResult ? (
            <OmrResultsReview
              items={editableItems}
              choices={choices}
              totalItems={totalItems}
              overallConfidence={currentResult.overallConfidence}
              students={students}
              selectedStudentId={selectedStudentId}
              onSelectStudent={setSelectedStudentId}
              onUpdateItem={handleUpdateItem}
              onSave={handleSave}
              onScanAnother={handleScanAnother}
              isSaving={isSaving}
              isAnswerKeyMode={isAnswerKey}
            />
          ) : (
            <div className="flex flex-1 flex-col gap-2 min-h-0">
              {/* Step 1 Barcode Identified / Action Bar */}
              {phase === 'identify' && (
                <div className="shrink-0 flex items-center justify-between gap-2 rounded-xl bg-gray-800/90 border border-gray-700/80 px-2.5 py-1.5 text-xs">
                  {matchedStudent ? (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <UserCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="truncate text-xs">
                          Learner: <strong className="text-white">{matchedStudent.name}</strong>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={proceedToOmrScan}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-bold text-white shrink-0 shadow-sm"
                      >
                        <span>Next</span>
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => {
                          setSelectedStudentId(e.target.value);
                          setErrorMessage(null);
                        }}
                        className="flex-1 min-w-0 rounded-lg bg-gray-900 border border-gray-700 px-2 py-1 text-xs text-white truncate"
                      >
                        <option value="">
                          {detectedBarcode ? `Barcode: ${detectedBarcode.rawValue} (Select learner)` : '— Or select student manually —'}
                        </option>
                        {students.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} {s.lrn ? `• ${s.lrn}` : ''}
                          </option>
                        ))}
                      </select>
                      {(selectedStudentId || detectedBarcode) && (
                        <button
                          type="button"
                          onClick={proceedToOmrScan}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1 text-xs font-bold text-white shrink-0 shadow-sm"
                        >
                          <span>{selectedStudentId ? 'Next' : 'Scan Sheet'}</span>
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Step 2 Target Student Strip */}
              {phase === 'scan' && !isAnswerKey && (
                <div className="shrink-0 flex items-center justify-between px-2 py-0.5 text-xs text-gray-300">
                  <span className="truncate">
                    Target: <strong className="text-white">{matchedStudent?.name || 'Assigned Student'}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPhase('identify')}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 underline shrink-0 ml-2"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Viewfinder Component */}
              <CameraViewfinder
                videoRef={videoRef}
                cameraState={cameraState}
                qualityMetrics={qualityMetrics}
                detectedBarcode={detectedBarcode}
                matchedStudentName={matchedStudent?.name}
                onCapture={handleCapture}
                onCycleCamera={cycleCamera}
                onUploadFile={handleUploadFile}
                onClose={onClose}
                isProcessing={isProcessing}
                statusMessage={statusMessage || undefined}
                isAnswerKeyMode={isAnswerKey}
                mode={phase === 'identify' ? 'barcode' : 'omr'}
                hasTorch={cameraState.hasTorch}
                isTorchOn={cameraState.isTorchOn}
                onToggleTorch={toggleTorch}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
