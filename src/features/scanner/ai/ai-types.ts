/**
 * Project KIT — Client-Side Local AI & Diagnostic Engine Types
 */

export interface DocumentQualityMetrics {
  brightness: number; // 0..255
  contrast: number; // 0..1
  sharpness: number; // Variance of Laplacian (high = crisp, low = blurry)
  skewAngle: number; // Estimated perspective tilt in degrees
  cornersDetected: number; // 0..4 corner registration markers
  shadowDetected: boolean; // Quadrant luminance disparity
  glareDetected: boolean; // Concentrated saturated high-luminance pixels
  isQualityAcceptable: boolean;
  blurDetected: boolean;
}

export type DiagnosticLevel = 'success' | 'info' | 'warning' | 'error';
export type DiagnosticCategory =
  | 'lighting'
  | 'alignment'
  | 'blur'
  | 'barcode'
  | 'bubbles'
  | 'system';

export interface AiDiagnostic {
  id: string;
  level: DiagnosticLevel;
  category: DiagnosticCategory;
  title: string;
  guidance: string;
  action?: string;
}

export type ClientAiRuntimeProvider =
  | 'browser-vision-heuristics'
  | 'onnx-web'
  | 'transformers-wasm';

export interface AiAdvisorState {
  provider: ClientAiRuntimeProvider;
  status: 'ready' | 'evaluating' | 'idle' | 'unavailable';
  diagnostics: AiDiagnostic[];
  quality: DocumentQualityMetrics | null;
  overallHealth: 'optimal' | 'acceptable' | 'action_required';
  summaryText: string;
}

