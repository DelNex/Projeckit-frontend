/**
 * Project KIT — Canonical OMR Geometry Generator
 * Single source of truth for the physical assessment sheet geometry.
 *
 * Implements deterministic dynamic layouts driven exclusively by the teacher's
 * assessment configuration (itemCount, classSize, choices).
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

  const margins = { top: 30, right: 30, bottom: 30, left: 30 };
  const regions: OmrRegionGeometry[] = [];
  const allMarkers: ReferenceMarker[] = [];
  const rollNumberGrid: RollNumberTarget[] = [];
  const answerBlocks: AnswerItem[] = [];

  const markerSize = 14;

  // =========================================================================
  // 1. STUDENT_INFO Region (Header & Metadata)
  // =========================================================================
  const studentInfoBounds = { x: 40, y: 35, width: 350, height: 160 };
  const studentInfoMarkers = createRegionMarkers('STUDENT_INFO', 40, 35, 350, 160, markerSize);
  allMarkers.push(...studentInfoMarkers.markersList);

  const studentInfoRegion: OmrRegionGeometry = {
    id: 'STUDENT_INFO',
    type: 'STUDENT_INFO',
    bounds: studentInfoBounds,
    markers: studentInfoMarkers.fiducials,
    contentBounds: { x: 58, y: 48, width: 314, height: 134 },
  };
  regions.push(studentInfoRegion);

  // =========================================================================
  // 2. ROLL_NUMBER Region (7 × 10 Student Grid)
  // =========================================================================
  const rollBounds = { x: 410, y: 35, width: 231, height: 160 };
  const rollMarkers = createRegionMarkers('ROLL_NUMBER', 410, 35, 231, 160, markerSize);
  allMarkers.push(...rollMarkers.markersList);

  // Physical grid layout:
  // Columns: 0, 1, 2, 3, 4, 5, 6, 7, 8, 9
  // Rows: 1, 2, 3, 4, 5, 6, 7
  // Grid origins inside region:
  const rollStartX = 444;
  const rollStartY = 72;
  const colSpacing = 17.5;
  const rowSpacing = 15.5;
  const rollRadius = 6.0;

  // Generate ONLY valid student targets for k = 1..classSize
  for (let k = 1; k <= config.classSize; k++) {
    // Exact mapping from Section 8:
    // row (0..6): Math.floor((k - 1) / 10)
    // col (0..9): k % 10
    const row = Math.floor((k - 1) / 10);
    const col = k % 10;

    const cx = rollStartX + col * colSpacing;
    const cy = rollStartY + row * rowSpacing;

    const relativePosition = computeRelativePosition(cx, cy, rollMarkers.fiducials);

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

  const rollRegion: OmrRegionGeometry = {
    id: 'ROLL_NUMBER',
    type: 'ROLL_NUMBER',
    bounds: rollBounds,
    markers: rollMarkers.fiducials,
    contentBounds: { x: 426, y: 48, width: 199, height: 134 },
    rollNumberTargets: rollNumberGrid,
  };
  regions.push(rollRegion);

  // =========================================================================
  // 3. Dynamic ANSWER_BLOCK Regions (10-item chunks, up to 90 items)
  // =========================================================================
  const blockSize = 10;
  const totalBlocks = Math.ceil(config.itemCount / blockSize);
  const blockWidth = 180;
  const blockHeight = 200;

  const columnXs = [40, 250, 460];
  const rowYs = [215, 425, 635];

  for (let b = 0; b < totalBlocks; b++) {
    const colIdx = Math.floor(b / 3);
    const rowIdx = b % 3;

    const blockX = columnXs[colIdx];
    const blockY = rowYs[rowIdx];

    const startItem = b * blockSize + 1;
    const endItem = Math.min((b + 1) * blockSize, config.itemCount);
    const rangeEndPadded = pad2((b + 1) * blockSize);
    const regionId = `ANSWERS_${pad2(startItem)}_${rangeEndPadded}`;

    const blockMarkers = createRegionMarkers(regionId, blockX, blockY, blockWidth, blockHeight, markerSize);
    allMarkers.push(...blockMarkers.markersList);

    const blockAnswerItems: AnswerItem[] = [];

    // Spacing within the block
    const itemStartY = blockY + 36;
    const itemRowSpacing = 16.0;
    const choiceSpacing = choices.length > 4 ? 22.0 : 26.0;
    const bubbleRadius = 6.5;

    for (let itemNum = startItem; itemNum <= endItem; itemNum++) {
      const inBlockIndex = itemNum - startItem;
      const cy = itemStartY + inBlockIndex * itemRowSpacing;
      const labelX = blockX + 32;

      const choiceBubbles: AnswerChoiceBubble[] = [];
      choices.forEach((choice, cIdx) => {
        const cx = blockX + 50 + cIdx * choiceSpacing;
        const relativePosition = computeRelativePosition(cx, cy, blockMarkers.fiducials);

        choiceBubbles.push({
          choice,
          relativePosition,
          canonicalCenter: { x: cx, y: cy },
          radius: bubbleRadius,
        });
      });

      const answerItem: AnswerItem = {
        itemNumber: itemNum,
        regionId,
        label: `${itemNum}.`,
        labelPosition: { x: labelX, y: cy + 3 },
        choices: choiceBubbles,
      };

      blockAnswerItems.push(answerItem);
      answerBlocks.push(answerItem);
    }

    const blockRegion: OmrRegionGeometry = {
      id: regionId,
      type: 'ANSWER_BLOCK',
      bounds: { x: blockX, y: blockY, width: blockWidth, height: blockHeight },
      markers: blockMarkers.fiducials,
      contentBounds: { x: blockX + 16, y: blockY + 16, width: blockWidth - 32, height: blockHeight - 32 },
      answerItems: blockAnswerItems,
      itemRange: { start: startItem, end: endItem },
    };

    regions.push(blockRegion);
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

