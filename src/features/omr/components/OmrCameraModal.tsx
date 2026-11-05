/**
 * Project KIT — OMR Camera & Scanner Modal Component
 * Comprehensive mobile-first scanning interface with hardware-accelerated / WASM barcode decoding,
 * real-time corner alignment HUD, client-side AI document quality diagnostics,
 * full-sheet OMR bubble evaluation, and an interactive review/correction grid.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertCircle, Camera, CheckCircle2, RefreshCw, X } from 'lucide-react';

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

  // Session state
  const [phase, setPhase] = useState<'scan' | 'review' | 'saved'>('scan');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [detectedBarcode, setDetectedBarcode] = useState<DecodedBarcode | null>(null);
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
  } = useCameraStream({
    preferredFacingMode: 'environment',
    onError: (err) => setErrorMessage(err.message),
  });

  // Matched student derived from selectedStudentId or detected barcode
  const matchedStudent = useMemo(() => {
    return students.find((s) => s.id === selectedStudentId) || null;
  }, [students, selectedStudentId]);

  // Handler for continuous barcode detection
  const handleBarcodeDetected = useCallback(
    (barcode: DecodedBarcode) => {
      setDetectedBarcode(barcode);
      const identity = barcode.parsedIdentity;

      // Check if barcode assessment matches current assessment (if specified)
      if (identity?.assessmentId && shortCode(assessmentId) !== shortCode(identity.assessmentId)) {
        setStatusMessage('Barcode matches another assessment. Verify sheet.');
        return;
      }

      // Attempt to auto-assign student by id, LRN, or shortcode prefix
      const studentCode = identity?.studentId || identity?.studentLrn;
      if (studentCode) {
        const directMatch = students.find((s) => s.id === studentCode);
        if (directMatch) {
          setSelectedStudentId(directMatch.id);
          setStatusMessage(`Identified: ${directMatch.name}`);
          return;
        }

        const lrnMatch = students.find((s) => s.lrn && s.lrn === studentCode);
        if (lrnMatch) {
          setSelectedStudentId(lrnMatch.id);
          setStatusMessage(`Identified: ${lrnMatch.name}`);
          return;
        }

        const prefixMatches = students.filter(
          (s) => shortCode(s.id) === shortCode(studentCode)
        );
        if (prefixMatches.length === 1) {
          setSelectedStudentId(prefixMatches[0].id);
          setStatusMessage(`Identified: ${prefixMatches[0].name}`);
          return;
        }
      }

      setStatusMessage(`Barcode decoded: ${barcode.rawValue}`);
    },
    [assessmentId, students]
  );

  // Continuous barcode detection active only during 'scan' phase
  useContinuousBarcode(videoRef, {
    enabled: isOpen && phase === 'scan' && cameraState.isStreaming,
    onBarcodeDetected: handleBarcodeDetected,
    throttleMs: 300,
  });

  // Real-time quality evaluation loop (client-side CV diagnostics)
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

  // Control camera activation lifecycle
  useEffect(() => {
    if (isOpen && phase === 'scan') {
      void startStream();
    } else {
      stopStream();
    }
  }, [isOpen, phase, startStream, stopStream]);

  if (!isOpen) return null;

  // Process a captured image (from camera or file upload)
  const processImageBlob = async (blob: Blob) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage('Evaluating OMR bubbles with client engine…');

    try {
      setCapturedBlob(blob);
      stopStream();

      // Parallelize OMR processing and fallback barcode extraction from the snapshot
      const [omrResult, barcodeResult] = await Promise.all([
        processOmrScan(blob, template, {
          assessmentId,
          includeMarkedImage: true,
        }),
        decodeBarcodeFromBlob(blob).catch(() => null),
      ]);

      if (omrResult.status === 'REJECTED' || !omrResult.items.length) {
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
      setStatusMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Scan processing failed.');
      // Restart stream if processing failed
      void startStream();
    } finally {
      setIsProcessing(false);
    }
  };

  // Trigger frame capture from video
  const handleCapture = async () => {
    if (isProcessing) return;
    const blob = await captureFrame({ format: 'image/jpeg', quality: 0.92 });
    if (!blob) {
      setErrorMessage('Camera preview is not ready. Please wait a moment and try again.');
      return;
    }
    await processImageBlob(blob);
  };

  // Trigger file upload fallback
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      setErrorMessage('Please select or verify the learner before saving.');
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
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not save the scan.');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to scan another sheet
  const handleScanAnother = () => {
    setCurrentResult(null);
    setEditableItems([]);
    setCapturedBlob(null);
    setSelectedStudentId('');
    setDetectedBarcode(null);
    setQualityMetrics(null);
    setErrorMessage(null);
    setStatusMessage(null);
    setPhase('scan');
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-200"
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-gray-900 border-0 sm:border sm:border-gray-800 shadow-2xl text-white sm:h-auto sm:max-h-[94vh] sm:max-w-4xl sm:rounded-3xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4 bg-gray-900/90 backdrop-blur-sm z-10">
          <div className="min-w-0 pr-2">
            <h3 className="flex items-center gap-2 text-sm sm:text-base font-bold truncate">
              <Camera className="h-5 w-5 text-blue-400 shrink-0" />
              {title ||
                (isAnswerKey
                  ? 'Master Answer Key Camera Scanner'
                  : 'Project KIT — OMR Exam Scanner')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-400 truncate">
              {phase === 'scan'
                ? isAnswerKey
                  ? 'Capture teacher answer key sheet'
                  : matchedStudent
                  ? `Target: ${matchedStudent.name} (${matchedStudent.section_name || 'Section'})`
                  : 'Align student answer sheet inside the corner markers'
                : phase === 'review'
                ? isAnswerKey
                  ? 'Review detected answer key before applying'
                  : `Reviewing answers for: ${matchedStudent?.name || 'Unassigned Learner'}`
                : 'Scan saved successfully'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition shrink-0"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 flex flex-col p-3 sm:p-5 min-h-0 overflow-y-auto">
          {errorMessage && (
            <div className="mb-3 shrink-0 flex items-start gap-2.5 rounded-2xl bg-red-950/70 border border-red-800/80 p-3 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
              <p className="flex-1">{errorMessage}</p>
            </div>
          )}

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
                  <span>Scan Next Sheet</span>
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
