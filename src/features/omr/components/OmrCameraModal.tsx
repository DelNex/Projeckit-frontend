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
}

export function OmrCameraModal({
  isOpen,
  onClose,
  assessmentId,
  template,
  onScanComplete,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-gray-900 border border-gray-800 shadow-2xl text-white">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-blue-400" />
            <h3 className="text-base font-bold">OMR Sheet Scanner</h3>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {errorMessage && (
            <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-950/60 border border-red-800 px-4 py-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Results View */}
          {currentResult ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between rounded-2xl bg-gray-800/60 p-4 border border-gray-700">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl font-bold text-white',
                      currentResult.status === 'PROCESSED' ? 'bg-emerald-600' : 'bg-amber-600'
                    )}
                  >
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">Scan Processed Successfully</h4>
                    <p className="text-xs text-gray-400">
                      Engine:{' '}
                      <span className="font-mono text-blue-300">{currentResult.engineUsed}</span>
                    </p>
                  </div>
                </div>

                <div className="text-right">
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
                  <p className="mt-1 text-[11px] text-gray-400 font-mono">
                    Conf: {(currentResult.overallConfidence * 100).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Diagnostic Alert if Region Marker Detection Failed */}
              {currentResult.failedRegion && (
                <div className="rounded-2xl bg-amber-950/60 border border-amber-800 p-4 text-xs text-amber-200 space-y-1.5">
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
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-gray-800/40 p-3 border border-gray-800">
                  <span className="text-gray-400">Student Roll No:</span>
                  <p className="mt-0.5 font-mono font-bold text-white">
                    {currentResult.detectedRollNumber !== null
                      ? `#${currentResult.detectedRollNumber}`
                      : currentResult.detectedStudentLrn || 'Not detected (Blank)'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-800/40 p-3 border border-gray-800">
                  <span className="text-gray-400">Items Scored:</span>
                  <p className="mt-0.5 font-mono font-bold text-white">
                    {currentResult.items.filter((i) => i.selectedChoice).length} /{' '}
                    {currentResult.items.length} Marked
                  </p>
                </div>
              </div>

              {/* Sample Detected Answers Preview */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-gray-400">
                  Detected Answers Preview (First 20 Items):
                </span>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 max-h-40 overflow-y-auto p-1">
                  {currentResult.items.slice(0, 20).map((item) => (
                    <div
                      key={item.itemNumber}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-lg p-1.5 border text-xs',
                        item.selectedChoice
                          ? 'border-blue-700 bg-blue-950/40 text-blue-200'
                          : 'border-gray-800 bg-gray-800/20 text-gray-500'
                      )}
                    >
                      <span className="text-[9px] text-gray-400">Q{item.itemNumber}</span>
                      <span className="font-bold">{item.selectedChoice || '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between border-t border-gray-800 pt-4">
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-xl bg-gray-800 px-4 py-2.5 text-xs font-bold text-gray-300 hover:bg-gray-700 transition"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span>Scan Another Sheet</span>
                </button>

                <button
                  onClick={handleSaveToSupabase}
                  disabled={saveStatus === 'SAVING' || saveStatus === 'SAVED'}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white transition shadow-sm',
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
              </div>
            </div>
          ) : (
            /* Live Camera & Alignment View */
            <div className="relative aspect-4/3 w-full overflow-hidden rounded-2xl bg-black flex items-center justify-center">
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
                  'pointer-events-none absolute inset-0 flex flex-col justify-between p-6 border-4 border-dashed rounded-2xl transition-colors duration-300',
                  cameraStatus.isAligned ? 'border-emerald-400/80' : 'border-white/30'
                )}
              >
                {/* Top Corner Registration Indicators */}
                <div className="flex justify-between">
                  <div className="h-10 w-10 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
                  <div className="h-10 w-10 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
                </div>

                {/* Status Badge */}
                <div className="self-center flex items-center gap-2 rounded-full bg-black/80 backdrop-blur-md px-4 py-2 border border-white/10 text-xs font-bold text-white shadow-lg">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      cameraStatus.isAligned
                        ? 'bg-emerald-400'
                        : 'bg-amber-400 animate-pulse'
                    )}
                  />
                  <span>{cameraStatus.statusText}</span>
                </div>

                {/* Bottom Corner Registration Indicators */}
                <div className="flex justify-between">
                  <div className="h-10 w-10 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
                  <div className="h-10 w-10 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />
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
              <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-6 pointer-events-auto z-10">
                <label className="flex items-center gap-1.5 rounded-xl bg-white/10 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer">
                  <Upload className="h-4 w-4" />
                  <span>Upload Photo</span>
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
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl hover:scale-105 active:scale-95 transition disabled:opacity-50"
                >
                  <div className="h-10 w-10 rounded-full border-2 border-white" />
                </button>

                <button
                  onClick={() => {
                    stopCamera();
                    onClose();
                  }}
                  className="rounded-xl bg-red-500/80 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-600 transition"
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

