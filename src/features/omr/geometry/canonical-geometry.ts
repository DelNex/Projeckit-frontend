/**
 * Project KIT — Canonical OMR Geometry Generator
 * Single source of truth for physical coordinates, reference markers,
 * region boundaries, and answer bubbles.
 *
 * Implements DepEd E-ClassRoom standard:
 * - HALF sheet (A5 portrait, 559 x 794) for <= 60 items
 *   (prints 2 sheets side-by-side on A4 landscape with dashed cut line)
 * - FULL sheet (A4 portrait, 794 x 1123) for 61..90 items
 * - 2 columns for 1..40 items; 3 columns for 41..90 items
 * - Running vertical cursor top to bottom (no empty gaps)
 * - Bottom margin <= 3% of sheet height (never leaves large empty bottom)
 * - Dynamic row pitch capped at 28; enlarged bubble radius (>= 7.0 half, >= 8.0 full)
 * - Single source of truth: SheetLayoutCoordinates consumed directly by SVG renderer
 */

import { getPhilippineSchoolYear } from '@/lib/academic-calendar';
import {
  AnswerChoiceBubble,
  AnswerItem,
  AssessmentOmrConfig,
  CanonicalOmrGeometry,
  OmrRegionGeometry,
  ReferenceMarker,
  RegionFiducials,
  RollNumberTarget,
  SheetLayoutCoordinates,
} from './geometry-types';
import { validateCanonicalGeometry } from './geometry-validator';

export function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Creates four corner fiducial markers for a rectangular region.
 */
