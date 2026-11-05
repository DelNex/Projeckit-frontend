/**
 * Project KIT — Mobile-First Camera Viewfinder & Alignment HUD
 * Displays live video preview, real-time 4-corner registration markers,
 * continuous barcode scanning overlay, AI quality advisor pills, and touch-friendly controls.
 */

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Camera,
  CheckCircle2,
  Maximize2,
  QrCode,
  RefreshCw,
  Sparkles,
  SwitchCamera,
  Upload,
  X,
} from 'lucide-react';
import { CameraState } from '../camera/camera-types';
import { DecodedBarcode } from '../barcode/barcode-types';
import { DocumentQualityMetrics } from '../ai/ai-types';

export interface CameraViewfinderProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  cameraState: CameraState;
  qualityMetrics: DocumentQualityMetrics | null;
  detectedBarcode: DecodedBarcode | null;
  matchedStudentName?: string | null;
  onCapture: () => void;
  onCycleCamera: () => void;
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  isProcessing: boolean;
  statusMessage?: string;
  isAnswerKeyMode?: boolean;
  mode?: 'barcode' | 'omr';
}

export function CameraViewfinder({
  videoRef,
  cameraState,
  qualityMetrics,
  detectedBarcode,
  matchedStudentName,
  onCapture,
  onCycleCamera,
  onUploadFile,
  onClose,
  isProcessing,
  statusMessage,
  isAnswerKeyMode = false,
  mode = 'omr',
}: CameraViewfinderProps) {
  const corners = qualityMetrics?.cornersDetected ?? 0;
  const isAligned = corners >= 3 && !qualityMetrics?.blurDetected;
  const isBarcodeMode = mode === 'barcode';

  return (
    <div className="relative flex-1 w-full h-full min-h-[420px] sm:min-h-[500px] bg-black rounded-3xl overflow-hidden flex items-center justify-center select-none">
      {/* Live Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover"
      />

      {/* Camera Initializing Overlay */}
      {!cameraState.isStreaming && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs z-10 gap-3 text-gray-300 text-xs">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
          <span className="font-medium">{cameraState.statusText || 'Initializing camera stream…'}</span>
        </div>
      )}

      {/* Viewfinder Alignment HUD */}
      <div className="pointer-events-none absolute inset-3 sm:inset-6 flex flex-col justify-between z-10">
        {/* Top Header: Barcode Chip + Corner Indicators */}
        <div className="flex items-start justify-between w-full">
          {/* Top-Left Registration Marker Indicator */}
          {!isBarcodeMode ? (
            <div
              className={cn(
                'h-10 w-10 sm:h-12 sm:w-12 border-t-4 border-l-4 rounded-tl-xl transition-all duration-200',
                corners >= 1
                  ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                  : 'border-white/40'
              )}
            />
          ) : <div className="w-10 sm:w-12" />}

          {/* Center HUD: Live Barcode & Status Pill */}
          <div className="flex flex-col items-center gap-1.5 max-w-[70%]">
            {detectedBarcode && (
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-950/90 border border-emerald-500/60 px-3 py-1 shadow-lg text-[11px] font-bold text-emerald-300 animate-in fade-in zoom-in-95">
                <QrCode className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {matchedStudentName ? `${matchedStudentName}` : detectedBarcode.rawValue}
                </span>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              </div>
            )}

            {/* AI Quality / Alignment Status Pill */}
            <div className="flex items-center gap-2 rounded-full bg-black/80 backdrop-blur-md px-3.5 py-1.5 border border-white/10 text-xs font-bold text-white shadow-lg">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full shrink-0',
                  isBarcodeMode
                    ? detectedBarcode ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-blue-400 animate-pulse'
                    : isAligned ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400 animate-pulse'
                )}
              />
              <span className="truncate">
                {statusMessage ||
                  (isBarcodeMode
                    ? detectedBarcode
                      ? `✓ Student Identified: ${matchedStudentName || detectedBarcode.rawValue}`
                      : 'Center student barcode in frame'
                    : isAligned
                    ? '✓ Aligned — Ready to Capture'
                    : `Align 4 Corners (${corners}/4 Detected)`)}
              </span>
            </div>
          </div>

          {/* Top-Right Registration Marker Indicator */}
          {!isBarcodeMode ? (
            <div
              className={cn(
                'h-10 w-10 sm:h-12 sm:w-12 border-t-4 border-r-4 rounded-tr-xl transition-all duration-200',
                corners >= 2
                  ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                  : 'border-white/40'
              )}
            />
          ) : <div className="w-10 sm:w-12" />}
        </div>

        {/* Center Target Box: Barcode laser frame OR OMR full sheet outline */}
        {isBarcodeMode ? (
          <div className="self-center w-[88%] sm:w-[65%] max-w-sm h-40 border-2 rounded-3xl border-dashed border-blue-400/80 bg-blue-950/25 flex flex-col items-center justify-between p-3 relative overflow-hidden shadow-2xl backdrop-blur-xs">
            {/* Corner Accent Brackets for Barcode Target */}
            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-blue-400 rounded-tl-sm pointer-events-none" />
            <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-blue-400 rounded-tr-sm pointer-events-none" />
            <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-blue-400 rounded-bl-sm pointer-events-none" />
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-blue-400 rounded-br-sm pointer-events-none" />

            {/* Moving Laser Beam */}
            <div
              className="barcode-laser-beam pointer-events-none absolute inset-x-2 h-0.5 bg-red-500 shadow-[0_0_12px_2px_rgba(239,68,68,0.95)] z-20"
              style={{ animation: 'barcodeLaserMove 2s ease-in-out infinite' }}
            >
              <div className="absolute top-0 inset-x-0 h-8 -translate-y-full bg-gradient-to-t from-red-500/25 to-transparent pointer-events-none" />
            </div>

            {/* Target Content */}
            <div className="flex items-center gap-1.5 pt-1 text-[11px] font-bold text-blue-300/90 z-10">
              <QrCode className="h-4 w-4 text-blue-400" />
              <span>Barcode Alignment Box</span>
            </div>

            <div className="rounded-full bg-black/75 backdrop-blur-md px-3.5 py-1 text-[11px] font-semibold text-white border border-white/10 shadow-md z-10">
              {detectedBarcode ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Barcode Scanned
                </span>
              ) : (
                'Aim camera at printed student barcode'
              )}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'self-center w-[85%] sm:w-[75%] h-[65%] border-2 rounded-2xl border-dashed transition-all duration-300 flex items-center justify-center',
              isAligned
                ? 'border-emerald-400/50 bg-emerald-500/5'
                : 'border-white/20 bg-black/5'
            )}
          />
        )}

        {/* Bottom Corner Registration Indicators */}
        <div className="flex items-end justify-between w-full">
          {/* Bottom-Left Marker */}
          {!isBarcodeMode ? (
            <div
              className={cn(
                'h-10 w-10 sm:h-12 sm:w-12 border-b-4 border-l-4 rounded-bl-xl transition-all duration-200',
                corners >= 3
                  ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                  : 'border-white/40'
              )}
            />
          ) : <div className="w-10 sm:w-12" />}

          {/* Bottom Center Hint */}
          <div className="text-[10px] text-white/70 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full font-medium">
            {isBarcodeMode
              ? 'Step 1: Student Barcode'
              : isAnswerKeyMode
              ? 'Master Answer Key'
              : `Step 2: Score Sheet (${matchedStudentName || 'Learner'})`}
          </div>

          {/* Bottom-Right Marker */}
          {!isBarcodeMode ? (
            <div
              className={cn(
                'h-10 w-10 sm:h-12 sm:w-12 border-b-4 border-r-4 rounded-br-xl transition-all duration-200',
                corners >= 4
                  ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                  : 'border-white/40'
              )}
            />
          ) : <div className="w-10 sm:w-12" />}
        </div>
      </div>

      {/* Processing Busy Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 animate-in fade-in">
          <RefreshCw className="h-10 w-10 animate-spin text-blue-400" />
          <p className="mt-3 text-sm font-bold text-white tracking-wide">
            {isBarcodeMode ? 'Reading Barcode…' : 'Processing OMR Bubble Analysis…'}
          </p>
          <span className="text-xs text-gray-400 mt-1">
            {isBarcodeMode ? 'Identifying student identity' : 'Running projective homography & marker alignment'}
          </span>
        </div>
      )}

      {/* Floating Bottom Touch Controls Bar */}
      <div className="absolute bottom-4 left-0 right-0 flex items-center justify-between px-6 pointer-events-auto z-20 gap-3">
        {/* Left Control: Upload File Alternative */}
        <label
          className="flex items-center gap-1.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-white/20 transition cursor-pointer shadow-lg active:scale-95"
          title="Upload photo of score sheet"
        >
          <Upload className="h-4 w-4 text-blue-400" />
          <span className="hidden xs:inline">Upload</span>
          <input
            type="file"
            accept="image/*"
            onChange={onUploadFile}
            className="hidden"
          />
        </label>

        {/* Center Control: Big Touch Shutter Button */}
        <button
          type="button"
          onClick={onCapture}
          disabled={isProcessing || !cameraState.isStreaming}
          aria-label={isBarcodeMode ? 'Scan Barcode' : 'Capture OMR Sheet'}
          className={cn(
            'flex h-16 w-16 sm:h-18 sm:w-18 items-center justify-center rounded-full shadow-2xl transition transform active:scale-90',
            isBarcodeMode
              ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/50 hover:scale-105'
              : isAligned
              ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/50 hover:scale-105'
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/50'
          )}
        >
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border-2 border-white/80 flex items-center justify-center">
            {isBarcodeMode ? (
              <QrCode className="h-6 w-6 text-white" />
            ) : (
              <div
                className={cn(
                  'h-9 w-9 sm:h-10 sm:w-10 rounded-full transition-colors',
                  isAligned ? 'bg-emerald-400' : 'bg-white'
                )}
              />
            )}
          </div>
        </button>

        {/* Right Controls: Switch Camera & Close */}
        <div className="flex items-center gap-2">
          {cameraState.hasMultipleCameras && (
            <button
              type="button"
              onClick={onCycleCamera}
              aria-label="Switch Camera"
              title="Switch Camera (Front/Rear)"
              className="rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 p-2.5 text-white hover:bg-white/20 transition shadow-lg active:scale-95"
            >
              <SwitchCamera className="h-4 w-4 text-emerald-400" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Scanner"
            className="rounded-2xl bg-black/60 backdrop-blur-md border border-white/15 px-3.5 py-2.5 text-xs font-semibold text-gray-300 hover:text-white hover:bg-red-500/60 transition shadow-lg active:scale-95"
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes barcodeLaserMove {
          0% {
            top: 10%;
            opacity: 0.8;
          }
          50% {
            top: 86%;
            opacity: 1;
          }
          100% {
            top: 10%;
            opacity: 0.8;
          }
        }
        .barcode-laser-beam {
          animation: barcodeLaserMove 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
