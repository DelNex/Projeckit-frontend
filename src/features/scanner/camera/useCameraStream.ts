/**
 * Project KIT — Mobile-First Camera Stream Hook
 * Resilient camera integration for Android Chrome, iOS Safari, and Desktop browsers.
 * Supports live camera switching, device enumeration, visibility handling,
 * and leak-free MediaStream lifecycle management.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CameraDeviceInfo,
  CameraFacingMode,
  CameraState,
  CaptureFrameOptions,
  UseCameraStreamOptions,
} from './camera-types';
import { discoverVideoDevices, formatCameraError, stopMediaStreamTracks } from './camera-utils';

export function useCameraStream(options: UseCameraStreamOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seqRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<CameraState>({
    isStreaming: false,
    permissionState: 'idle',
    activeDeviceId: options.preferredDeviceId || null,
    activeFacingMode: options.preferredFacingMode || 'environment',
    availableCameras: [],
    hasMultipleCameras: false,
    aspectRatio: 16 / 9,
    videoWidth: 0,
    videoHeight: 0,
    error: null,
    statusText: 'Camera idle',
  });

  /**
   * Refreshes the list of available camera devices.
   */
  const refreshDevices = useCallback(async () => {
    const devices = await discoverVideoDevices();
    setState((prev) => ({
      ...prev,
      availableCameras: devices,
      hasMultipleCameras: devices.length > 1,
    }));
    return devices;
  }, []);

  /**
   * Stops the active media stream and disconnects video element.
   */
  const stopStream = useCallback(() => {
    seqRef.current++;
    stopMediaStreamTracks(streamRef.current);
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setState((prev) => ({
      ...prev,
      isStreaming: false,
      permissionState: prev.permissionState === 'denied' ? 'denied' : 'idle',
      statusText: 'Camera stopped',
    }));

    optionsRef.current.onStreamStopped?.();
  }, []);

  /**
   * Starts or restarts the camera stream using current or specified constraints.
   */
  const startStream = useCallback(
    async (override?: { deviceId?: string; facingMode?: CameraFacingMode }) => {
      const currentSeq = ++seqRef.current;

      const targetDeviceId = override?.deviceId ?? state.activeDeviceId;
      const targetFacingMode = override?.facingMode ?? state.activeFacingMode;

      // Clean up previous tracks first
      if (streamRef.current) {
        stopMediaStreamTracks(streamRef.current);
        streamRef.current = null;
      }

      setState((prev) => ({
        ...prev,
        permissionState: 'requesting',
        error: null,
        statusText: 'Requesting camera access…',
      }));

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API (getUserMedia) is not supported in this browser.');
        }

        // 1. Build optimal constraints with mobile priority
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: optionsRef.current.preferredWidth || 1920 },
          height: { ideal: optionsRef.current.preferredHeight || 1080 },
        };

        if (targetDeviceId) {
          videoConstraints.deviceId = { exact: targetDeviceId };
        } else {
          videoConstraints.facingMode = { ideal: targetFacingMode };
        }

        let mediaStream: MediaStream;

        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
          });
        } catch (firstErr) {
          console.warn('[Camera] Exact constraints failed, trying facing mode fallback', firstErr);
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: targetFacingMode } },
              audio: false,
            });
          } catch (secondErr) {
            console.warn('[Camera] Facing mode failed, falling back to basic video: true', secondErr);
            mediaStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false,
            });
          }
        }

        // Abort if another stream request was triggered while awaiting getUserMedia
        if (currentSeq !== seqRef.current) {
          stopMediaStreamTracks(mediaStream);
          return;
        }

        streamRef.current = mediaStream;

        // Discover devices post-permission so real labels are visible
        const devices = await discoverVideoDevices();

        // Determine actual active track settings
        const videoTrack = mediaStream.getVideoTracks()[0];
        const settings = videoTrack?.getSettings?.() || {};
        const actualDeviceId = settings.deviceId || targetDeviceId || null;
        const actualFacing = (settings.facingMode as CameraFacingMode) || targetFacingMode;

        // Attach stream to video element
        if (videoRef.current) {
          const video = videoRef.current;
          video.srcObject = mediaStream;
          video.setAttribute('playsinline', 'true');
          video.muted = true;
          video.autoplay = true;

          try {
            await video.play();
          } catch (playErr: any) {
            if (playErr?.name !== 'AbortError') {
              console.warn('[Camera] video.play() warning:', playErr);
            }
          }
        }

        if (currentSeq !== seqRef.current) return;

        const vW = videoRef.current?.videoWidth || 1280;
        const vH = videoRef.current?.videoHeight || 720;
        const ar = vH > 0 ? vW / vH : 16 / 9;

        setState({
          isStreaming: true,
          permissionState: 'streaming',
          activeDeviceId: actualDeviceId,
          activeFacingMode: actualFacing,
          availableCameras: devices,
          hasMultipleCameras: devices.length > 1,
          aspectRatio: ar,
          videoWidth: vW,
          videoHeight: vH,
          error: null,
          statusText: 'Camera active',
        });

        optionsRef.current.onStreamStarted?.(mediaStream);
      } catch (err: unknown) {
        if (currentSeq !== seqRef.current) return;
        const formatted = formatCameraError(err);
        console.error('[Camera] Access error:', err);

        setState((prev) => ({
          ...prev,
          isStreaming: false,
          permissionState: formatted.permissionState,
          error: formatted.message,
          statusText: formatted.message,
        }));

        optionsRef.current.onError?.(err instanceof Error ? err : new Error(formatted.message));
      }
    },
    [state.activeDeviceId, state.activeFacingMode]
  );

  /**
   * Switches to a specific camera device ID.
   */
  const switchCamera = useCallback(
    async (deviceId: string) => {
      const match = state.availableCameras.find((c) => c.deviceId === deviceId);
      await startStream({
        deviceId,
        facingMode: match?.facingMode || state.activeFacingMode,
      });
    },
    [state.availableCameras, state.activeFacingMode, startStream]
  );

  /**
   * Cycles to the next available camera (e.g. toggling rear/front).
   */
  const cycleCamera = useCallback(async () => {
    if (state.availableCameras.length <= 1) {
      // Toggle facingMode if device IDs are not distinct
      const nextFacing: CameraFacingMode =
        state.activeFacingMode === 'environment' ? 'user' : 'environment';
      await startStream({ facingMode: nextFacing });
      return;
    }

    const currentIndex = state.availableCameras.findIndex(
      (c) => c.deviceId === state.activeDeviceId
    );
    const nextIndex = (currentIndex + 1) % state.availableCameras.length;
    const nextCamera = state.availableCameras[nextIndex];

    await startStream({
      deviceId: nextCamera.deviceId,
      facingMode: nextCamera.facingMode,
    });
  }, [state.availableCameras, state.activeDeviceId, state.activeFacingMode, startStream]);

  /**
   * High-fidelity frame capture using an offscreen canvas.
   */
  const captureFrame = useCallback(
    async (captureOptions: CaptureFrameOptions = {}): Promise<Blob | null> => {
      const video = videoRef.current;
      if (!video) return null;

      // Ensure video has actual frames
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 800);
          const onCanPlay = () => {
            clearTimeout(timer);
            video.removeEventListener('canplay', onCanPlay);
            resolve();
          };
          video.addEventListener('canplay', onCanPlay, { once: true });
        });
      }

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (!vW || !vH) return null;

      const maxWidth = captureOptions.maxWidth || vW;
      const maxHeight = captureOptions.maxHeight || vH;

      let drawW = vW;
      let drawH = vH;

      if (drawW > maxWidth || drawH > maxHeight) {
        const ratio = Math.min(maxWidth / drawW, maxHeight / drawH);
        drawW = Math.round(drawW * ratio);
        drawH = Math.round(drawH * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = drawW;
      canvas.height = drawH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, 0, 0, drawW, drawH);

      const mimeType = captureOptions.mimeType || captureOptions.format || 'image/jpeg';
      const quality = captureOptions.quality ?? 0.95;

      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), mimeType, quality);
      });
    },
    []
  );

  // Handle visibility changes (pause/stop when tab is hidden, resume when visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (state.isStreaming) {
          // Pause track to prevent battery drain
          streamRef.current?.getVideoTracks().forEach((track) => {
            track.enabled = false;
          });
        }
      } else {
        if (state.isStreaming) {
          streamRef.current?.getVideoTracks().forEach((track) => {
            track.enabled = true;
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [state.isStreaming]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      stopStream();
    };
  }, [stopStream]);

  return {
    videoRef,
    state,
    cameraState: state,
    startStream,
    stopStream,
    switchCamera,
    cycleCamera,
    refreshDevices,
    captureFrame,
  };
}
