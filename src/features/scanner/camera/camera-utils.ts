/**
 * Project KIT — Mobile Camera Utilities & Diagnostics
 */

import { CameraDeviceInfo, CameraFacingMode, CameraPermissionState } from './camera-types';

/**
 * Safely stops all media tracks associated with a MediaStream.
 */
export function stopMediaStreamTracks(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  try {
    const tracks = stream.getTracks();
    for (const track of tracks) {
      try {
        track.stop();
      } catch (err) {
        console.warn('[Camera] Failed to stop track:', err);
      }
    }
  } catch (err) {
    console.warn('[Camera] Failed to get tracks:', err);
  }
}

/**
 * Enumerate available video input devices and categorize facing modes.
 */
export async function discoverVideoDevices(): Promise<CameraDeviceInfo[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');

    return videoInputs.map((device, index) => {
      const label = device.label || `Camera ${index + 1}`;
      const lower = label.toLowerCase();

      let facingMode: CameraFacingMode | undefined;
      if (lower.includes('back') || lower.includes('rear') || lower.includes('environment')) {
        facingMode = 'environment';
      } else if (lower.includes('front') || lower.includes('user') || lower.includes('selfie')) {
        facingMode = 'user';
      }

      return {
        deviceId: device.deviceId,
        label,
        facingMode,
      };
    });
  } catch (err) {
    console.warn('[Camera] Failed to enumerate devices:', err);
    return [];
  }
}

/**
 * Formats a MediaDevices DOMException or error into user-friendly DepEd guidance.
 */
export function formatCameraError(err: unknown): {
  message: string;
  permissionState: CameraPermissionState;
  type: 'permission_denied' | 'not_found' | 'not_readable' | 'overconstrained' | 'unknown';
} {
  const error = err as any;
  const name = error?.name || '';
  const message = error?.message || '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return {
      message: 'Camera access was blocked. Please tap the lock icon in your browser address bar and enable camera permissions.',
      permissionState: 'denied',
      type: 'permission_denied',
    };
  }

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return {
      message: 'No camera hardware found on this device. You can upload an image file of the answer sheet instead.',
      permissionState: 'unavailable',
      type: 'not_found',
    };
  }

  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return {
      message: 'Camera is currently in use by another application or browser tab. Please close other camera apps and retry.',
      permissionState: 'interrupted',
      type: 'not_readable',
    };
  }

  if (name === 'OverconstrainedError') {
    return {
      message: 'Camera does not support the requested resolution or lens. Reverting to standard camera settings.',
      permissionState: 'error',
      type: 'overconstrained',
    };
  }

  if (name === 'AbortError') {
    return {
      message: 'Camera initialization was interrupted.',
      permissionState: 'interrupted',
      type: 'unknown',
    };
  }

  return {
    message: message || 'Unable to access the camera. Please verify permissions or use file upload.',
    permissionState: 'error',
    type: 'unknown',
  };
}
