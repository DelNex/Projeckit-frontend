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

      // Downscale to 640px max width for rapid barcode decoding
      const scale = Math.min(1, 640 / vW);
      const targetW = Math.round(vW * scale);
      const targetH = Math.round(vH * scale);

      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
      }
      const canvas = offscreenCanvasRef.current;
      canvas.width = targetW;
      canvas.height = targetH;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      ctx.drawImage(video, 0, 0, targetW, targetH);

      const barcode = await decodeBarcodeFromCanvas(canvas);
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
          x: barcode.boundingBox.x / scale,
          y: barcode.boundingBox.y / scale,
          width: barcode.boundingBox.width / scale,
          height: barcode.boundingBox.height / scale,
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
    if (passedRef?.current && enabled) {
      startScanningLoop(passedRef.current);
    } else {
      stopScanningLoop();
    }
    return () => {
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
