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
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const startSeqRef = useRef<number>(0);
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
    startSeqRef.current++;

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
    if (!video) return null;

    // If video is not ready yet, wait briefly for frame data
    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 600);
        const onCanPlay = () => {
          clearTimeout(timeout);
          video.removeEventListener('canplay', onCanPlay);
          resolve();
        };
        video.addEventListener('canplay', onCanPlay, { once: true });
      });
    }

    const width = video.videoWidth || 800;
    const height = video.videoHeight || 1100;
    if (width === 0 || height === 0) return null;

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
    const currentSeq = ++startSeqRef.current;

    // If already streaming and video is active, do not recreate stream
    if (
      streamRef.current &&
      streamRef.current.active &&
      streamRef.current.getVideoTracks().some((t) => t.readyState === 'live')
    ) {
      if (videoRef.current) {
        if (videoRef.current.srcObject !== streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
        if (videoRef.current.paused) {
          try {
            await videoRef.current.play();
          } catch (e: any) {
            if (e?.name !== 'AbortError') console.warn('[useOmrCamera] play error:', e);
          }
        }
      }
      return;
    }

    // Clean existing tracks without resetting status to "Camera stopped"
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      streamRef.current = null;
    }

    setCameraStatus((prev) => ({
      ...prev,
      isStreaming: false,
      error: null,
      statusText: 'Starting camera…',
    }));

    try {
      let stream: MediaStream;
      const idealConstraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(idealConstraints);
      } catch (firstErr) {
        console.warn('[useOmrCamera] Ideal constraints failed, falling back to basic video', firstErr);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }

      // Check if another startCamera or stopCamera was called while waiting for getUserMedia
      if (currentSeq !== startSeqRef.current) {
        stream.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        const video = videoRef.current;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.muted = true;

        try {
          await video.play();
        } catch (playErr: any) {
          if (playErr?.name !== 'AbortError') {
            console.warn('[useOmrCamera] video.play() warning:', playErr);
          }
        }
      }

      if (currentSeq !== startSeqRef.current) return;

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
        if (currentSeq !== startSeqRef.current) return;

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
      if (currentSeq !== startSeqRef.current) return;
      console.error('[useOmrCamera] Failed to access camera', err);
      const errorMsg = err.message || 'Camera access denied or unavailable.';
      setCameraStatus((prev) => ({
        ...prev,
        isStreaming: false,
        error: errorMsg,
        statusText: errorMsg,
      }));
      if (optionsRef.current?.onError) optionsRef.current.onError(err);
    }
  }, []);

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

