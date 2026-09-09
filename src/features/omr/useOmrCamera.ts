/**
 * Project KIT — Headless OMR Camera Hook
 * Handles MediaStream lifecycle, offscreen frame evaluation,
 * zero continuous React re-renders, and proper cleanup of camera tracks.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeOpticalEngineAdapter } from './engines/native-optical-engine';

export interface UseOmrCameraOptions {
  onCapture?: (blob: Blob) => void;
  onError?: (err: Error) => void;
}

export interface OmrCameraStatus {
  isStreaming: boolean;
  isAligned: boolean;
  cornerCount: number;
  isLightingAcceptable: boolean;
  statusText: string;
  error: string | null;
}

export function useOmrCamera(options: UseOmrCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastStateRef = useRef<{ isAligned: boolean; corners: number; lighting: boolean }>({
    isAligned: false,
    corners: 0,
    lighting: true,
  });

  const [cameraStatus, setCameraStatus] = useState<OmrCameraStatus>({
    isStreaming: false,
    isAligned: false,
    cornerCount: 0,
    isLightingAcceptable: true,
    statusText: 'Camera idle',
    error: null,
  });

  const stopCamera = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('[OMR Camera] Error stopping track', e);
        }
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStatus((prev) => ({
      ...prev,
      isStreaming: false,
      statusText: 'Camera stopped',
    }));
  }, []);

  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return null;

    const width = video.videoWidth || 800;
    const height = video.videoHeight || 1100;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
    });
  }, []);

  const startCamera = useCallback(async () => {
    try {
      stopCamera();

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStatus((prev) => ({
        ...prev,
        isStreaming: true,
        error: null,
        statusText: 'Aligning OMR Sheet…',
      }));

      // Initialize offscreen analysis canvas
      if (!offscreenCanvasRef.current) {
        offscreenCanvasRef.current = document.createElement('canvas');
      }

      let frameCounter = 0;

      const analyzeLoop = () => {
        const video = videoRef.current;
        if (!video || !streamRef.current || video.readyState < 2) {
          animFrameRef.current = requestAnimationFrame(analyzeLoop);
          return;
        }

        // Sample frame only every 10 frames (~6 FPS) to prevent browser main-thread congestion
        frameCounter++;
        if (frameCounter % 10 === 0) {
          const sampleW = 200;
          const sampleH = Math.floor((video.videoHeight / (video.videoWidth || 1)) * sampleW) || 275;

          const canvas = offscreenCanvasRef.current;
          if (canvas) {
            canvas.width = sampleW;
            canvas.height = sampleH;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, sampleW, sampleH);
              const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
              const metrics = NativeOpticalEngineAdapter.evaluateImageMetrics(
                imgData.data,
                sampleW,
                sampleH
              );

              // Only trigger React state update if discrete classification changes
              const last = lastStateRef.current;
              if (
                last.isAligned !== metrics.markersDetected ||
                last.corners !== metrics.cornerCount ||
                last.lighting !== metrics.isLightingAcceptable
              ) {
                lastStateRef.current = {
                  isAligned: metrics.markersDetected,
                  corners: metrics.cornerCount,
                  lighting: metrics.isLightingAcceptable,
                };

                let text = `Align 4 Corners (${metrics.cornerCount}/4 detected)`;
                if (metrics.markersDetected && metrics.isLightingAcceptable) {
                  text = '✓ Alignment Good — Ready to Capture';
                } else if (!metrics.isLightingAcceptable) {
                  text = '⚠ Low Lighting — Adjust Room Light';
                }

                setCameraStatus((prev) => ({
                  ...prev,
                  isAligned: metrics.markersDetected,
                  cornerCount: metrics.cornerCount,
                  isLightingAcceptable: metrics.isLightingAcceptable,
                  statusText: text,
                }));
              }
            }
          }
        }

        animFrameRef.current = requestAnimationFrame(analyzeLoop);
      };

      animFrameRef.current = requestAnimationFrame(analyzeLoop);
    } catch (err: any) {
      console.error('[useOmrCamera] Failed to access camera', err);
      const errorMsg = err.message || 'Camera access denied or unavailable.';
      setCameraStatus((prev) => ({
        ...prev,
        isStreaming: false,
        error: errorMsg,
        statusText: errorMsg,
      }));
      if (options.onError) options.onError(err);
    }
  }, [stopCamera, options]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    cameraStatus,
    startCamera,
    stopCamera,
    captureFrame,
  };
}

