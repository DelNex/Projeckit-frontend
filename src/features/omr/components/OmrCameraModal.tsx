/**
 * Project KIT — OMR Camera & Scanner Modal Component
 * Accessible modal supporting live camera preview, real-time corner alignment indicators,
 * file upload fallback, and instant scan results verification.
 */

'use client';

import { cn } from '@/lib/utils';
import {
    AlertCircle,
    Camera,
    CheckCircle2,
    FileCheck,
    RefreshCw,
    Upload,
    X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { processOmrScan } from '../adapter';
import { persistOmrScan } from '../storage';
import { KitOmrTemplate, OmrScanResult, ProcessedItemResult } from '../types';
import { useOmrCamera } from '../useOmrCamera';

export interface OmrCameraModalStudent {
  id: string;
  name: string;
  lrn?: string | null;
  section_name?: string | null;
}

export interface OmrCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  template?: KitOmrTemplate;
  students?: OmrCameraModalStudent[];
  onScanComplete?: (result: OmrScanResult, studentId?: string, imageBlob?: Blob | File) => Promise<'saved' | 'duplicate' | void> | 'saved' | 'duplicate' | void;
  /** 'answer_key' mode skips Supabase save and calls onApplyAnswerKey instead */
  mode?: 'examinee' | 'answer_key';
  /** Optional header title override */
  title?: string;
  /** Called in answer_key mode when user confirms detected answers */
  onApplyAnswerKey?: (detectedAnswers: Record<number, string>) => void;
}

export function OmrCameraModal(props: OmrCameraModalProps) {
  if (props.mode === 'answer_key') return <OmrAnswerKeyScanner {...props} />;
  return <OmrExamineeScanSession {...props} />;
}

type BarcodeIdentity = { assessmentCode?: string; studentCode?: string };
type CapturedItem = ProcessedItemResult & { pass: number; blankConfirmed: boolean; scannerReadChoice: string | null; scannerConfidence: number };

function shortCode(value: string) {
  return value.replace(/[^0-9a-f]/gi, '').slice(0, 6).toUpperCase();
}

async function readSheetBarcode(blob: Blob): Promise<BarcodeIdentity | null> {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ['code_39', 'code_128', 'qr_code'] });
      const bitmap = await createImageBitmap(blob);
      const detected = await detector.detect(bitmap);
      bitmap.close?.();
      for (const item of detected || []) {
        const value = String(item.rawValue || '');
        const match = value.match(/K([0-9A-F]+)-([0-9A-F]+)/i) || value.match(/KIT:([a-z0-9-]+):([a-z0-9-]+)/i);
        if (match) return { assessmentCode: match[1], studentCode: match[2] };
      }
    } catch { /* A manual learner selection remains available if browser barcode decoding is unsupported. */ }
  }

  if (blob.type === 'image/svg+xml' || (blob as File).name?.endsWith('.svg')) {
    try {
      const source = await blob.text();
      const studentId = source.match(/data-student-id="([^"]+)"/)?.[1];
      const assessmentId = source.match(/data-assessment-id="([^"]+)"/)?.[1];
      const dataCode = source.match(/data-code="([^"]+)"/)?.[1];
      if (studentId) return { assessmentCode: assessmentId, studentCode: studentId };
      const match = dataCode?.match(/K([0-9A-F]+)-([0-9A-F]+)/i);
      if (match) return { assessmentCode: match[1], studentCode: match[2] };
    } catch { /* Invalid SVG is treated as an unreadable barcode. */ }
  }
  return null;
}