export function createRegionMarkers(
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
 * Cleans title string, combining term and assessment title and removing duplicates.
 */
export function cleanTitleText(term?: string, title?: string): string {
  const cleanTerm = (term || 'Term 1').trim();
  const cleanTitle = (title || 'Summative Test').trim();

  let combined = `${cleanTerm} ${cleanTitle} ANSWER SHEET`.toUpperCase();
  combined = combined.replace(/\bQUARTER\s+QUARTERLY\b/gi, 'QUARTERLY');
  combined = combined.replace(/\bQUARTERLY\s+QUARTER\b/gi, 'QUARTERLY');
  combined = combined.replace(/\b(\w+)\s+\1\b/gi, '$1');
  return combined.replace(/\s+/g, ' ').trim();
}

/**
 * Automatically adjusts title font size to prevent overflow.
 */
export function computeTitleFontSize(title: string, isHalf: boolean): number {
  const len = title.length;
  if (isHalf) {
    if (len > 50) return 8.0;
    if (len > 35) return 9.5;
    return 11.0;
  } else {
    if (len > 50) return 10.0;
    if (len > 35) return 12.0;
    return 13.5;
  }
}

/**
 * Derives form code: "KIT:" + first 8 hex characters of assessment ID.
 */
export function formatFormCode(assessmentId: string, formCode?: string): string {
  if (formCode && formCode.trim()) return formCode.trim();
  const hex = assessmentId.replace(/[^0-9A-Fa-f]/g, '').slice(0, 8).toUpperCase();
  return `KIT:${hex || '00000000'}`;
}

/**
 * Generates the single authoritative canonical geometry for an assessment.
 */
export function generateCanonicalGeometry(rawConfig: AssessmentOmrConfig): CanonicalOmrGeometry {
  const choices = rawConfig.choices && rawConfig.choices.length > 0 ? rawConfig.choices : ['A', 'B', 'C', 'D'];
  const itemCount = rawConfig.itemCount;
  const classSize = rawConfig.classSize;

  // Initial format decision: HALF for <= 60 items, FULL for 61..90 items
  let sheetFormat: 'HALF' | 'FULL' = rawConfig.sheetFormat || (itemCount <= 60 ? 'HALF' : 'FULL');

  // Internal layout planner to support automatic fallback
  function computeLayoutMetrics(format: 'HALF' | 'FULL') {
    const isHalf = format === 'HALF';
    const pageWidth = rawConfig.pageWidth || (isHalf ? 559 : 794);
    const pageHeight = rawConfig.pageHeight || (isHalf ? 794 : 1123);

    // Margins ensuring bottom empty space is strictly <= 3% of sheet height
    // Half: 23px / 794px = 2.89% <= 3%. Full: 28px / 1123px = 2.49% <= 3%.
    const bottomMargin = isHalf ? 23 : 28;
    const answerAreaBottomY = pageHeight - bottomMargin;
    const markerSize = isHalf ? 14 : 16;

    const answerAreaX = isHalf ? 28 : 38;
    const answerAreaWidth = pageWidth - answerAreaX * 2;
    const centerX = pageWidth / 2;

    // 1 to 40 items: 2 columns; 41 to 60 (half) & 61 to 90 (full): 3 columns
    const cols = itemCount <= 40 ? 2 : 3;
    const rowsPerCol = Math.max(1, Math.ceil(itemCount / cols));

    // Running cursor (top-to-bottom)
    const hasLogo = Boolean(rawConfig.hasLogo);
    let cursorY = isHalf ? (hasLogo ? 12 : 20) : (hasLogo ? 18 : 28);

    let logoBounds: { x: number; y: number; width: number; height: number } | undefined;
    if (hasLogo) {
      const logoSize = isHalf ? 32 : 44;
      logoBounds = { x: centerX - logoSize / 2, y: cursorY, width: logoSize, height: logoSize };
      cursorY += logoSize + (isHalf ? 6 : 8);
    }

    const republicY = cursorY;
    cursorY += isHalf ? 11 : 14;

    const depedY = cursorY;
    cursorY += isHalf ? 12 : 15;

    let regionY: number | undefined;
    if (rawConfig.region && rawConfig.region.trim()) {
      regionY = cursorY;
      cursorY += isHalf ? 11 : 14;
    }

    let divisionY: number | undefined;
    if (rawConfig.division && rawConfig.division.trim()) {
      divisionY = cursorY;
      cursorY += isHalf ? 11 : 14;
    }

    const schoolY = cursorY;
    cursorY += isHalf ? 14 : 18;

    // Learner Info rows
    cursorY += isHalf ? 6 : 10;
    const row1Y = cursorY;
    cursorY += isHalf ? 17 : 22;
    const row2Y = cursorY;
    cursorY += isHalf ? 17 : 22;

    // Title Block
    const titleText = cleanTitleText(rawConfig.term, rawConfig.title);
    const titleFontSize = computeTitleFontSize(titleText, isHalf);

    cursorY += isHalf ? 6 : 10;
    const titleY = cursorY;
    cursorY += isHalf ? 13 : 17;
    const subjectY = cursorY;
    cursorY += isHalf ? 12 : 16;
    const schoolYearY = cursorY;
    cursorY += isHalf ? 13 : 17;

    // Section Bar
    cursorY += isHalf ? 6 : 9;
    const sectionTopLineY = cursorY;
    cursorY += isHalf ? 11 : 13;
    const sectionTitleY = cursorY;
    const instructionsY = cursorY + (isHalf ? 10 : 12);
    const formCodeY = sectionTitleY;
    const sectionBottomLineY = instructionsY + (isHalf ? 6 : 8);
    cursorY = sectionBottomLineY;

    // Answer area spacing
    const minTopGap = 8;
    const headerOffset = isHalf ? 26 : 30;
    const bottomPadding = isHalf ? 16 : 20;

    const maxAnswerAreaHeight = answerAreaBottomY - (cursorY + minTopGap);
    const rawPitch = rowsPerCol > 1
      ? (maxAnswerAreaHeight - headerOffset - bottomPadding) / (rowsPerCol - 1)
      : 28;

    return {
      isHalf,
      pageWidth,
      pageHeight,
      bottomMargin,
      answerAreaBottomY,
      markerSize,
      answerAreaX,
      answerAreaWidth,
      centerX,
      cols,
      rowsPerCol,
      hasLogo,
      logoBounds,
      republicY,
      depedY,
      regionY,
      divisionY,
      schoolY,
      row1Y,
      row2Y,
      titleText,
      titleFontSize,
      titleY,
      subjectY,
      schoolYearY,
      sectionTopLineY,
      sectionTitleY,
      instructionsY,
      formCodeY,
      sectionBottomLineY,
      cursorY,
      minTopGap,
      headerOffset,
      bottomPadding,
      rawPitch,
    };
  }

  // Scanner Safety Fallback Check:
  // If HALF sheet cannot meet row pitch >= 19.0, automatically switch to FULL sheet
  if (sheetFormat === 'HALF') {
    const trial = computeLayoutMetrics('HALF');
    if (trial.rawPitch < 19.0) {
      sheetFormat = 'FULL';
    }
  }

  const m = computeLayoutMetrics(sheetFormat);
  const {
    isHalf,
    pageWidth,
    pageHeight,
    bottomMargin,
    answerAreaBottomY,
    markerSize,
    answerAreaX,
    answerAreaWidth,
    centerX,
    cols,
    rowsPerCol,
    hasLogo,
    logoBounds,
    republicY,
    depedY,
    regionY,
    divisionY,
    schoolY,
    titleText,
    titleFontSize,
    minTopGap,
    headerOffset,
    bottomPadding,
    rawPitch,
  } = m;

  let {
    row1Y,
    row2Y,
    titleY,
    subjectY,
    schoolYearY,
    sectionTopLineY,
    sectionTitleY,
    instructionsY,
    formCodeY,
    sectionBottomLineY,
    cursorY,
  } = m;

  // Cap row pitch at 28 units; scale bubble radius up to 8.5 (half) or 9.5 (full)
  const rowPitch = Math.min(28, rawPitch);
  const bubbleRadius = isHalf
    ? (rowPitch >= 27.5 ? 8.5 : rowPitch >= 25 ? 7.8 : 7.2)
    : (rowPitch >= 27.5 ? 9.5 : rowPitch >= 25 ? 8.8 : 8.2);

  // Compute final answer area bounds anchored to bottom margin
  const answerAreaHeight = Math.round(headerOffset + (rowsPerCol - 1) * rowPitch + bottomPadding);
  const answerAreaY = answerAreaBottomY - answerAreaHeight;

  // Distribute leftover vertical space gracefully across header sections
  const leftoverHeight = answerAreaY - (cursorY + minTopGap);
  if (leftoverHeight > 0) {
    const shiftStep = leftoverHeight / 4;
    row1Y += shiftStep;
    row2Y += shiftStep;
    titleY += shiftStep * 2;
    subjectY += shiftStep * 2;
    schoolYearY += shiftStep * 2;
    sectionTopLineY += shiftStep * 3;
    sectionTitleY += shiftStep * 3;
    instructionsY += shiftStep * 3;
    formCodeY += shiftStep * 3;
    sectionBottomLineY += shiftStep * 3;
  }

  // Exactly 4 solid square corner fiducials framing the answer area
  const answersMarkers = createRegionMarkers(
    'ANSWERS',
    answerAreaX,
    answerAreaY,
    answerAreaWidth,
    answerAreaHeight,
    markerSize
  );

  // Columns layout
  const colWidth = answerAreaWidth / cols;
  const columnDividers: number[] = [];
  for (let c = 1; c < cols; c++) {
    columnDividers.push(parseFloat((answerAreaX + c * colWidth).toFixed(2)));
  }

  const choiceSpacing = choices.length > 4
    ? (cols === 2 ? (isHalf ? 20.0 : 22.0) : (isHalf ? 17.5 : 20.0))
    : (cols === 2 ? (isHalf ? 24.0 : 26.0) : (isHalf ? 20.0 : 23.5));

  const columnsMeta: Array<{
    colIdx: number;
    colBaseX: number;
    labelX: number;
    choicesStartX: number;
  }> = [];

  for (let c = 0; c < cols; c++) {
    const colBaseX = answerAreaX + c * colWidth;
    let labelX: number;
    let choicesStartX: number;

    if (cols === 2) {
      labelX = colBaseX + 62;
      choicesStartX = colBaseX + 85;
    } else {
      labelX = isHalf ? colBaseX + 28 : colBaseX + 45;
      choicesStartX = isHalf ? colBaseX + 46 : colBaseX + 68;
    }

    columnsMeta.push({
      colIdx: c,
      colBaseX,
      labelX,
      choicesStartX,
    });
  }

  const headerChoicesY = Math.round(answerAreaY + (isHalf ? 14 : 16));

  // Build answer items
  const blockAnswerItems: AnswerItem[] = [];
  const answerBlocks: AnswerItem[] = [];

  for (let itemNum = 1; itemNum <= itemCount; itemNum++) {
    // Items run down each column first
    const colIdx = Math.floor((itemNum - 1) / rowsPerCol);
    const rowIdx = (itemNum - 1) % rowsPerCol;

    const colMeta = columnsMeta[colIdx];
    const cy = Math.round(answerAreaY + headerOffset + rowIdx * rowPitch);

    const choiceBubbles: AnswerChoiceBubble[] = [];
    choices.forEach((choice, cIdx) => {
      const cx = Math.round(colMeta.choicesStartX + cIdx * choiceSpacing);
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
      labelPosition: { x: colMeta.labelX, y: cy + 3 },
      choices: choiceBubbles,
    };

    blockAnswerItems.push(answerItem);
    answerBlocks.push(answerItem);
  }

  const regions: OmrRegionGeometry[] = [
    {
      id: 'ANSWERS',
      type: 'ANSWER_BLOCK',
      bounds: { x: answerAreaX, y: answerAreaY, width: answerAreaWidth, height: answerAreaHeight },
      markers: answersMarkers.fiducials,
      contentBounds: {
        x: answerAreaX + markerSize,
        y: answerAreaY + markerSize,
        width: answerAreaWidth - markerSize * 2,
        height: answerAreaHeight - markerSize * 2,
      },
      answerItems: blockAnswerItems,
      itemRange: { start: 1, end: itemCount },
    },
  ];

  const rollNumberGrid: RollNumberTarget[] = [];
  // Backward compatibility: generate legacy roll number targets only when explicitly requested
  if ((rawConfig as any).geometryVersion === '2.0' || (rawConfig as any).includeRollNumberGrid === true) {
    const rollStartX = isHalf ? 360 : 540;
    const rollStartY = row1Y - 4;
    const rollColSpacing = isHalf ? 14 : 17.5;
    const rollRowSpacing = isHalf ? 7.5 : 8.5;
    const rollRadius = isHalf ? 3.5 : 4.0;

    for (let k = 1; k <= classSize; k++) {
      const row = Math.floor((k - 1) / 10);
      const col = k % 10;
      const cx = rollStartX + col * rollColSpacing;
      const cy = rollStartY + row * rollRowSpacing;
      const relativePosition = computeRelativePosition(cx, cy, answersMarkers.fiducials);

      rollNumberGrid.push({
        rollNumber: k,
        row,
        col,
        relativePosition,
        canonicalCenter: { x: cx, y: cy },
        radius: rollRadius,
      });
    }
  }

  // Learner info lines
  const nameLabelX = answerAreaX;
  const nameLineStartX = nameLabelX + 34;
  const nameLineEndX = isHalf ? 225 : 320;
  const dateLabelX = isHalf ? 235 : 335;
  const dateLineStartX = dateLabelX + 32;
  const dateLineEndX = isHalf ? 355 : 510;
  const scoreLabelX = isHalf ? 385 : 550;
  const scoreLineStartX = scoreLabelX + 38;
  const scoreLineEndX = isHalf ? 485 : 690;

  const lrnLabelX = answerAreaX;
  const lrnLineStartX = lrnLabelX + 26;
  const lrnLineEndX = isHalf ? 200 : 290;
  const yearSectionLabelX = isHalf ? 210 : 305;
  const yearSectionLineStartX = yearSectionLabelX + 75;
  const yearSectionLineEndX = isHalf ? 485 : 690;

  // Barcode placed strictly in header to the right of the title block (never overlaps learner info or title text)
  const barcode = {
    x: isHalf ? answerAreaX + answerAreaWidth - 135 : answerAreaX + answerAreaWidth - 165,
    y: Math.round(subjectY - (isHalf ? 4 : 6)),
    height: isHalf ? 26 : 32,
    narrowBarWidth: isHalf ? 0.62 : 0.78,
    wideBarRatio: 2.2,
  };

  const layout: SheetLayoutCoordinates = {
    sheetFormat,
    centerX,
    header: {
      hasLogo,
      logoBounds,
      republicY,
      depedY,
      regionY,
      divisionY,
      schoolY,
    },
    learnerInfo: {
      row1Y,
      nameLabelX,
      nameLineStartX,
      nameLineEndX,
      dateLabelX,
      dateLineStartX,
      dateLineEndX,
      scoreLabelX,
      scoreLineStartX,
      scoreLineEndX,
      row2Y,
      lrnLabelX,
      lrnLineStartX,
      lrnLineEndX,
      yearSectionLabelX,
      yearSectionLineStartX,
      yearSectionLineEndX,
    },
    titleBlock: {
      titleY,
      titleFontSize,
      subjectY,
      schoolYearY,
    },
    barcode,
    sectionBar: {
      topLineY: sectionTopLineY,
      titleY: sectionTitleY,
      instructionsY,
      formCodeY,
      bottomLineY: sectionBottomLineY,
      x1: answerAreaX,
      x2: answerAreaX + answerAreaWidth,
    },
    answerArea: {
      x: answerAreaX,
      y: answerAreaY,
      width: answerAreaWidth,
      height: answerAreaHeight,
      markerSize,
      cols,
      rowsPerCol,
      rowPitch,
      bubbleRadius,
      choiceSpacing,
      headerChoicesY,
      colWidth,
      columnDividers,
      columns: columnsMeta,
    },
  };

  const regionMap: Record<string, OmrRegionGeometry> = {
    ANSWERS: regions[0],
  };

  const markerMap: Record<string, ReferenceMarker> = {};
  answersMarkers.markersList.forEach((m) => {
    markerMap[m.id] = m;
  });

  const config: Required<AssessmentOmrConfig> = {
    assessmentId: rawConfig.assessmentId,
    title: rawConfig.title || 'Summative Assessment Examination',
    subject: rawConfig.subject || '',
    section: rawConfig.section || '',
    schoolYear: rawConfig.schoolYear || getPhilippineSchoolYear(),
    term: rawConfig.term || 'Term 1',
    formCode: formatFormCode(rawConfig.assessmentId, rawConfig.formCode),
    schoolName: rawConfig.schoolName || '',
    region: rawConfig.region || '',
    division: rawConfig.division || '',
    hasLogo: Boolean(rawConfig.hasLogo),
    sheetFormat,
    itemCount,
    classSize,
    choices,
    pageWidth,
    pageHeight,
  };

  const geometry: CanonicalOmrGeometry = {
    templateId: `tpl-${config.assessmentId}-${itemCount}-${sheetFormat.toLowerCase()}`,
    templateVersion: '3.0.0',
    geometryVersion: '3.0',
    assessmentId: config.assessmentId,
    sheetFormat,
    layout,
    config,
    page: {
      width: pageWidth,
      height: pageHeight,
      margins: { top: 14, right: isHalf ? 28 : 38, bottom: bottomMargin, left: isHalf ? 28 : 38 },
      unit: 'px',
    },
    regions,
    regionMap,
    markers: answersMarkers.markersList,
    markerMap,
    rollNumberGrid,
    answerBlocks,
  };

  const validation = validateCanonicalGeometry(geometry);
  if (!validation.valid) {
    throw new Error(
      `Canonical geometry validation failed:\n- ${validation.errors.join('\n- ')}`
    );
  }

  return geometry;
}
