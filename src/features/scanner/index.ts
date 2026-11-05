/**
 * Project KIT — Scanner Feature Entry Point
 * Unified exports for camera streams, barcode decoding, client-side AI diagnostics,
 * and responsive OMR scanning UI components.
 */

// Camera Layer
export * from './camera/camera-types';
export * from './camera/camera-utils';
export * from './camera/useCameraStream';

// Barcode Layer
export * from './barcode/barcode-types';
export * from './barcode/barcode-engine';
export * from './barcode/useContinuousBarcode';

// Client-Side AI & Quality Layer
export * from './ai/ai-types';
export * from './ai/document-quality';
export * from './ai/client-ai-advisor';

// UI Components
export * from './components/CameraViewfinder';
export * from './components/OmrResultsReview';

