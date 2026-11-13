/**
 * Project KIT — Continuous Live Barcode Scanner Hook
 * Runs a non-blocking, throttled barcode detection loop over a live HTMLVideoElement.
 * Features:
 * - Throttled frame sampling (prevents mobile CPU heating and battery drain)
 * - Duplicate suppression cooldown
 * - Visual target frame coordinates
 * - Instant callback upon valid detection
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeBarcodeFromBlob, decodeBarcodeFromCanvas } from './barcode-engine';
import { DecodedBarcode } from './barcode-types';

export interface UseContinuousBarcodeOptions {
  enabled?: boolean;
  throttleMs?: number; // Default 250ms (4 FPS scan rate)
  duplicateCooldownMs?: number; // Default 2000ms
  onBarcodeDetected?: (barcode: DecodedBarcode) => void;
}

export function useContinuousBarcode(
  videoRefOrOptions?: React.RefObject<HTMLVideoElement | null> | UseContinuousBarcodeOptions,
  options?: UseContinuousBarcodeOptions
) {
  let passedRef: React.RefObject<HTMLVideoElement | null> | null = null;
  let resolvedOptions: UseContinuousBarcodeOptions = {};

  if (videoRefOrOptions && 'current' in videoRefOrOptions) {
    passedRef = videoRefOrOptions;
    resolvedOptions = options || {};
  } else if (videoRefOrOptions) {
    resolvedOptions = videoRefOrOptions as UseContinuousBarcodeOptions;
  }

  const {
    enabled = true,
    throttleMs = 250,
    duplicateCooldownMs = 2000,
    onBarcodeDetected,
  } = resolvedOptions;

  const callbackRef = useRef(onBarcodeDetected);
  callbackRef.current = onBarcodeDetected;

  const [lastDetected, setLastDetected] = useState<DecodedBarcode | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanBox, setScanBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastScanTimeRef = useRef<number>(0);
  const recentCodesRef = useRef<Map<string, number>>(new Map());

  /**
   * Resets barcode detection state so another barcode can be scanned.
   */
  const resetBarcodeState = useCallback(() => {
    setLastDetected(null);
    setScanBox(null);
    recentCodesRef.current.clear();
  }, []);

  /**
   * Decodes a manually uploaded image file or blob.
   */
  const scanBlob = useCallback(async (blob: Blob): Promise<DecodedBarcode | null> => {
    try {
      const result = await decodeBarcodeFromBlob(blob);
      if (result) {
        setLastDetected(result);
        callbackRef.current?.(result);
      }
      return result;
    } catch (err) {
      console.warn('[ContinuousBarcode] Manual scan error:', err);
      return null;
    }
  }, []);

  /**
   * Main scan step for a single video frame.
   */
  const scanVideoFrame = useCallback(
    async (video: HTMLVideoElement): Promise<DecodedBarcode | null> => {
      if (!video || video.readyState < 2) return null;

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (!vW || !vH) return null;

      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
      }
      const canvas = offscreenCanvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      // Try the viewfinder area first, then lower/wider bands where printed
      // answer-sheet barcodes commonly appear. Keep each pass at native
      // resolution so narrow Code 39 bars are not blurred by downscaling.
      const regions = [
        { x: 0.125, y: 0.30, width: 0.75, height: 0.40 },
        { x: 0.08, y: 0.45, width: 0.84, height: 0.45 },
        { x: 0.05, y: 0.20, width: 0.90, height: 0.70 },
      ];

      let barcode: DecodedBarcode | null = null;
      let activeOffsetX = 0;
      let activeOffsetY = 0;
      let activeScale = 1;

      for (const region of regions) {
        const cropX = Math.round(vW * region.x);
        const cropY = Math.round(vH * region.y);
        const cropW = Math.round(vW * region.width);
        const cropH = Math.round(vH * region.height);

        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        barcode = await decodeBarcodeFromCanvas(canvas);
        if (barcode) {
          activeOffsetX = cropX;
          activeOffsetY = cropY;
          break;
        }
      }

      // Final fallback for barcodes outside the expected sheet bands.
      if (!barcode) {
        const fullScale = Math.min(1, 1280 / vW);
        const targetW = Math.round(vW * fullScale);
        const targetH = Math.round(vH * fullScale);

        canvas.width = targetW;
        canvas.height = targetH;
        ctx.drawImage(video, 0, 0, targetW, targetH);

        barcode = await decodeBarcodeFromCanvas(canvas);
        activeScale = fullScale;
      }

      if (!barcode) {
        setScanBox(null);
        return null;
      }

      // Check duplicate suppression
      const now = Date.now();
      const lastSeen = recentCodesRef.current.get(barcode.rawValue) || 0;
      if (now - lastSeen < duplicateCooldownMs) {
        return null; // Suppress duplicate
      }
      recentCodesRef.current.set(barcode.rawValue, now);

      // Clean old entries
      for (const [code, time] of recentCodesRef.current.entries()) {
        if (now - time > duplicateCooldownMs * 2) {
          recentCodesRef.current.delete(code);
        }
      }

      if (barcode.boundingBox) {
        // Map back to video aspect
        setScanBox({
          x: activeOffsetX + barcode.boundingBox.x / activeScale,
          y: activeOffsetY + barcode.boundingBox.y / activeScale,
          width: barcode.boundingBox.width / activeScale,
          height: barcode.boundingBox.height / activeScale,
        });
      }

      setLastDetected(barcode);
      callbackRef.current?.(barcode);
      return barcode;
    },
    [duplicateCooldownMs]
  );

  /**
   * Starts the continuous requestAnimationFrame loop over a video reference.
   */
  const startScanningLoop = useCallback(
    (videoElement: HTMLVideoElement | null) => {
      if (!enabled || !videoElement) return;

      setIsScanning(true);

      const loop = async (timestamp: number) => {
        if (timestamp - lastScanTimeRef.current >= throttleMs) {
          lastScanTimeRef.current = timestamp;
          await scanVideoFrame(videoElement);
        }
        animFrameRef.current = requestAnimationFrame(loop);
      };

      animFrameRef.current = requestAnimationFrame(loop);
    },
    [enabled, throttleMs, scanVideoFrame]
  );

  /**
   * Stops the scanning loop.
   */
  const stopScanningLoop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsScanning(false);
  }, []);

  useEffect(() => {
    if (!enabled || !passedRef) {
      stopScanningLoop();
      return;
    }

    let cancelled = false;
    const waitForVideo = () => {
      if (cancelled) return;
      const video = passedRef?.current;
      if (video) {
        startScanningLoop(video);
        return;
      }
      animFrameRef.current = requestAnimationFrame(waitForVideo);
    };

    waitForVideo();

    return () => {
      cancelled = true;
      stopScanningLoop();
    };
  }, [passedRef, enabled, startScanningLoop, stopScanningLoop]);

  return {
    isScanning,
    lastDetected,
    scanBox,
    startScanningLoop,
    stopScanningLoop,
    scanVideoFrame,
    scanBlob,
    resetBarcodeState,
  };
}
