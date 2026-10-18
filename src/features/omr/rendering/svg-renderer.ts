/**
 * Project KIT — E-ClassRoom Master & Personalized Answer Sheet Vector SVG Renderer
 * Renders high-precision, DepEd-compliant printable vector SVG answer sheets
 * directly from CanonicalOmrGeometry.
 *
 * CRITICAL INVARIANT:
 * Contains zero independent coordinate constants. Every marker, bubble, label, line,
 * header position, and section boundary is rendered strictly from geometry.layout.
 *
 * REFERENCE LAYOUT:
 * 1. Centered Header: optional school logo/seal, Republic of the Philippines,
 *    Department of Education, Region, Division, School name in bold.
 * 2. Learner Info: Row 1: NAME, DATE, SCORE; Row 2: LRN, YEAR/SECTION.
 * 3. Title Block: <TERM NAME> <ASSESSMENT TITLE> ANSWER SHEET (bold uppercase), subject, S.Y.
 * 4. Section Bar: MULTIPLE CHOICE (<N> points), instruction line, formCode on right.
 * 5. Answer Area: ONE rectangular area framed by exactly 4 solid black square markers at corners.
 *    No outer black rectangle border, no dashed region boxes, no extra markers inside.
 * 6. Learner ID: Code 39 barcode (personalized) in header zone; roll-number bubbles removed.
 */

import { CanonicalOmrGeometry } from '../geometry/geometry-types';
import { cleanTitleText } from '../geometry/canonical-geometry';
import { generateCode39Svg } from './barcode';

export function escapeXml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatDepEdLearnerName(name: string): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.includes(',')) return trimmed.toUpperCase();
  const parts = trimmed.split(/\s+/);
  if (parts.length <= 1) return trimmed.toUpperCase();
  const last = parts[parts.length - 1];
  const firstAndMiddle = parts.slice(0, parts.length - 1).join(' ');
  return `${last.toUpperCase()}, ${firstAndMiddle.toUpperCase()}`;
}

export interface VisibleHeaderFields {
  learnerName?: boolean;
  lrn?: boolean;
  section?: boolean;
  examDate?: boolean;
  subject?: boolean;
  term?: boolean;
  assessmentTitle?: boolean;
  teacherName?: boolean;
  schoolName?: boolean;
}

export interface PersonalizedSheetData {
  learnerName?: string;
  lrn?: string;
  section?: string;
  examDate?: string;
  subject?: string;
  term?: string;
  assessmentTitle?: string;
  teacherName?: string;
  schoolName?: string;
  region?: string;
  division?: string;
  logoData?: string;
  studentId?: string; // Random internal learner UUID (never the LRN)
  rollNumber?: number; // 1..classSize (legacy)
  totalPoints?: number;
  visibleFields?: VisibleHeaderFields;
}

