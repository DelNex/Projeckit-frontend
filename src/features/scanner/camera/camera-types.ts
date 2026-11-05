/**
 * Project KIT — Mobile Camera & MediaStream Types
 */

export type CameraFacingMode = 'user' | 'environment';

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facingMode?: CameraFacingMode;
}

export type CameraPermissionState =
  | 'idle'
  | 'requesting'
  | 'streaming'
  | 'denied'
  | 'unavailable'
  | 'interrupted'
  | 'error';

export interface CameraState {
  isStreaming: boolean;
  permissionState: CameraPermissionState;
  activeDeviceId: string | null;
  activeFacingMode: CameraFacingMode;
  availableCameras: CameraDeviceInfo[];
  hasMultipleCameras: boolean;
  aspectRatio: number;
  videoWidth: number;
  videoHeight: number;
  error: string | null;
  statusText: string;
}

export interface UseCameraStreamOptions {
  preferredFacingMode?: CameraFacingMode;
  preferredDeviceId?: string;
  preferredWidth?: number;
  preferredHeight?: number;
  onFrame?: (video: HTMLVideoElement) => void;
  onError?: (err: Error) => void;
  onStreamStarted?: (stream: MediaStream) => void;
  onStreamStopped?: () => void;
}

export interface CaptureFrameOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: 'image/jpeg' | 'image/png';
  format?: 'image/jpeg' | 'image/png';
}
