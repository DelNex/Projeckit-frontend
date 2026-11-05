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
}: CameraViewfinderProps) {
  const corners = qualityMetrics?.cornersDetected ?? 0;
  const isAligned = corners >= 3 && !qualityMetrics?.blurDetected;

  return (
    <div className="relative flex-1 w-full h-full min-h-[420px] sm:min-h-[500px] bg-black rounded-3xl overflow-hidden flex items-center justify-center select-none">
      {/* Live Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={cn(
          'w-full h-full object-cover transition-opacity duration-300',
          cameraState.isStreaming ? 'opacity-100' : 'opacity-0'
        )}
      />

      {/* Viewfinder Alignment HUD */}
      <div className="pointer-events-none absolute inset-3 sm:inset-6 flex flex-col justify-between">
        {/* Top Header: Barcode Chip + Corner Indicators */}
        <div className="flex items-start justify-between w-full">
          {/* Top-Left Registration Marker Indicator */}
          <div
            className={cn(
              'h-10 w-10 sm:h-12 sm:w-12 border-t-4 border-l-4 rounded-tl-xl transition-all duration-200',
              corners >= 1
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                : 'border-white/40'
            )}
          />

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
                  isAligned ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400 animate-pulse'
                )}
              />
              <span className="truncate">
                {statusMessage ||
                  (isAligned
                    ? '✓ Aligned — Ready to Capture'
                    : `Align 4 Corners (${corners}/4 Detected)`)}
              </span>
            </div>
          </div>

          {/* Top-Right Registration Marker Indicator */}
          <div
            className={cn(
              'h-10 w-10 sm:h-12 sm:w-12 border-t-4 border-r-4 rounded-tr-xl transition-all duration-200',
              corners >= 2
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                : 'border-white/40'
            )}
          />
        </div>

        {/* Center Target Box: Dashed guideline for sheet placement */}
        <div
          className={cn(
            'self-center w-[85%] sm:w-[75%] h-[65%] border-2 rounded-2xl border-dashed transition-all duration-300 flex items-center justify-center',
            isAligned
              ? 'border-emerald-400/50 bg-emerald-500/5'
              : 'border-white/20 bg-black/5'
          )}
        >
          {!cameraState.isStreaming && (
            <div className="flex flex-col items-center gap-2 text-gray-400 text-xs">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
              <span>{cameraState.statusText}</span>
            </div>
          )}
        </div>

        {/* Bottom Corner Registration Indicators */}
        <div className="flex items-end justify-between w-full">
          {/* Bottom-Left Marker */}
          <div
            className={cn(
              'h-10 w-10 sm:h-12 sm:w-12 border-b-4 border-l-4 rounded-bl-xl transition-all duration-200',
              corners >= 3
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                : 'border-white/40'
            )}
          />

          {/* Bottom Center Hint */}
          <div className="text-[10px] text-white/70 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full font-medium">
            {isAnswerKeyMode ? 'Master Answer Key' : 'DepEd OMR Score Sheet'}
          </div>

          {/* Bottom-Right Marker */}
          <div
            className={cn(
              'h-10 w-10 sm:h-12 sm:w-12 border-b-4 border-r-4 rounded-br-xl transition-all duration-200',
              corners >= 4
                ? 'border-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                : 'border-white/40'
            )}
          />
        </div>
      </div>

      {/* Processing Busy Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 animate-in fade-in">
          <RefreshCw className="h-10 w-10 animate-spin text-blue-400" />
          <p className="mt-3 text-sm font-bold text-white tracking-wide">
            Processing OMR Bubble Analysis…
          </p>
          <span className="text-xs text-gray-400 mt-1">
            Running projective homography & marker alignment
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
          aria-label="Capture OMR Sheet"
          className={cn(
            'flex h-16 w-16 sm:h-18 sm:w-18 items-center justify-center rounded-full shadow-2xl transition transform active:scale-90',
            isAligned
              ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/50 hover:scale-105'
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/50'
          )}
        >
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border-2 border-white/80 flex items-center justify-center">
            <div
              className={cn(
                'h-9 w-9 sm:h-10 sm:w-10 rounded-full transition-colors',
                isAligned ? 'bg-emerald-400' : 'bg-white'
              )}
            />
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
    </div>
  );
}