export function renderOmrMasterSvg(
  geometry: CanonicalOmrGeometry,
  personalized?: PersonalizedSheetData
): string {
  const { page, regions, config, layout } = geometry;
  const vf = personalized?.visibleFields || {};

  const showSchool = vf.schoolName !== false;
  const showLearner = vf.learnerName !== false;
  const showLrn = vf.lrn !== false;
  const showDate = vf.examDate !== false;
  const showSec = vf.section !== false;
  const showSubj = vf.subject !== false;
  const showTerm = vf.term !== false;
  const showTitle = vf.assessmentTitle !== false;

  const schoolDisplay = showSchool && (personalized?.schoolName || config.schoolName)
    ? personalized?.schoolName || config.schoolName
    : '';

  const titleDisplay = showTitle && (personalized?.assessmentTitle || config.title)
    ? personalized?.assessmentTitle || config.title
    : config.title;

  const subjDisplay = showSubj && (personalized?.subject || config.subject)
    ? personalized?.subject || config.subject
    : config.subject;

  const secDisplay = showSec && (personalized?.section || config.section)
    ? personalized?.section || config.section
    : config.section;

  const termDisplay = showTerm && (personalized?.term || config.term)
    ? personalized?.term || config.term
    : config.term;

  const examDateDisplay = showDate && personalized?.examDate
    ? personalized.examDate
    : '';

  const lrnDisplay = showLrn && personalized?.lrn ? personalized.lrn : '';
  const learnerNameDisplay = showLearner && personalized?.learnerName
    ? formatDepEdLearnerName(personalized.learnerName)
    : '';

  const isPersonalized = Boolean(personalized?.studentId || personalized?.learnerName);
  const totalPoints = personalized?.totalPoints || config.itemCount;

  let svgElements = '';

  // =========================================================================
  // 1. HEADER (DepEd Official Centered Header)
  // All coordinates derived from geometry.layout.header
  // =========================================================================
  svgElements += `  <!-- 1. Header (DepEd Official Header) -->\n`;
  if (personalized?.logoData && layout.header.logoBounds) {
    const lb = layout.header.logoBounds;
    svgElements += `  <image href="${escapeXml(personalized.logoData)}" x="${lb.x}" y="${lb.y}" width="${lb.width}" height="${lb.height}" preserveAspectRatio="xMidYMid meet"/>\n`;
  }

  svgElements += `  <text x="${layout.centerX}" y="${layout.header.republicY}" font-family="sans-serif" font-size="8" font-weight="500" fill="#4B5563" text-anchor="middle">Republic of the Philippines</text>\n`;
  svgElements += `  <text x="${layout.centerX}" y="${layout.header.depedY}" font-family="sans-serif" font-size="9" font-weight="bold" fill="#111827" text-anchor="middle">Department of Education</text>\n`;

  const regionVal = personalized?.region || config.region;
  if (regionVal && regionVal.trim() && layout.header.regionY != null) {
    svgElements += `  <text x="${layout.centerX}" y="${layout.header.regionY}" font-family="sans-serif" font-size="8" fill="#4B5563" text-anchor="middle">${escapeXml(regionVal.trim())}</text>\n`;
  }

  const divisionVal = personalized?.division || config.division;
  if (divisionVal && divisionVal.trim() && layout.header.divisionY != null) {
    svgElements += `  <text x="${layout.centerX}" y="${layout.header.divisionY}" font-family="sans-serif" font-size="8" fill="#4B5563" text-anchor="middle">${escapeXml(divisionVal.trim())}</text>\n`;
  }

  if (schoolDisplay && schoolDisplay.trim()) {
    svgElements += `  <text x="${layout.centerX}" y="${layout.header.schoolY}" font-family="sans-serif" font-size="10" font-weight="900" fill="#111827" text-anchor="middle">${escapeXml(schoolDisplay.toUpperCase())}</text>\n`;
  }

  // =========================================================================
  // 2. LEARNER INFO & BARCODE IDENTIFICATION
  // All coordinates derived from geometry.layout.learnerInfo & layout.barcode
  // =========================================================================
  svgElements += `  <!-- 2. Learner Information & Identification -->\n`;
  const li = layout.learnerInfo;

  // Row 1: NAME, DATE, SCORE
  svgElements += `  <text x="${li.nameLabelX}" y="${li.row1Y}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#111827">NAME:</text>\n`;
  svgElements += `  <line x1="${li.nameLineStartX}" y1="${li.row1Y + 3}" x2="${li.nameLineEndX}" y2="${li.row1Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  if (learnerNameDisplay) {
    const nameFontSize = learnerNameDisplay.length > 32 ? 6.5 : learnerNameDisplay.length > 22 ? 7.2 : 8;
    svgElements += `  <text x="${li.nameLineStartX + 2}" y="${li.row1Y}" font-family="sans-serif" font-size="${nameFontSize}" font-weight="bold" fill="#111827">${escapeXml(learnerNameDisplay)}</text>\n`;
  }

  svgElements += `  <text x="${li.dateLabelX}" y="${li.row1Y}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#111827">DATE:</text>\n`;
  svgElements += `  <line x1="${li.dateLineStartX}" y1="${li.row1Y + 3}" x2="${li.dateLineEndX}" y2="${li.row1Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  if (examDateDisplay) {
    svgElements += `  <text x="${li.dateLineStartX + 2}" y="${li.row1Y}" font-family="sans-serif" font-size="8" fill="#334155">${escapeXml(examDateDisplay)}</text>\n`;
  }

  svgElements += `  <text x="${li.scoreLabelX}" y="${li.row1Y}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#111827">SCORE:</text>\n`;
  svgElements += `  <line x1="${li.scoreLineStartX}" y1="${li.row1Y + 3}" x2="${li.scoreLineEndX}" y2="${li.row1Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;

  // Row 2: LRN, YEAR/SECTION
  svgElements += `  <text x="${li.lrnLabelX}" y="${li.row2Y}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#111827">LRN:</text>\n`;
  svgElements += `  <line x1="${li.lrnLineStartX}" y1="${li.row2Y + 3}" x2="${li.lrnLineEndX}" y2="${li.row2Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  if (lrnDisplay) {
    svgElements += `  <text x="${li.lrnLineStartX + 2}" y="${li.row2Y}" font-family="monospace" font-size="8" font-weight="bold" fill="#334155">${escapeXml(lrnDisplay)}</text>\n`;
  }

  svgElements += `  <text x="${li.yearSectionLabelX}" y="${li.row2Y}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#111827">YEAR/SECTION:</text>\n`;
  svgElements += `  <line x1="${li.yearSectionLineStartX}" y1="${li.row2Y + 3}" x2="${li.yearSectionLineEndX}" y2="${li.row2Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  if (secDisplay) {
    svgElements += `  <text x="${li.yearSectionLineStartX + 2}" y="${li.row2Y}" font-family="sans-serif" font-size="8" fill="#334155">${escapeXml(secDisplay)}</text>\n`;
  }

  // Learner Identification: Code 39 Barcode for Personalized Sheets
  if (isPersonalized && personalized?.studentId) {
    const cleanA = geometry.assessmentId.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
    const cleanS = personalized.studentId.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
    const barcodeCode = `K${cleanA}-${cleanS}`;
    const barcodeSvg = generateCode39Svg(barcodeCode, {
      x: layout.barcode.x,
      y: layout.barcode.y,
      height: layout.barcode.height,
      narrowBarWidth: layout.barcode.narrowBarWidth,
      wideBarRatio: layout.barcode.wideBarRatio,
      showText: true,
    });
    svgElements += barcodeSvg;
  } else if (geometry.rollNumberGrid && geometry.rollNumberGrid.length > 0) {
    // Legacy support for older template formats that included roll bubbles
    svgElements += `  <!-- Legacy Roll Grid -->\n`;
    for (const target of geometry.rollNumberGrid) {
      const isPreShaded = personalized?.rollNumber != null && target.rollNumber === personalized.rollNumber;
      const bubbleFill = isPreShaded ? '#000000' : '#FFFFFF';
      const textFill = isPreShaded ? '#FFFFFF' : '#374151';
      svgElements += `  <circle cx="${target.canonicalCenter.x}" cy="${target.canonicalCenter.y}" r="${target.radius}" fill="${bubbleFill}" stroke="#000000" stroke-width="0.8"/>\n`;
      svgElements += `  <text x="${target.canonicalCenter.x}" y="${target.canonicalCenter.y + 2}" font-family="sans-serif" font-size="5" font-weight="bold" text-anchor="middle" fill="${textFill}">${target.col}</text>\n`;
    }
  }

  // =========================================================================
  // 3. TITLE BLOCK (Centered, Bold, Uppercase, Auto-Shrink Font)
  // All coordinates derived from geometry.layout.titleBlock
  // =========================================================================
  const fullTitle = cleanTitleText(termDisplay, titleDisplay);
  const tb = layout.titleBlock;

  svgElements += `  <!-- 3. Title Block -->\n`;
  svgElements += `  <text x="${layout.centerX}" y="${tb.titleY}" font-family="sans-serif" font-size="${tb.titleFontSize}" font-weight="900" fill="#111827" text-anchor="middle">${escapeXml(fullTitle)}</text>\n`;
  if (subjDisplay && subjDisplay.trim()) {
    svgElements += `  <text x="${layout.centerX}" y="${tb.subjectY}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#374151" text-anchor="middle">${escapeXml(subjDisplay.toUpperCase())}</text>\n`;
  }
  svgElements += `  <text x="${layout.centerX}" y="${tb.schoolYearY}" font-family="sans-serif" font-size="8" fill="#4B5563" text-anchor="middle">S.Y. ${escapeXml(config.schoolYear)}</text>\n`;

  // =========================================================================
  // 4. SECTION BAR
  // All coordinates derived from geometry.layout.sectionBar
  // =========================================================================
  const sb = layout.sectionBar;
  svgElements += `  <!-- 4. Section Bar -->\n`;
  svgElements += `  <line x1="${sb.x1}" y1="${sb.topLineY}" x2="${sb.x2}" y2="${sb.topLineY}" stroke="#000000" stroke-width="1"/>\n`;
  svgElements += `  <text x="${sb.x1 + 2}" y="${sb.titleY}" font-family="sans-serif" font-size="8" font-weight="900" fill="#111827">MULTIPLE CHOICE (${totalPoints} POINTS)</text>\n`;
  svgElements += `  <text x="${sb.x1 + 2}" y="${sb.instructionsY}" font-family="sans-serif" font-size="7" font-style="italic" fill="#4B5563">Instructions: Shade the circle for the correct answer on the answer sheet.</text>\n`;
  svgElements += `  <text x="${sb.x2}" y="${sb.formCodeY}" font-family="monospace" font-size="7.5" font-weight="bold" text-anchor="end" fill="#6B7280">${escapeXml(config.formCode)}</text>\n`;
  svgElements += `  <line x1="${sb.x1}" y1="${sb.bottomLineY}" x2="${sb.x2}" y2="${sb.bottomLineY}" stroke="#000000" stroke-width="0.75"/>\n`;

  // =========================================================================
  // 5. ANSWER AREA (Framed strictly by exactly 4 solid black square markers)
  // No outer black rectangle border
  // =========================================================================
  const answersRegion = regions.find((r) => r.id === 'ANSWERS') || regions[0];
  if (answersRegion) {
    const { markers } = answersRegion;
    const aa = layout.answerArea;

    svgElements += `  <!-- 5. Answer Area (Framed by exactly 4 solid square markers) -->\n`;

    // 4 Corner Solid Black Square Reference Markers
    const corners = ['TL', 'TR', 'BL', 'BR'] as const;
    for (const corner of corners) {
      const m = markers[corner];
      if (m) {
        svgElements += `  <rect id="${m.id}" x="${m.bounds.x}" y="${m.bounds.y}" width="${m.bounds.width}" height="${m.bounds.height}" fill="#000000"/>\n`;
      }
    }

    // Column dividers
    for (const divX of aa.columnDividers) {
      svgElements += `  <line x1="${divX}" y1="${answersRegion.bounds.y}" x2="${divX}" y2="${answersRegion.bounds.y + answersRegion.bounds.height}" stroke="#E5E7EB" stroke-width="1"/>\n`;
    }

    // Column Choice Letter Headers (A, B, C, D)
    const choices = config.choices || ['A', 'B', 'C', 'D'];
    for (const col of aa.columns) {
      choices.forEach((choice, cIdx) => {
        const cx = Math.round(col.choicesStartX + cIdx * aa.choiceSpacing);
        svgElements += `  <text x="${cx}" y="${aa.headerChoicesY}" font-family="sans-serif" font-size="7" font-weight="900" text-anchor="middle" fill="#6B7280">${choice}</text>\n`;
      });
    }

    // Answer Items and Bubbles
    if (answersRegion.answerItems) {
      for (const item of answersRegion.answerItems) {
        svgElements += `  <text x="${item.labelPosition.x}" y="${item.labelPosition.y}" font-family="sans-serif" font-size="7.5" font-weight="bold" text-anchor="end" fill="#111827">${item.label}</text>\n`;
        for (const choice of item.choices) {
          svgElements += `  <circle cx="${choice.canonicalCenter.x}" cy="${choice.canonicalCenter.y}" r="${choice.radius}" fill="#FFFFFF" stroke="#000000" stroke-width="0.9"/>\n`;
          svgElements += `  <text x="${choice.canonicalCenter.x}" y="${choice.canonicalCenter.y + 2.5}" font-family="sans-serif" font-size="6" font-weight="bold" text-anchor="middle" fill="#1F2937">${choice.choice}</text>\n`;
        }
      }
    }
  }

  const extraAttrs = personalized?.studentId
    ? ` data-assessment-id="${escapeXml(geometry.assessmentId)}" data-student-id="${escapeXml(personalized.studentId)}"`
    : '';

  return `<svg width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" fill="none" xmlns="http://www.w3.org/2000/svg" class="omr-master-svg"${extraAttrs}>
  <!-- Outer Page Surface -->
  <rect width="${page.width}" height="${page.height}" fill="#FFFFFF"/>

${svgElements}</svg>`;
}
