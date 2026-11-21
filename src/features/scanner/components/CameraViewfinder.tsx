/**
 * Project KIT — Mobile-First Camera Viewfinder & Alignment HUD
 * Clean, uncluttered camera UI with 4-corner registration markers,
 * smooth laser barcode scanning overlay, AI quality advisor pills, and touch-friendly controls.
 */

'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Camera,
  CheckCircle2,
  Flashlight,
  FlashlightOff,
  QrCode,
  RefreshCw,
  SwitchCamera,
  Upload,
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
  onRetryCamera: () => void;
  onUploadFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClose: () => void;
  isProcessing: boolean;
  capturePrompt?: boolean;
  statusMessage?: string;
  isAnswerKeyMode?: boolean;
  mode?: 'barcode' | 'omr';
  hasTorch?: boolean;
  isTorchOn?: boolean;
  onToggleTorch?: () => void;
}

export function CameraViewfinder({
  videoRef,
  cameraState,
  qualityMetrics,
  detectedBarcode,
  matchedStudentName,
  onCapture,
  onCycleCamera,
  onRetryCamera,
  onUploadFile,
  isProcessing,
  capturePrompt = false,
  statusMessage,
  mode = 'omr',
  hasTorch = false,
  isTorchOn = false,
  onToggleTorch,
}: CameraViewfinderProps) {
  const corners = qualityMetrics?.cornersDetected ?? 0;
  const isAligned = corners >= 3 && !qualityMetrics?.blurDetected;
  const isBarcodeMode = mode === 'barcode';

  return (
    <div className="pk-omr-viewfinder relative flex-1 w-full h-full min-h-[220px] sm:min-h-[340px] bg-black rounded-2xl sm:rounded-3xl overflow-hidden flex items-center justify-center select-none">
      {/* Live Video Feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* Camera Initializing Overlay */}
      {!cameraState.isStreaming && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/85 px-5 text-center text-xs text-gray-200 backdrop-blur-xs">
          {cameraState.error || ['denied', 'unavailable', 'error'].includes(cameraState.permissionState) ? (
            <>
              <Camera className="h-8 w-8 text-gray-400" />
              <div className="max-w-sm space-y-1">
                <p className="font-semibold text-white">Camera unavailable</p>
                <p className="leading-relaxed text-gray-300">{cameraState.error || cameraState.statusText || 'Allow camera access in your browser settings, or upload a clear answer-sheet photo.'}</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button type="button" onClick={onRetryCamera} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">Try camera again</button>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-gray-600 bg-gray-800 px-4 py-2 font-semibold text-white transition hover:bg-gray-700 focus-within:ring-2 focus-within:ring-blue-300">
                  <Upload className="h-4 w-4" /> Upload answer sheet
                  <input type="file" accept="image/*" onChange={onUploadFile} className="sr-only" aria-label="Upload answer sheet image" />
                </label>
              </div>
            </>
          ) : (
            <>
              <RefreshCw className="h-7 w-7 animate-spin text-blue-400" />
              <span className="font-medium">{cameraState.statusText || 'Initializing camera preview…'}</span>
            </>
          )}
        </div>
      )}

      {/* Viewfinder Alignment HUD */}
      <div className="pk-omr-viewfinder-hud pointer-events-none absolute inset-2.5 sm:inset-5 flex flex-col justify-between z-10">
        {/* Top Header: Corner Indicators & AI Status Pill */}
        <div className="flex items-start justify-between w-full">
          {/* Top-Left Registration Marker Indicator */}
          {!isBarcodeMode ? (
            <div
              className={cn(
                'h-8 w-8 sm:h-11 sm:w-11 border-t-3 sm:border-t-4 border-l-3 sm:border-l-4 rounded-tl-lg sm:rounded-tl-xl transition-all duration-200',
                corners >= 1
                  ? 'border-emerald-400 shadow-[0_0_10px_rgba(69,104,245,0.4)]'
                  : 'border-white/30'
              )}
            />
          ) : <div className="w-8 sm:w-11" />}

          {/* Center HUD: Live Barcode & Status Pill */}
          <div className="flex flex-col items-center gap-1 max-w-[80%] pt-0.5">
            {detectedBarcode && (
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-950/90 border border-emerald-500/60 px-3 py-0.5 shadow-lg text-[10px] sm:text-xs font-bold text-emerald-300 animate-in fade-in">
                <QrCode className="h-3 w-3 text-emerald-400 shrink-0" />
                <span className="truncate">
                  {matchedStudentName || detectedBarcode.rawValue}
                </span>
                <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
              </div>
            )}

            {/* AI Quality / Alignment Status Pill */}
            <div className="pk-omr-status flex items-center gap-1.5 rounded-full bg-black/75 backdrop-blur-md px-3 py-1 border border-white/10 text-[11px] sm:text-xs font-semibold text-white shadow-md" role="status" aria-live="polite">
              <span
                className={cn(
                  'h-2 w-2 rounded-full shrink-0',
                  isBarcodeMode
                    ? detectedBarcode ? 'bg-emerald-400 shadow-[0_0_6px_rgba(69,104,245,0.45)]' : 'bg-blue-400 animate-pulse'
                    : isAligned ? 'bg-emerald-400 shadow-[0_0_6px_rgba(69,104,245,0.45)]' : 'bg-amber-400 animate-pulse'
                )}
              />
              <span className="truncate">
                {statusMessage ||
                  (isBarcodeMode
                    ? detectedBarcode
                      ? `Student Identified`
                      : 'Aim at student barcode'
                    : isAligned
                    ? '✓ Ready to Capture'
                    : `Align 4 Corners (${corners}/4)`)}
              </span>
            </div>
          </div>

          {/* Top-Right Registration Marker Indicator */}
          {!isBarcodeMode ? (
            <div
              className={cn(
                'h-8 w-8 sm:h-11 sm:w-11 border-t-3 sm:border-t-4 border-r-3 sm:border-r-4 rounded-tr-lg sm:rounded-tr-xl transition-all duration-200',
                corners >= 2
                  ? 'border-emerald-400 shadow-[0_0_10px_rgba(69,104,245,0.4)]'
                  : 'border-white/30'
              )}
            />
          ) : <div className="w-8 sm:w-11" />}
        </div>

        {/* Center Target Box: Active ONLY in Barcode Mode */}
        {isBarcodeMode && (
          <div className="self-center w-[85%] sm:w-[65%] max-w-xs h-32 border border-dashed border-blue-400/80 bg-blue-950/40 rounded-2xl flex flex-col items-center justify-between p-2.5 relative overflow-hidden shadow-2xl">
            {/* Corner Accent Brackets for Barcode Target */}
            <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t-2 border-l-2 border-blue-400 pointer-events-none" />
            <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t-2 border-r-2 border-blue-400 pointer-events-none" />
            <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b-2 border-l-2 border-blue-400 pointer-events-none" />
            <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b-2 border-r-2 border-blue-400 pointer-events-none" />

            {/* Moving Laser Scanner Assembly */}
            <div
              className="barcode-laser-assembly pointer-events-none absolute inset-x-2 top-0 z-20 will-change-transform"
            >
              {/* Directional Flipping Trail */}
              <div className="barcode-laser-trail absolute inset-x-0 bottom-0 h-8 pointer-events-none origin-bottom" />
              {/* Solid Laser Beam Line */}
              <div className="h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(69,104,245,0.65)]" />
            </div>

            <div className="flex items-center gap-1 text-[10px] font-bold text-blue-300 z-10">
              <QrCode className="h-3.5 w-3.5 text-blue-400" />
              <span>Barcode Scanner</span>
            </div>

            <div className="relative z-20 rounded-full border border-[#383b40] bg-[#1b1d20] px-3 py-1.5 text-[10px] font-semibold text-[#f3f4f6] shadow-sm">
              {detectedBarcode ? (
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Barcode Scanned
                </span>
              ) : (
                'Place barcode in box'
              )}
            </div>
          </div>
        )}

        {/* Bottom Corner Registration Indicators */}
        <div className="flex items-end justify-between w-full pb-20 sm:pb-22">
          {/* Bottom-Left Marker */}
          {!isBarcodeMode ? (
            <div
              className={cn(
                'h-8 w-8 sm:h-11 sm:w-11 border-b-3 sm:border-b-4 border-l-3 sm:border-l-4 rounded-bl-lg sm:rounded-bl-xl transition-all duration-200',
                corners >= 3
                  ? 'border-emerald-400 shadow-[0_0_10px_rgba(69,104,245,0.4)]'
                  : 'border-white/30'
              )}
            />
          ) : <div className="w-8 sm:w-11" />}

          {/* Bottom-Right Marker */}
          {!isBarcodeMode ? (
            <div
              className={cn(
                'h-8 w-8 sm:h-11 sm:w-11 border-b-3 sm:border-b-4 border-r-3 sm:border-r-4 rounded-br-lg sm:rounded-br-xl transition-all duration-200',
                corners >= 4
                  ? 'border-emerald-400 shadow-[0_0_10px_rgba(69,104,245,0.4)]'
                  : 'border-white/30'
              )}
            />
          ) : <div className="w-8 sm:w-11" />}
        </div>
      </div>

      {/* Processing Busy Overlay */}
      {isProcessing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-30 animate-in fade-in">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-400" />
          <p className="mt-2.5 text-xs sm:text-sm font-bold text-white tracking-wide">
            {isBarcodeMode ? 'Reading Barcode…' : 'Processing OMR Bubbles…'}
          </p>
        </div>
      )}

      {/* Floating Bottom Touch Controls Bar */}
      <div className="pk-omr-control-bar absolute bottom-3 inset-x-0 flex items-center justify-center gap-3 sm:gap-6 px-4 pointer-events-auto z-20">
        {/* Left Control: Upload File Alternative */}
        <label
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition cursor-pointer shadow-lg active:scale-95 shrink-0"
          title="Upload image"
          aria-label="Upload image"
        >
          <Upload className="h-5 w-5 text-blue-400" />
          <input
            type="file"
            accept="image/*"
            onChange={onUploadFile}
            className="hidden"
          />
        </label>

        {/* Torch / Flashlight Toggle */}
        {hasTorch && onToggleTorch && (
          <button
            type="button"
            onClick={onToggleTorch}
            disabled={isProcessing || !cameraState.isStreaming}
            aria-label={isTorchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
            title={isTorchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md border transition shadow-lg active:scale-95 shrink-0',
              isTorchOn
                ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_10px_rgba(69,104,245,0.4)] ring-1 ring-amber-400/50'
                : 'bg-black/60 border-white/20 text-white/80 hover:bg-white/20 hover:text-white'
            )}
          >
            {isTorchOn ? (
              <Flashlight className="h-5 w-5 text-amber-400" />
            ) : (
              <FlashlightOff className="h-5 w-5 text-gray-400" />
            )}
          </button>
        )}

        {/* Center Control: Clean Touch Shutter Button */}
        {capturePrompt && !isBarcodeMode && (
          <div className="absolute bottom-[4.5rem] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-emerald-300/70 bg-emerald-950/90 px-4 py-2 text-xs font-bold text-emerald-100 shadow-xl">
            Sheet detected — tap to capture and lock
          </div>
        )}
        <button
          type="button"
          onClick={onCapture}
          disabled={isProcessing || !cameraState.isStreaming}
          aria-label={isBarcodeMode ? 'Scan Barcode' : capturePrompt ? 'Capture and lock detected OMR sheet' : 'Capture OMR Sheet'}
          className={cn(
            'flex h-15 w-15 sm:h-17 sm:w-17 items-center justify-center rounded-full shadow-2xl transition transform active:scale-90 shrink-0',
            isBarcodeMode
              ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/50'
              : capturePrompt
              ? 'bg-emerald-500 text-white hover:bg-emerald-400 shadow-emerald-500/60 animate-pulse'
              : isAligned
              ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/50 hover:scale-105'
              : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-600/50'
          )}
        >
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full border-2 border-white/80 flex items-center justify-center">
            {isBarcodeMode ? (
              <QrCode className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
            ) : (
              <div
                className={cn(
                  'h-8 w-8 sm:h-10 sm:w-10 rounded-full transition-colors',
                  isAligned ? 'bg-emerald-400' : 'bg-white'
                )}
              />
            )}
          </div>
        </button>

        {/* Right Control: Switch Camera (Front/Rear) */}
        {cameraState.hasMultipleCameras ? (
          <button
            type="button"
            onClick={onCycleCamera}
            disabled={isProcessing}
            aria-label="Switch Camera"
            title="Switch Camera (Front/Rear)"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 transition shadow-lg active:scale-95 shrink-0"
          >
            <SwitchCamera className="h-5 w-5 text-emerald-400" />
          </button>
        ) : (
          !hasTorch && <div className="w-11 shrink-0" />
        )}
      </div>
    </div>
  );
}