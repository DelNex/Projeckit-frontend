/**
 * Project KIT — Canonical OMR Geometry Type Definitions
 * Single source of truth for physical coordinates, reference markers,
 * region boundaries, Roll Number targets, and answer bubbles.
 */

export interface AssessmentOmrConfig {
  assessmentId: string;
  title?: string;
  subject?: string;
  section?: string;
  schoolYear?: string;
  term?: string;
  formCode?: string;
  schoolName?: string;
  region?: string;
  division?: string;
  hasLogo?: boolean;
  sheetFormat?: 'HALF' | 'FULL';
  itemCount: number; // e.g. 10, 20, 50, 60, 63, 70, 90
  classSize: number; // e.g. 1..70 (e.g. 60, 67, 70)
  choices?: string[]; // default ['A', 'B', 'C', 'D']
  pageWidth?: number;
  pageHeight?: number;
}

export type MarkerCorner = 'TL' | 'TR' | 'BL' | 'BR';

export interface ReferenceMarker {
  id: string; // e.g. 'STUDENT_INFO.TL', 'ANSWERS_01_10.BR'
  regionId: string;
  corner: MarkerCorner;
  center: { x: number; y: number };
  size: number; // width and height of solid square (e.g. 12px, 14px, 16px)
  bounds: { x: number; y: number; width: number; height: number };
}

export interface RegionFiducials {
  TL: ReferenceMarker;
  TR: ReferenceMarker;
  BL: ReferenceMarker;
  BR: ReferenceMarker;
}

export interface RollNumberTarget {
  rollNumber: number; // 1..classSize
  row: number; // 0..6 (display rows 1..7)
  col: number; // 0..9 (display cols 0..9)
  relativePosition: { u: number; v: number }; // [0, 1] relative to region TL->BR markers
  canonicalCenter: { x: number; y: number };
  radius: number;
}

export interface AnswerChoiceBubble {
  choice: string; // 'A', 'B', 'C', etc.
  relativePosition: { u: number; v: number }; // [0, 1] relative to region TL->BR markers
  canonicalCenter: { x: number; y: number };
  radius: number;
}

export interface AnswerItem {
  itemNumber: number; // 1..itemCount
  regionId: string;
  label: string; // e.g. "1.", "63."
  labelPosition: { x: number; y: number };
  choices: AnswerChoiceBubble[];
}

export type OmrRegionType = 'STUDENT_INFO' | 'ROLL_NUMBER' | 'ANSWER_BLOCK';

export interface OmrRegionGeometry {
  id: string; // e.g. 'STUDENT_INFO', 'ROLL_NUMBER', 'ANSWERS'
  type: OmrRegionType;
  bounds: { x: number; y: number; width: number; height: number };
  markers: RegionFiducials;
  contentBounds: { x: number; y: number; width: number; height: number };
  rollNumberTargets?: RollNumberTarget[]; // Legacy ROLL_NUMBER
  answerItems?: AnswerItem[]; // ANSWER_BLOCK
  itemRange?: { start: number; end: number }; // e.g. { start: 1, end: 10 }
  metadata?: Record<string, unknown>;
}

export interface HeaderLayoutCoordinates {
  hasLogo: boolean;
  logoBounds?: { x: number; y: number; width: number; height: number };
  republicY: number;
  depedY: number;
  regionY?: number;
  divisionY?: number;
  schoolY: number;
}

export interface LearnerInfoLayoutCoordinates {
  row1Y: number; // NAME, DATE, SCORE
  nameLabelX: number;
  nameLineStartX: number;
  nameLineEndX: number;
  dateLabelX: number;
  dateLineStartX: number;
  dateLineEndX: number;
  scoreLabelX: number;
  scoreLineStartX: number;
  scoreLineEndX: number;

  row2Y: number; // LRN, YEAR/SECTION
  lrnLabelX: number;
  lrnLineStartX: number;
  lrnLineEndX: number;
  yearSectionLabelX: number;
  yearSectionLineStartX: number;
  yearSectionLineEndX: number;
}

export interface TitleBlockLayoutCoordinates {
  titleY: number;
  titleFontSize: number;
  subjectY: number;
  schoolYearY: number;
}

export interface BarcodeLayoutCoordinates {
  x: number;
  y: number;
  height: number;
  narrowBarWidth: number;
  wideBarRatio: number;
}

export interface SectionBarLayoutCoordinates {
  topLineY: number;
  titleY: number;
  instructionsY: number;
  formCodeY: number;
  bottomLineY: number;
  x1: number;
  x2: number;
}

export interface AnswerAreaLayoutCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  markerSize: number;
  cols: number;
  rowsPerCol: number;
  rowPitch: number;
  bubbleRadius: number;
  choiceSpacing: number;
  headerChoicesY: number;
  colWidth: number;
  columnDividers: number[];
  columns: Array<{
    colIdx: number;
    colBaseX: number;
    labelX: number;
    choicesStartX: number;
  }>;
}

export interface SheetLayoutCoordinates {
  sheetFormat: 'HALF' | 'FULL';
  centerX: number;
  header: HeaderLayoutCoordinates;
  learnerInfo: LearnerInfoLayoutCoordinates;
  titleBlock: TitleBlockLayoutCoordinates;
  barcode: BarcodeLayoutCoordinates;
  sectionBar: SectionBarLayoutCoordinates;
  answerArea: AnswerAreaLayoutCoordinates;
}

export interface CanonicalOmrGeometry {
  templateId: string;
  templateVersion: string;
  geometryVersion: string;
  assessmentId: string;
  sheetFormat: 'HALF' | 'FULL';
  layout: SheetLayoutCoordinates;
  config: Required<AssessmentOmrConfig>;
  page: {
    width: number;
    height: number;
    margins: { top: number; right: number; bottom: number; left: number };
    unit: 'px' | 'mm';
  };
  regions: OmrRegionGeometry[];
  regionMap: Record<string, OmrRegionGeometry>;
  markers: ReferenceMarker[];
  markerMap: Record<string, ReferenceMarker>;
  rollNumberGrid: RollNumberTarget[];
  answerBlocks: AnswerItem[];
}

export interface GeometryValidationMetrics {
  totalItems: number;
  totalRollTargets: number;
  totalRegions: number;
  totalMarkers: number;
  requiredHeight: number;
  availableHeight: number;
  requiredWidth: number;
  availableWidth: number;
  bottomGap: number;
  bottomGapPercent: number;
  rowPitch: number;
  bubbleRadius: number;
}

export interface GeometryValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: GeometryValidationMetrics;
}

