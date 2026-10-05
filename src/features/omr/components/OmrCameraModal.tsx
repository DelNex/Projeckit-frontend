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
import { KitOmrTemplate, OmrScanResult } from '../types';
import { useOmrCamera } from '../useOmrCamera';

export interface OmrCameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  template?: KitOmrTemplate;
  onScanComplete?: (result: OmrScanResult) => void;
  /** 'answer_key' mode skips Supabase save and calls onApplyAnswerKey instead */
  mode?: 'examinee' | 'answer_key';
  /** Optional header title override */
  title?: string;
  /** Called in answer_key mode when user confirms detected answers */
  onApplyAnswerKey?: (detectedAnswers: Record<number, string>) => void;
}

export function OmrCameraModal({
  isOpen,
  onClose,
  assessmentId,
  template,
  onScanComplete,
  mode = 'examinee',
  title,
  onApplyAnswerKey,
}: OmrCameraModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResult, setCurrentResult] = useState<OmrScanResult | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
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

      const result = await processOmrScan(blob, template, {
        assessmentId,
      });

      setCurrentResult(result);
      if (onScanComplete) onScanComplete(result);
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

      const result = await processOmrScan(file, template, {
        assessmentId,
      });

      setCurrentResult(result);
      if (onScanComplete) onScanComplete(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process uploaded image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToSupabase = async () => {
    if (!currentResult) return;
    setSaveStatus('SAVING');

    const res = await persistOmrScan({
      assessmentId,
      scanResult: currentResult,
      imageBlob: capturedBlob || undefined,
    });

    if (res.error) {
      setErrorMessage(`Persistence notice: ${res.error}`);
      setSaveStatus('ERROR');
    } else {
      setSaveStatus('SAVED');
    }
  };

  const handleReset = () => {
    setCurrentResult(null);
    setCapturedBlob(null);
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
                    <h4 className="text-sm font-bold truncate">Scan Processed Successfully</h4>
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
                    <span className="text-gray-400 text-[11px]">Student Roll No:</span>
                    <p className="mt-0.5 font-mono font-bold text-white truncate">
                      {currentResult.detectedRollNumber !== null
                        ? `#${currentResult.detectedRollNumber}`
                        : currentResult.detectedStudentLrn || 'Blank'}
                    </p>
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
                    disabled={saveStatus === 'SAVING' || saveStatus === 'SAVED'}
                    className={cn(
                      'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white transition shadow-sm',
                      saveStatus === 'SAVED'
                        ? 'bg-emerald-600'
                        : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
                    )}
                  >
                    {saveStatus === 'SAVING' ? (
                      <span>Saving to Supabase…</span>
                    ) : saveStatus === 'SAVED' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Saved to Supabase</span>
                      </>
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

