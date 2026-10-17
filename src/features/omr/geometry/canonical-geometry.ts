/**
 * Project KIT — Canonical OMR Geometry Generator
 * Single source of truth for the physical assessment sheet geometry.
 *
 * Implements the E-ClassRoom standard single rectangular answer area
 * framed by exactly 4 solid black square corner markers (TL, TR, BL, BR).
 *
 * Layout rules:
 * - 2 columns for <= 50 items (column 1: 1..ceil(items/2), column 2: remainder)
 * - 3 columns for 51..90 items (column 1: 1..ceil(items/3), etc.)
 * - Dynamic row pitch and bubble radius >= 6.5 maintained
 * - Single source of truth: All bubbles and roll-number targets strictly derived
 */

import {
  AnswerChoiceBubble,
  AnswerItem,
  AssessmentOmrConfig,
  CanonicalOmrGeometry,
  OmrRegionGeometry,
  ReferenceMarker,
  RegionFiducials,
  RollNumberTarget,
} from './geometry-types';
import { validateCanonicalGeometry } from './geometry-validator';

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Creates four corner fiducial markers for a rectangular region.
 */
function createRegionMarkers(
  regionId: string,
  x: number,
  y: number,
  width: number,
  height: number,
  size = 14
): { fiducials: RegionFiducials; markersList: ReferenceMarker[] } {
  const half = size / 2;

  const tlCenter = { x: x + half, y: y + half };
  const trCenter = { x: x + width - half, y: y + half };
  const blCenter = { x: x + half, y: y + height - half };
  const brCenter = { x: x + width - half, y: y + height - half };

  const TL: ReferenceMarker = {
    id: `${regionId}.TL`,
    regionId,
    corner: 'TL',
    center: tlCenter,
    size,
    bounds: { x, y, width: size, height: size },
  };

  const TR: ReferenceMarker = {
    id: `${regionId}.TR`,
    regionId,
    corner: 'TR',
    center: trCenter,
    size,
    bounds: { x: x + width - size, y, width: size, height: size },
  };

  const BL: ReferenceMarker = {
    id: `${regionId}.BL`,
    regionId,
    corner: 'BL',
    center: blCenter,
    size,
    bounds: { x, y: y + height - size, width: size, height: size },
  };

  const BR: ReferenceMarker = {
    id: `${regionId}.BR`,
    regionId,
    corner: 'BR',
    center: brCenter,
    size,
    bounds: { x: x + width - size, y: y + height - size, width: size, height: size },
  };

  return {
    fiducials: { TL, TR, BL, BR },
    markersList: [TL, TR, BL, BR],
  };
}

/**
 * Computes normalized (u, v) coordinates relative to a region's 4 corner markers.
 * u ∈ [0, 1] horizontally (TL -> TR)
 * v ∈ [0, 1] vertically (TL -> BL)
 */
export function computeRelativePosition(
  x: number,
  y: number,
  fiducials: RegionFiducials
): { u: number; v: number } {
  const widthSpan = fiducials.TR.center.x - fiducials.TL.center.x;
  const heightSpan = fiducials.BL.center.y - fiducials.TL.center.y;

  const u = widthSpan !== 0 ? (x - fiducials.TL.center.x) / widthSpan : 0;
  const v = heightSpan !== 0 ? (y - fiducials.TL.center.y) / heightSpan : 0;

  return {
    u: parseFloat(u.toFixed(6)),
    v: parseFloat(v.toFixed(6)),
  };
}

/**
 * Generates the single authoritative canonical geometry for an assessment.
 */
