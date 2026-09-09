/**
 * Project KIT — OMR Scanning Domain Types & Contracts
 * Phase 6 Architecture Implementation
 */

export type OmrItemState = 'MARKED' | 'BLANK' | 'AMBIGUOUS' | 'MULTIPLE_MARK';

export interface ProcessedItemResult {
  itemNumber: number;
  selectedChoice: string | null; // "A" | "B" | "C" | "D" | null
  confidence: number; // 0.0 to 1.0
  state: OmrItemState;
  scores: Record<string, number>; // Darkness score per choice (e.g. { A: 0.82, B: 0.05, ... })
}

export type OmrScanStatus = 'PROCESSED' | 'VERIFICATION_REQUIRED' | 'REJECTED' | 'DUPLICATE';

export interface OmrScanResult {
  idempotencyKey: string;
  imageHash: string; // SHA-256 hash of image payload
  detectedForm: string; // e.g. "SINGLE" or template name
  detectedStudentLrn: string | null; // 12-digit Learner Reference Number (optional/legacy)
  detectedRollNumber: number | null; // 1..classSize Roll Number detected from 7x10 grid
  detectedAssessmentId: string | null;
  overallConfidence: number; // 0.0 to 1.0
  fiducialDetected: boolean;
  fiducialConfidence: number;
  items: ProcessedItemResult[];
  rawAnswers: Record<number, string | null>;
  normalizedAnswers: (string | null)[];
  hasAmbiguity: boolean;
  hasMultipleMarks: boolean;
  status: OmrScanStatus;
  errorCode?: string;
  failedRegion?: {
    regionId: string;
    detectedMarkerCount: number;
    expectedMarkerCount: number;
    markerConfidence: number;
    reason: string;
  };
  markedImageBase64?: string; // Optional marked debug/audit visualization
  storagePath?: string; // Supabase Storage path in 'omr-scans' bucket
  engineUsed: '@armghan3071/omrchecker' | 'kit-optical-native';
}

export interface OmrPreprocessResult {
  markersDetected: boolean;
  cornerCount: number;
  isLightingAcceptable: boolean;
  contrastRatio: number;
  skewAngle: number;
  dataUrl?: string;
}

export interface OmrFiducialPoint {
  x: number;
  y: number;
}

export interface OmrBubbleGridItem {
  itemNumber: number;
  bubbles: Record<string, { x: number; y: number; radius: number }>;
}

export interface LrnGridDigitBubble {
  digit: number; // 0..9
  x: number;
  y: number;
  radius: number;
}

export interface LrnGridColumn {
  columnIndex: number; // 0..11
  bubbles: LrnGridDigitBubble[];
}

/**
 * Normalized KIT OMR Template specification
 */
export interface KitOmrTemplate {
  id: string;
  name: string;
  targetItems: number;
  choices: string[]; // ['A', 'B', 'C', 'D']
  dimensions: {
    width: number;
    height: number;
  };
  fiducials: {
    topLeft: OmrFiducialPoint;
    topRight: OmrFiducialPoint;
    bottomLeft: OmrFiducialPoint;
    bottomRight: OmrFiducialPoint;
  };
  /** Per-item bubble grid with (x, y, radius) per choice — used by native engine */
  itemGrid: OmrBubbleGridItem[];
  /** 12-column LRN digit grid with (x, y, radius) per digit — used by native engine */
  lrnGrid: LrnGridColumn[];
  lrnColumns: number; // 12
  /** Authoritative canonical geometry representation */
  canonicalGeometry?: import('./geometry/geometry-types').CanonicalOmrGeometry;
  thresholds: {
    markMinFill: number; // default 0.35
    ambiguousDelta: number; // default 0.15
    highConfidenceMin: number; // default 0.85
  };
}

/**
 * Raw JSON template format required by @armghan3071/omrchecker
 */
export interface OmrCheckerFieldBlock {
  fieldType?: string;
  origin: [number, number];
  fieldLabels: string[];
  bubblesGap: number;
  labelsGap: number;
  direction?: 'horizontal' | 'vertical';
  bubbleDimensions?: [number, number];
  bubbleValues?: string[];
  emptyValue?: string;
}

export interface OmrCheckerJsonTemplate {
  pageDimensions: [number, number];
  bubbleDimensions: [number, number];
  emptyValue?: string;
  preProcessors: Array<{
    name: string;
    options?: Record<string, unknown>;
  }>;
  fieldBlocks: Record<string, OmrCheckerFieldBlock>;
  customLabels?: Record<string, string[]>;
  outputColumns?: string[];
}

export interface OmrProcessOptions {
  assessmentId?: string;
  studentId?: string;
  hintStudentLrn?: string;
  idempotencyKey?: string;
  includeMarkedImage?: boolean;
  forceEngine?: '@armghan3071/omrchecker' | 'kit-optical-native';
}

export interface OmrEngineAdapter {
  name: string;
  process(
    image: File | Blob | ArrayBuffer | Uint8Array | string,
    template: KitOmrTemplate,
    options?: OmrProcessOptions
  ): Promise<OmrScanResult>;
}