function OmrExamineeScanSession(props: OmrCameraModalProps) {
  const { isOpen, onClose, assessmentId, template, students = [], onScanComplete } = props;
  const itemCount = template?.targetItems || 50;
  const choices = template?.choices || ['A', 'B', 'C', 'D'];
  const [phase, setPhase] = useState<'identify' | 'capture' | 'review' | 'saved'>('identify');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [identityVerified, setIdentityVerified] = useState(false);
  const [sessionItems, setSessionItems] = useState<Record<number, CapturedItem>>({});
  const [rangeStart, setRangeStart] = useState(1);
  const [passNumber, setPassNumber] = useState(0);
  const [lastCapture, setLastCapture] = useState<OmrScanResult | null>(null);
  const [lastCaptureBlob, setLastCaptureBlob] = useState<Blob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const video = useOmrCamera({ onError: (error) => setErrorMessage(error.message) });
  const rangeEnd = Math.min(itemCount, rangeStart + 4);
  const selectedStudent = students.find((student) => student.id === selectedStudentId) || null;
  const isAccounted = (item?: CapturedItem) => Boolean(item && (
    item.blankConfirmed ||
    (item.state === 'MARKED' && Boolean(item.selectedChoice) && item.confidence >= 0.65) ||
    item.state === 'MULTIPLE_MARK' ||
    item.state === 'ERASED_MARK'
  ));
  const accountedCount = Object.values(sessionItems).filter(isAccounted).length;

  useEffect(() => {
    if (!isOpen) {
      video.stopCamera();
      return;
    }
    if (phase === 'capture' || phase === 'identify') void video.startCamera();
    else video.stopCamera();
    return () => video.stopCamera();
  }, [isOpen, phase, video.startCamera, video.stopCamera]);

  if (!isOpen) return null;

  const verifyBarcode = async (blob: Blob) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const identity = await readSheetBarcode(blob);
      if (!identity) {
        setErrorMessage('Barcode not detected. Center the printed barcode in view and scan again, or assign the learner manually.');
        return;
      }
      if (identity.assessmentCode && shortCode(assessmentId) !== shortCode(identity.assessmentCode)) {
        setErrorMessage('This barcode belongs to a different assessment. Check the sheet before continuing.');
        return;
      }
      if (identity.studentCode) {
        const matches = students.filter((student) => shortCode(student.id) === shortCode(identity.studentCode || ''));
        if (matches.length === 1) {
          setSelectedStudentId(matches[0].id);
          setIdentityVerified(true);
          setPhase('capture');
          setInfoMessage(`Barcode matched ${matches[0].name}. Now capture answer items 1–5.`);
          return;
        }
        setErrorMessage(matches.length > 1 ? 'The barcode matches more than one learner. Assign the correct learner manually.' : 'The barcode learner is not in this section roster. Assign the correct learner manually.');
        return;
      }
      setErrorMessage('The barcode identifies the assessment but not a learner. Assign the learner manually to continue.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not read the sheet barcode.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleIdentifyCapture = async () => {
    const blob = await video.captureFrame();
    if (!blob) { setErrorMessage('Camera is not ready. Wait for the preview, then scan the barcode again.'); return; }
    await verifyBarcode(blob);
  };

  const handleAnswerCapture = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const blob = await video.captureFrame();
      if (!blob) throw new Error('Camera is not ready. Wait for the preview and try again.');
      const result = await processOmrScan(blob, template, { assessmentId, includeMarkedImage: true });
      if (result.status === 'REJECTED' || !result.items.length || !result.fiducialDetected) {
        throw new Error('The answer grid was not recognized. Keep the full answer area and all printed corner markers in frame; close-up crops are not supported by this sheet layout.');
      }
      const rangeItems = result.items.filter((item) => item.itemNumber >= rangeStart && item.itemNumber <= rangeEnd);
      if (!rangeItems.length) throw new Error(`No questions ${rangeStart}–${rangeEnd} were read. Reframe the full answer grid and try again.`);
      const nextPass = passNumber + 1;
      setPassNumber(nextPass);
      setLastCapture(result);
      setLastCaptureBlob(blob);
      setSessionItems((current) => {
        const next = { ...current };
        for (const item of rangeItems) next[item.itemNumber] = { ...item, pass: nextPass, blankConfirmed: false, scannerReadChoice: item.selectedChoice, scannerConfidence: item.confidence };
        return next;
      });
      const needsRetry = rangeItems.filter((item) => !(
        (item.state === 'MARKED' && item.selectedChoice && item.confidence >= 0.65) ||
        item.state === 'MULTIPLE_MARK' ||
        item.state === 'ERASED_MARK'
      ));
      const wrongMarks = rangeItems.filter((item) => item.state === 'MULTIPLE_MARK' || item.state === 'ERASED_MARK').length;
      setInfoMessage(needsRetry.length
        ? `${rangeItems.length - needsRetry.length} resolved, including ${wrongMarks} detected wrong mark${wrongMarks === 1 ? '' : 's'}. Retake uncertain items or confirm blanks before continuing.`
        : `Questions ${rangeStart}–${rangeEnd} captured. ${wrongMarks ? `${wrongMarks} multiple/erased answer${wrongMarks === 1 ? ' was' : 's were'} marked wrong.` : 'Review the captured choices before continuing.'}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not scan this answer range.');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmBlank = (itemNumber: number) => {
    setSessionItems((current) => {
      const item = current[itemNumber];
      if (!item) return current;
      return { ...current, [itemNumber]: { ...item, state: 'BLANK', selectedChoice: null, blankConfirmed: true } };
    });
  };

  const currentRangeComplete = Array.from({ length: rangeEnd - rangeStart + 1 }, (_, index) => rangeStart + index)
    .every((itemNumber) => {
      const item = sessionItems[itemNumber];
      return isAccounted(item);
    });

  const advanceRange = () => {
    const firstUnaccounted = Array.from({ length: itemCount }, (_, index) => index + 1)
      .find((itemNumber) => {
        const item = sessionItems[itemNumber];
        return !isAccounted(item);
      });
    if (!firstUnaccounted) { setPhase('review'); return; }
    setRangeStart(Math.floor((firstUnaccounted - 1) / 5) * 5 + 1);
    setErrorMessage(null);
    setInfoMessage(`Next capture: questions ${Math.floor((firstUnaccounted - 1) / 5) * 5 + 1}–${Math.min(itemCount, Math.floor((firstUnaccounted - 1) / 5) * 5 + 5)}.`);
  };

  const retakeItems = () => {
    setRangeStart(1);
    setPhase('capture');
    setErrorMessage(null);
    setInfoMessage('Retake from questions 1–5. Each pass replaces those answers and keeps the full answer grid in view.');
  };

  const updateReviewedAnswer = (itemNumber: number, value: string) => {
    setSessionItems((current) => {
      const item = current[itemNumber];
      if (!item) return current;
      const selectedChoice = value || null;
      const scores = Object.fromEntries(choices.map((choice) => [choice, selectedChoice === choice ? 1 : 0]));
      return { ...current, [itemNumber]: { ...item, selectedChoice, scores, state: selectedChoice ? 'MARKED' : 'BLANK', blankConfirmed: !selectedChoice, confidence: 1 } };
    });
  };

  const finalizeSession = async () => {
    if (!selectedStudent || !lastCapture || !lastCaptureBlob) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const items = Array.from({ length: itemCount }, (_, index) => {
        const itemNumber = index + 1;
        const item = sessionItems[itemNumber];
        if (!item) throw new Error(`Question ${itemNumber} has not been scanned.`);
        return { ...item, selectedChoice: item.selectedChoice, state: item.blankConfirmed ? 'BLANK' as const : item.state, confidence: 1 };
      });
      const rawAnswers = Object.fromEntries(items.map((item) => [item.itemNumber, item.selectedChoice]));
      const itemStates = Object.fromEntries(items.map((item) => [item.itemNumber, item.state]));
      const finalResult: OmrScanResult = {
        ...lastCapture,
        idempotencyKey: `session-${assessmentId}-${selectedStudent.id}-${Date.now()}`,
        detectedAssessmentId: assessmentId,
        detectedStudentId: selectedStudent.id,
        // Reaching this action means the teacher reviewed every row; scanner confidence
        // remains visible in scannerConfidence while the persisted result is confirmed.
        overallConfidence: 1,
        items,
        itemStates,
        rawAnswers,
        normalizedAnswers: items.map((item) => item.selectedChoice),
        hasAmbiguity: items.some((item) => item.state === 'AMBIGUOUS' || item.state === 'ERASED_MARK'),
        hasMultipleMarks: items.some((item) => item.state === 'MULTIPLE_MARK'),
        hasErasedMarks: items.some((item) => item.state === 'ERASED_MARK'),
        status: 'PROCESSED',
      };
      if (onScanComplete) {
        const saved = await onScanComplete(finalResult, selectedStudent.id, lastCaptureBlob);
        if (saved === 'duplicate') throw new Error('This learner already has a saved scan for this assessment. The duplicate was skipped.');
      } else {
        const saved = await persistOmrScan({ assessmentId, studentId: selectedStudent.id, scanResult: finalResult, imageBlob: lastCaptureBlob });
        if (saved.error) throw new Error(saved.error);
      }
      setPhase('saved');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save the reviewed scan.');
    } finally {
      setIsSaving(false);
    }
  };

  const resetSession = () => {
    setPhase('identify');
    setSelectedStudentId('');
    setIdentityVerified(false);
    setSessionItems({});
    setRangeStart(1);
    setPassNumber(0);
    setLastCapture(null);
    setLastCaptureBlob(null);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-0 sm:p-4">
      <div className="relative flex h-full w-full flex-col overflow-hidden border-0 bg-gray-900 text-white shadow-2xl sm:h-auto sm:max-h-[94vh] sm:max-w-3xl sm:rounded-3xl sm:border sm:border-gray-800">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-800 px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold sm:text-base"><Camera className="h-5 w-5 text-blue-400" />{phase === 'identify' ? 'Step 1: Identify the student' : phase === 'capture' ? 'Step 2: Capture answer items' : phase === 'review' ? 'Step 3: Review answers' : 'Scan complete'}</h3>
            <p className="mt-1 text-[10px] text-gray-400">{phase === 'identify' ? 'Scan the sheet barcode before reading any answers.' : selectedStudent ? `${selectedStudent.name} · ${selectedStudent.section_name || 'Current section'}` : 'Student not assigned'}</p>
          </div>
          <button type="button" onClick={() => { video.stopCamera(); onClose(); }} className="rounded-xl p-2 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Close scanner"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3 sm:space-y-4 sm:p-5">
          <ol className="grid grid-cols-3 gap-2 text-[10px] sm:text-xs">
            {[['1', 'Identify'], ['2', 'Capture'], ['3', 'Review & save']].map(([number, label], index) => {
              const active = (phase === 'identify' && index === 0) || (phase === 'capture' && index === 1) || ((phase === 'review' || phase === 'saved') && index === 2);
              const done = (phase !== 'identify' && index === 0) || ((phase === 'review' || phase === 'saved') && index < 2) || phase === 'saved';
              return <li key={number} className={`rounded-lg px-2 py-2 text-center font-semibold ${active ? 'bg-blue-600 text-white' : done ? 'bg-emerald-950 text-emerald-300' : 'bg-gray-800 text-gray-500'}`}>{number}. {label}</li>;
            })}
          </ol>

          {phase === 'capture' && (
            <div className="space-y-2 rounded-xl border border-blue-900 bg-blue-950/30 p-3">
              <div className="flex items-center justify-between text-xs"><strong>Questions {rangeStart}–{rangeEnd}</strong><span>{accountedCount}/{itemCount} confirmed</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.round(accountedCount / itemCount * 100)}%` }} /></div>
              <p className="text-[10px] leading-relaxed text-blue-100">Capture one range per pass. Keep the full answer area and its four printed corner markers in frame so the scanner can align the bubbles. The shutter only records this pass; it does not save the student yet.</p>
            </div>
          )}

          {phase === 'review' && (
            <div className="space-y-2 rounded-xl border border-emerald-900 bg-emerald-950/30 p-3 text-xs text-emerald-100">
              <p className="font-bold">All {itemCount} items are accounted for. Review what the scanner read, then correct any answer before saving.</p>
              <p className="text-[10px] text-emerald-200/80">Detected choice and confidence are shown beside each question. “Blank” means the teacher confirmed no answer was marked.</p>
            </div>
          )}

          {errorMessage && <div className="flex items-start gap-2 rounded-xl border border-red-800 bg-red-950/60 px-3 py-2.5 text-xs text-red-200"><span>⚠</span><p>{errorMessage}</p></div>}
          {infoMessage && <div className="rounded-xl border border-blue-900 bg-blue-950/40 px-3 py-2.5 text-xs text-blue-200">{infoMessage}</div>}

          {phase === 'saved' ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center"><CheckCircle2 className="h-12 w-12 text-emerald-400" /><h4 className="text-lg font-bold">Reviewed scan saved</h4><p className="text-xs text-gray-400">Answers were scored and linked to {selectedStudent?.name}.</p><button type="button" onClick={onClose} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold">Done</button></div>
          ) : phase === 'review' ? (
            <div className="overflow-hidden rounded-xl border border-gray-700">
              <div className="grid grid-cols-[54px_1fr_100px_120px] gap-2 bg-gray-800 px-3 py-2 text-[10px] font-bold uppercase text-gray-400"><span>Item</span><span>Scanner read</span><span>Confidence</span><span>Teacher answer</span></div>
              <div className="max-h-[48vh] divide-y divide-gray-800 overflow-y-auto">
                {Array.from({ length: itemCount }, (_, index) => {
                  const itemNumber = index + 1;
                  const item = sessionItems[itemNumber];
                  return <div key={itemNumber} className="grid grid-cols-[54px_1fr_100px_120px] items-center gap-2 px-3 py-2 text-xs">
                    <strong>Q{itemNumber}</strong>
                    <span className={item?.state === 'MULTIPLE_MARK' || item?.state === 'ERASED_MARK' ? 'text-red-300' : 'text-gray-300'}>{item?.state === 'MULTIPLE_MARK' ? 'Multiple marks · wrong' : item?.state === 'ERASED_MARK' ? 'Erased/partial mark · wrong' : item?.scannerReadChoice || 'Blank'} {item?.pass ? `· pass ${item.pass}` : ''}</span>
                    <span className="text-gray-400">{item?.blankConfirmed ? 'Teacher confirmed' : `${Math.round((item?.scannerConfidence || 0) * 100)}%`}</span>
                    <select value={item?.selectedChoice || ''} onChange={(event) => updateReviewedAnswer(itemNumber, event.target.value)} className="rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-xs text-white"><option value="">Blank</option>{choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}</select>
                  </div>;
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="relative aspect-video min-h-56 overflow-hidden rounded-2xl bg-black">
                <video ref={video.videoRef} autoPlay playsInline muted className="h-full w-full object-contain" />
                <div className="pointer-events-none absolute inset-3 rounded-xl border-2 border-dashed border-white/50" />
                <div className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/80 px-3 py-1.5 text-center text-[10px] font-bold text-white">
                  {phase === 'identify' ? 'Center the student barcode in frame' : `Capture questions ${rangeStart}–${rangeEnd} · keep all four answer-area markers visible`}
                </div>
                {phase === 'capture' && <div className="absolute bottom-3 left-3 rounded-lg bg-black/75 px-2 py-1 text-[10px] text-emerald-200">Student: {selectedStudent?.name}</div>}
                <div className="absolute bottom-3 right-3 rounded-lg bg-black/75 px-2 py-1 text-[10px] text-gray-200">{video.cameraStatus.statusText}</div>
              </div>

              {phase === 'identify' ? (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase text-gray-400">Manual assignment if barcode cannot be read</label>
                  <div className="flex gap-2">
                    <select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-white"><option value="">Choose learner from this section</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}{student.lrn ? ` · ${student.lrn}` : ''}</option>)}</select>
                    <button type="button" disabled={!selectedStudentId} onClick={() => { setIdentityVerified(true); setPhase('capture'); setErrorMessage(null); setInfoMessage(`Learner ${students.find((student) => student.id === selectedStudentId)?.name} assigned. Now capture questions 1–5.`); }} className="rounded-xl bg-gray-700 px-3 text-[10px] font-bold disabled:opacity-40">Use learner</button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-1.5">
                  {Array.from({ length: rangeEnd - rangeStart + 1 }, (_, index) => {
                    const itemNumber = rangeStart + index;
                    const item = sessionItems[itemNumber];
                    const resolved = isAccounted(item);
                    const wrongMark = item?.state === 'MULTIPLE_MARK' || item?.state === 'ERASED_MARK';
                    return <div key={itemNumber} className={`rounded-lg border p-2 text-center ${wrongMark ? 'border-red-800 bg-red-950/40' : resolved ? 'border-emerald-800 bg-emerald-950/40' : item ? 'border-amber-800 bg-amber-950/30' : 'border-gray-700 bg-gray-800/60'}`}><p className="text-[9px] text-gray-400">Q{itemNumber}</p><strong className="text-sm">{item?.blankConfirmed ? 'Blank ✓' : item?.state === 'MULTIPLE_MARK' ? 'Multiple · wrong' : item?.state === 'ERASED_MARK' ? 'Erased · wrong' : item?.selectedChoice || (item ? 'Unsure' : 'Not scanned')}</strong>{item?.state === 'BLANK' && !item.blankConfirmed && <button type="button" onClick={() => confirmBlank(itemNumber)} className="mt-1 block w-full text-[9px] font-bold text-amber-200 underline">Confirm blank</button>}</div>;
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {phase !== 'saved' && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-gray-800 p-3 sm:px-5">
            <div className="flex gap-2">
              {phase === 'capture' && <button type="button" onClick={resetSession} className="rounded-xl bg-gray-800 px-3 py-2 text-[10px] font-bold text-gray-300">Start over</button>}
              {phase === 'review' && <button type="button" onClick={retakeItems} className="rounded-xl bg-gray-800 px-3 py-2 text-[10px] font-bold text-gray-300">Retake from Q1</button>}
            </div>
            {phase === 'identify' ? (
              <button type="button" disabled={isProcessing || !video.cameraStatus.isStreaming} onClick={handleIdentifyCapture} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold disabled:opacity-50">{isProcessing ? 'Reading barcode…' : 'Scan barcode first'}</button>
            ) : phase === 'capture' ? (
              <div className="flex gap-2">
                <button type="button" disabled={isProcessing || !identityVerified} onClick={handleAnswerCapture} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold disabled:opacity-50">{isProcessing ? 'Scanning answers…' : `Capture Q${rangeStart}–${rangeEnd}`}</button>
                <button type="button" disabled={!currentRangeComplete} onClick={advanceRange} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40">{accountedCount === itemCount ? 'Review all answers' : 'Continue'}</button>
              </div>
            ) : (
              <button type="button" disabled={isSaving} onClick={finalizeSession} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold disabled:opacity-50">{isSaving ? 'Saving reviewed scan…' : 'Confirm review & save'}</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function OmrAnswerKeyScanner({
  isOpen,
  onClose,
  assessmentId,
  template,
  students = [],
  onScanComplete,
  mode = 'answer_key',
  title,
  onApplyAnswerKey,
}: OmrCameraModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResult, setCurrentResult] = useState<OmrScanResult | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { videoRef, cameraStatus, startCamera, stopCamera, captureFrame } = useOmrCamera({
    onError: (err) => setErrorMessage(err.message),
  });

  // Start/stop camera on modal open/close
  useEffect(() => {
    if (isOpen && !currentResult) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [isOpen, currentResult, startCamera, stopCamera]);

  if (!isOpen) return null;

  const tryDetectBarcodeFromBlob = async (
    blob: Blob
  ): Promise<{ studentId?: string; assessmentId?: string } | null> => {
    if (typeof window === 'undefined') return null;

    // 1. Try native BarcodeDetector API if supported (Chrome 83+, Edge 83+, Android)
    if ('BarcodeDetector' in window) {
      try {
        const BarcodeDetectorClass = (window as any).BarcodeDetector;
        const detector = new BarcodeDetectorClass({ formats: ['code_39', 'code_128', 'qr_code'] });
        const bitmap = await createImageBitmap(blob);
        const detected = await detector.detect(bitmap);
        if (detected && detected.length > 0) {
          for (const item of detected) {
            const raw = item.rawValue || '';
            const m = raw.match(/K([0-9A-F]+)-([0-9A-F]+)/i) || raw.match(/KIT:([a-z0-9-]+):([a-z0-9-]+)/i);
            if (m) {
              return { assessmentId: m[1], studentId: m[2] };
            }
          }
        }
      } catch {}
    }

    // 2. SVG direct detection
    if (blob.type === 'image/svg+xml' || (blob as any).name?.endsWith('.svg')) {
      try {
        const text = await blob.text();
        const matchS = text.match(/data-student-id="([^"]+)"/);
        const matchA = text.match(/data-assessment-id="([^"]+)"/);
        const matchBarcode = text.match(/data-code="([^"]+)"/);
        if (matchS) {
          return { studentId: matchS[1], assessmentId: matchA?.[1] };
        }
        if (matchBarcode) {
          const m = matchBarcode[1].match(/K([0-9A-F]+)-([0-9A-F]+)/i);
          if (m) return { assessmentId: m[1], studentId: m[2] };
        }
      } catch {}
    }

    return null;
  };

  const handleCapture = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const blob = await captureFrame();
      if (!blob) {
        throw new Error('Unable to capture camera frame.');
      }
      setCapturedBlob(blob);
      stopCamera();

      const [result, barcodeData] = await Promise.all([
        processOmrScan(blob, template, { assessmentId }),
        tryDetectBarcodeFromBlob(blob),
      ]);

      if (barcodeData?.studentId) {
        result.detectedStudentId = barcodeData.studentId;
        setSelectedStudentId(barcodeData.studentId);
      } else if (result.detectedRollNumber !== null && students.length >= result.detectedRollNumber) {
        setSelectedStudentId(students[result.detectedRollNumber - 1]?.id || '');
      } else if (result.detectedStudentLrn && students.length > 0) {
        const match = students.find((s) => s.lrn === result.detectedStudentLrn);
        if (match) setSelectedStudentId(match.id);
      }

      setCurrentResult(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process camera scan.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      setCapturedBlob(file);
      stopCamera();

      const [result, barcodeData] = await Promise.all([
        processOmrScan(file, template, { assessmentId }),
        tryDetectBarcodeFromBlob(file),
      ]);

      if (barcodeData?.studentId) {
        result.detectedStudentId = barcodeData.studentId;
        setSelectedStudentId(barcodeData.studentId);
      } else if (result.detectedRollNumber !== null && students.length >= result.detectedRollNumber) {
        setSelectedStudentId(students[result.detectedRollNumber - 1]?.id || '');
      } else if (result.detectedStudentLrn && students.length > 0) {
        const match = students.find((s) => s.lrn === result.detectedStudentLrn);
        if (match) setSelectedStudentId(match.id);
      }

      setCurrentResult(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process uploaded image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToSupabase = async () => {
    if (!currentResult) return;

    const effectiveStudentId = selectedStudentId || currentResult.detectedStudentId || undefined;
    if (mode === 'examinee' && !effectiveStudentId) {
      setErrorMessage('Please assign a learner from the dropdown before persisting results.');
      return;
    }

    setSaveStatus('SAVING');
    try {
      if (onScanComplete) {
        const result = await onScanComplete(currentResult, effectiveStudentId, capturedBlob || undefined);
        if (result === 'duplicate') {
          setErrorMessage('This learner already has a saved scan for this assessment. Duplicate was skipped.');
          setSaveStatus('IDLE');
          return;
        }
      } else {
        const res = await persistOmrScan({
          assessmentId,
          studentId: effectiveStudentId,
          scanResult: currentResult,
          imageBlob: capturedBlob || undefined,
        });
        if (res.error) throw new Error(res.error);
      }
      setSaveStatus('SAVED');
    } catch (error) {
      setErrorMessage(`Could not save scan: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setSaveStatus('ERROR');
    }
  };

  const handleReset = () => {
    setCurrentResult(null);
    setCapturedBlob(null);
    setSelectedStudentId('');
    setSaveStatus('IDLE');
    setErrorMessage(null);
    startCamera();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm sm:p-4 p-0">
      <div className="relative w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-2xl flex flex-col overflow-hidden sm:rounded-3xl rounded-none bg-gray-900 border-0 sm:border sm:border-gray-800 shadow-2xl text-white">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-800 px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <Camera className="h-5 w-5 text-blue-400 shrink-0" />
            <h3 className="text-sm sm:text-base font-bold truncate">
              {title || (mode === 'answer_key' ? 'Master Answer Key Camera Scanner' : 'OMR Sheet Scanner')}
            </h3>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-800 hover:text-white transition shrink-0"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 flex flex-col p-3 sm:p-6 min-h-0 overflow-hidden">
          {errorMessage && (
            <div className="shrink-0 mb-3 flex items-center gap-2 rounded-xl bg-red-950/60 border border-red-800 px-3.5 py-2.5 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">{errorMessage}</span>
            </div>
          )}

          {/* Results View */}
          {currentResult ? (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 sm:space-y-6 pr-0.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-gray-800/60 p-3.5 sm:p-4 border border-gray-700">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-bold text-white',
                      currentResult.status === 'PROCESSED' ? 'bg-emerald-600' : 'bg-amber-600'
                    )}
                  >
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold truncate">
                      {currentResult.status === 'PROCESSED' && !currentResult.hasAmbiguity && !currentResult.hasMultipleMarks && currentResult.overallConfidence >= 0.75
                        ? 'Review scan before saving'
                        : 'Scan needs review'}
                    </h4>
                    <p className="text-xs text-gray-400 truncate">
                      Engine:{' '}
                      <span className="font-mono text-blue-300">{currentResult.engineUsed}</span>
                    </p>
                  </div>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-gray-700/60 pt-2 sm:pt-0">
                  <span
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-bold',
                      currentResult.status === 'PROCESSED'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    )}
                  >
                    {currentResult.status}
                  </span>
                  <p className="sm:mt-1 text-[11px] text-gray-400 font-mono">
                    Conf: {(currentResult.overallConfidence * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {mode !== 'answer_key' && (currentResult.status !== 'PROCESSED' || currentResult.hasAmbiguity || currentResult.hasMultipleMarks || currentResult.overallConfidence < 0.75) && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-800 bg-amber-950/50 px-3.5 py-3 text-xs text-amber-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <p>Some marks may be uncertain. Check amber items and confirm the learner before saving; this scan will be labeled Needs review.</p>
                </div>
              )}

              {/* Diagnostic Alert if Region Marker Detection Failed */}
              {currentResult.failedRegion && (
                <div className="rounded-2xl bg-amber-950/60 border border-amber-800 p-3.5 sm:p-4 text-xs text-amber-200 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-amber-300">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>Fiducial Marker Warning in Region: {currentResult.failedRegion.regionId}</span>
                  </div>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    {currentResult.failedRegion.reason}
                  </p>
                  <p className="text-[10px] font-mono text-amber-400">
                    Markers Detected: {currentResult.failedRegion.detectedMarkerCount} / {currentResult.failedRegion.expectedMarkerCount} • Confidence: {(currentResult.failedRegion.markerConfidence * 100).toFixed(1)}%
                  </p>
                </div>
              )}

              {/* Detected Metadata Card */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs">
                {mode !== 'answer_key' && (
                  <div className="rounded-xl bg-gray-800/40 p-3 border border-gray-800">
                    <span className="text-gray-400 text-[11px]">Learner Match:</span>
                    <p className="mt-0.5 font-mono font-bold text-white truncate">
                      {currentResult.detectedStudentId ? (
                        <span className="text-emerald-400">Barcode ID Matched</span>
                      ) : currentResult.detectedRollNumber !== null ? (
                        `Roll #${currentResult.detectedRollNumber}`
                      ) : (
                        currentResult.detectedStudentLrn || 'Unassigned'
                      )}
                    </p>
                    {currentResult.detectedStudentId && currentResult.detectedRollNumber !== null && (
                      <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                        Roll: #{currentResult.detectedRollNumber}
                      </p>
                    )}
                  </div>
                )}
                <div className="rounded-xl bg-gray-800/40 p-3 border border-gray-800">
                  <span className="text-gray-400 text-[11px]">{mode === 'answer_key' ? 'Keys Detected:' : 'Items Scored:'}</span>
                  <p className="mt-0.5 font-mono font-bold text-white">
                    {currentResult.items.filter((i) => i.selectedChoice).length} /{' '}
                    {currentResult.items.length} Marked
                  </p>
                </div>
                {mode === 'answer_key' && (
                  <div className="rounded-xl bg-emerald-950/40 p-3 border border-emerald-800">
                    <span className="text-emerald-400 text-[11px]">Mode:</span>
                    <p className="mt-0.5 font-mono font-bold text-emerald-300">Answer Key Scan</p>
                  </div>
                )}
              </div>

              {/* Learner Assignment (Required before saving in examinee mode) */}
              {mode !== 'answer_key' && (
                <div className="rounded-2xl bg-gray-800/60 p-3 sm:p-4 border border-gray-700 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-200">Assign to Learner:</span>
                    {!selectedStudentId ? (
                      <span className="text-[11px] font-bold text-amber-400">
                        * Required to persist
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Assigned
                      </span>
                    )}
                  </div>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => {
                      setSelectedStudentId(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="w-full rounded-xl bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500 font-medium"
                  >
                    <option value="">— Select learner from section roster —</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.lrn ? `• LRN: ${s.lrn}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Detected Answers Preview */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400">
                  {mode === 'answer_key'
                    ? `Detected Answer Key (${currentResult.items.length} Items):`
                    : 'Detected Answers Preview (First 20 Items):'}
                </span>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-48 sm:max-h-52 overflow-y-auto p-1 bg-gray-950/40 rounded-xl border border-gray-800">
                  {(mode === 'answer_key' ? currentResult.items : currentResult.items.slice(0, 20)).map((item) => (
                    <div
                      key={item.itemNumber}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-lg p-1.5 border text-xs',
                        item.selectedChoice
                          ? mode === 'answer_key'
                            ? 'border-emerald-700 bg-emerald-950/40 text-emerald-200'
                            : 'border-blue-700 bg-blue-950/40 text-blue-200'
                          : item.state === 'AMBIGUOUS' || item.state === 'MULTIPLE_MARK'
                            ? 'border-amber-700 bg-amber-950/40 text-amber-200'
                            : 'border-gray-800 bg-gray-800/20 text-gray-500'
                      )}
                    >
                      <span className="text-[9px] text-gray-400">Q{item.itemNumber}</span>
                      <span className="font-bold">{item.selectedChoice || '—'}</span>
                    </div>
                  ))}
                </div>
                {mode === 'answer_key' && (
                  <p className="text-[10px] text-amber-400/80 text-center">
                    Review detected keys above. You can manually adjust any answer after applying.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:items-center sm:justify-between border-t border-gray-800 pt-4">
                <button
                  onClick={handleReset}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-xs font-bold text-gray-300 hover:bg-gray-700 transition"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Scan Another</span>
                </button>

                {mode === 'answer_key' ? (
                  <button
                    onClick={() => {
                      if (onApplyAnswerKey && currentResult) {
                        const detected: Record<number, string> = {};
                        currentResult.items.forEach((item) => {
                          if (item.selectedChoice) {
                            detected[item.itemNumber] = item.selectedChoice;
                          }
                        });
                        onApplyAnswerKey(detected);
                        stopCamera();
                        onClose();
                      }
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white transition shadow-sm hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Apply Detected Key</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSaveToSupabase}
                    disabled={saveStatus === 'SAVING' || saveStatus === 'SAVED' || !selectedStudentId}
                    className={cn(
                      'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white transition shadow-sm',
                      saveStatus === 'SAVED'
                        ? 'bg-emerald-600'
                        : !selectedStudentId
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    )}
                  >
                    {saveStatus === 'SAVING' ? (
                      <span>Saving to Supabase…</span>
                    ) : saveStatus === 'SAVED' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Saved to Supabase</span>
                      </>
                    ) : !selectedStudentId ? (
                      <span>Select Learner to Persist</span>
                    ) : (
                      <span>Confirm & Persist Results</span>
                    )}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Live Camera & Alignment View — flex-1 on phone fills portrait space */
            <div className="relative flex-1 w-full min-h-[360px] sm:min-h-0 sm:aspect-4/3 overflow-hidden rounded-2xl bg-black flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />

              {/* Viewfinder Alignment Overlay */}
              <div
                className={cn(
                  'pointer-events-none absolute inset-3 sm:inset-5 flex flex-col justify-between p-3 sm:p-5 border-2 sm:border-4 border-dashed rounded-2xl transition-colors duration-300',
                  cameraStatus.isAligned ? 'border-emerald-400/80' : 'border-white/30'
                )}
              >
                {/* Top Corner Registration Indicators */}
                <div className="flex justify-between">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                  <div className="h-8 w-8 sm:h-10 sm:w-10 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                </div>

                {/* Status Badge */}
                <div className="self-center flex items-center gap-2 rounded-full bg-black/85 backdrop-blur-md px-3.5 sm:px-4 py-1.5 sm:py-2 border border-white/10 text-[11px] sm:text-xs font-bold text-white shadow-lg text-center max-w-[90%]">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full shrink-0',
                      cameraStatus.isAligned
                        ? 'bg-emerald-400'
                        : 'bg-amber-400 animate-pulse'
                    )}
                  />
                  <span className="truncate">{cameraStatus.statusText}</span>
                </div>

                {/* Bottom Corner Registration Indicators */}
                <div className="flex justify-between">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                  <div className="h-8 w-8 sm:h-10 sm:w-10 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
                </div>
              </div>

              {/* Processing Spinner Overlay */}
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm z-20">
                  <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
                  <p className="mt-2 text-xs font-bold text-white">Evaluating OMR Sheet…</p>
                </div>
              )}

              {/* Controls Bar */}
              <div className="absolute bottom-3 sm:bottom-4 left-0 right-0 flex items-center justify-between px-4 sm:px-6 pointer-events-auto z-10 gap-2">
                <label className="flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur-md px-3 sm:px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer shrink-0">
                  <Upload className="h-4 w-4" />
                  <span className="hidden xs:inline">Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={handleCapture}
                  disabled={isProcessing}
                  title="Capture Frame"
                  className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-2xl hover:scale-105 active:scale-95 transition disabled:opacity-50 shrink-0"
                >
                  <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-full border-2 border-white" />
                </button>

                <button
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="rounded-xl bg-red-500/80 backdrop-blur-md px-3 sm:px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-600 transition shrink-0"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