export function generateCanonicalGeometry(rawConfig: AssessmentOmrConfig): CanonicalOmrGeometry {
  const choices = rawConfig.choices && rawConfig.choices.length > 0 ? rawConfig.choices : ['A', 'B', 'C', 'D'];
  const pageWidth = rawConfig.pageWidth || 681;
  const pageHeight = rawConfig.pageHeight || 880;

  const config: Required<AssessmentOmrConfig> = {
    assessmentId: rawConfig.assessmentId,
    title: rawConfig.title || 'Quarterly Assessment Examination',
    subject: rawConfig.subject || 'General Subject',
    section: rawConfig.section || 'General Section',
    schoolYear: rawConfig.schoolYear || '2025–2026',
    term: rawConfig.term || '1st Quarter',
    formCode: rawConfig.formCode || `KIT:${rawConfig.assessmentId.substring(0, 8)}`,
    itemCount: rawConfig.itemCount,
    classSize: rawConfig.classSize,
    choices,
    pageWidth,
    pageHeight,
  };

  const margins = { top: 25, right: 30, bottom: 25, left: 30 };
  const regions: OmrRegionGeometry[] = [];
  const allMarkers: ReferenceMarker[] = [];
  const rollNumberGrid: RollNumberTarget[] = [];
  const answerBlocks: AnswerItem[] = [];

  const markerSize = 14;

  // =========================================================================
  // 1. Column and Row Distribution
  // 2 columns for <= 50 items; 3 columns for 51..90 items
  // =========================================================================
  const cols = config.itemCount <= 50 ? 2 : 3;
  const rowsPerCol = Math.max(1, Math.ceil(config.itemCount / cols));

  const rowPitch = cols === 2 ? 18.0 : 16.5;
  const headerOffset = 42;
  const bottomPadding = 26;

  const answerAreaX = 40;
  const answerAreaWidth = 601; // x = 40 to 641
  const answerAreaY = 280;
  const answerAreaHeight = Math.round(headerOffset + (rowsPerCol - 1) * rowPitch + bottomPadding);

  // Exactly 4 solid black square markers framing the ONE rectangular answer area
  const answersMarkers = createRegionMarkers('ANSWERS', answerAreaX, answerAreaY, answerAreaWidth, answerAreaHeight, markerSize);
  allMarkers.push(...answersMarkers.markersList);

  // Column boundaries
  const colWidth = answerAreaWidth / cols;
  const bubbleRadius = 6.5;
  const choiceSpacing = choices.length > 4 ? (cols === 2 ? 22.0 : 19.5) : (cols === 2 ? 26.0 : 23.5);

  const blockAnswerItems: AnswerItem[] = [];

  for (let itemNum = 1; itemNum <= config.itemCount; itemNum++) {
    // 0-indexed column and row
    const colIdx = Math.floor((itemNum - 1) / rowsPerCol);
    const rowIdx = (itemNum - 1) % rowsPerCol;

    const colBaseX = answerAreaX + colIdx * colWidth;
    const cy = answerAreaY + headerOffset + rowIdx * rowPitch;

    // Label and choices start X within column
    const labelX = cols === 2 ? colBaseX + 62 : colBaseX + 30;
    const choicesStartX = cols === 2 ? colBaseX + 85 : colBaseX + 48;

    const choiceBubbles: AnswerChoiceBubble[] = [];
    choices.forEach((choice, cIdx) => {
      const cx = choicesStartX + cIdx * choiceSpacing;
      const relativePosition = computeRelativePosition(cx, cy, answersMarkers.fiducials);

      choiceBubbles.push({
        choice,
        relativePosition,
        canonicalCenter: { x: cx, y: cy },
        radius: bubbleRadius,
      });
    });

    const answerItem: AnswerItem = {
      itemNumber: itemNum,
      regionId: 'ANSWERS',
      label: `${itemNum}.`,
      labelPosition: { x: labelX, y: cy + 3 },
      choices: choiceBubbles,
    };

    blockAnswerItems.push(answerItem);
    answerBlocks.push(answerItem);
  }

  const answersRegion: OmrRegionGeometry = {
    id: 'ANSWERS',
    type: 'ANSWER_BLOCK',
    bounds: { x: answerAreaX, y: answerAreaY, width: answerAreaWidth, height: answerAreaHeight },
    markers: answersMarkers.fiducials,
    contentBounds: { x: answerAreaX + 16, y: answerAreaY + 16, width: answerAreaWidth - 32, height: answerAreaHeight - 32 },
    answerItems: blockAnswerItems,
    itemRange: { start: 1, end: config.itemCount },
  };
  regions.push(answersRegion);

  // =========================================================================
  // 2. Compact Roll-Number Grid in Header Zone (Blank Sheets, 1..classSize)
  // Outside the 4-marker frame, placed on the right of the learner info area
  // =========================================================================
  const rollStartX = 458;
  const rollStartY = 138;
  const rollColSpacing = 17.5;
  const rollRowSpacing = 8.5;
  const rollRadius = 4.0;

  for (let k = 1; k <= config.classSize; k++) {
    const row = Math.floor((k - 1) / 10);
    const col = k % 10;

    const cx = rollStartX + col * rollColSpacing;
    const cy = rollStartY + row * rollRowSpacing;

    const relativePosition = computeRelativePosition(cx, cy, answersMarkers.fiducials);

    const target: RollNumberTarget = {
      rollNumber: k,
      row,
      col,
      relativePosition,
      canonicalCenter: { x: cx, y: cy },
      radius: rollRadius,
    };

    rollNumberGrid.push(target);
  }

  // Build lookups
  const regionMap: Record<string, OmrRegionGeometry> = {};
  regions.forEach((r) => {
    regionMap[r.id] = r;
  });

  const markerMap: Record<string, ReferenceMarker> = {};
  allMarkers.forEach((m) => {
    markerMap[m.id] = m;
  });

  const geometry: CanonicalOmrGeometry = {
    templateId: `tpl-${config.assessmentId}-${config.itemCount}-${config.classSize}`,
    templateVersion: '2.0.0',
    geometryVersion: '2.0',
    assessmentId: config.assessmentId,
    config,
    page: {
      width: pageWidth,
      height: pageHeight,
      margins,
      unit: 'px',
    },
    regions,
    regionMap,
    markers: allMarkers,
    markerMap,
    rollNumberGrid,
    answerBlocks,
  };

  // Validate before returning
  const validation = validateCanonicalGeometry(geometry);
  if (!validation.valid) {
    throw new Error(
      `Canonical geometry validation failed:\n- ${validation.errors.join('\n- ')}`
    );
  }

  return geometry;
}
