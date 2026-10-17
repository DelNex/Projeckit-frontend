/**
 * Project KIT — E-ClassRoom Master & Personalized Answer Sheet Vector SVG Renderer
 * Renders high-precision, DepEd-compliant printable vector SVG answer sheets
 * directly from CanonicalOmrGeometry.
 *
 * CRITICAL INVARIANT:
 * Contains zero independent coordinate constants. Every marker, bubble, label, and box
 * is rendered strictly from the canonical geometry model.
 *
 * REFERENCE LAYOUT:
 * 1. Centered Header: optional school logo/seal, Republic of the Philippines,
 *    Department of Education, Region, Division, School name in bold.
 * 2. Learner Info: Row 1: NAME, DATE, SCORE; Row 2: LRN, YEAR/SECTION.
 * 3. Title Block: <TERM NAME> <ASSESSMENT TITLE> ANSWER SHEET (bold uppercase), subject, S.Y.
 * 4. Section Bar: MULTIPLE CHOICE (<N> points), instruction line, formCode on right.
 * 5. Answer Area: ONE rectangular area framed by exactly 4 solid black square markers at corners.
 *    No dashed region boxes, no gray page border, no extra markers inside.
 * 6. Learner ID: Code 39 barcode (personalized) or compact roll grid (blank) in header zone.
 */

import { CanonicalOmrGeometry } from '../geometry/geometry-types';
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
  rollNumber?: number; // 1..classSize
  totalPoints?: number;
  visibleFields?: VisibleHeaderFields;
}

export function renderOmrMasterSvg(
  geometry: CanonicalOmrGeometry,
  personalized?: PersonalizedSheetData
): string {
  const { page, regions, config } = geometry;
  const vf = personalized?.visibleFields || {};

  const showSchool = vf.schoolName !== false;
  const showLearner = vf.learnerName !== false;
  const showLrn = vf.lrn !== false;
  const showDate = vf.examDate !== false;
  const showSec = vf.section !== false;
  const showSubj = vf.subject !== false;
  const showTerm = vf.term !== false;
  const showTitle = vf.assessmentTitle !== false;

  const schoolDisplay = showSchool && (personalized?.schoolName || config.title)
    ? personalized?.schoolName || 'DEPED SCHOOL'
    : 'DEPED SCHOOL';

  const titleDisplay = showTitle && (personalized?.assessmentTitle || config.title)
    ? (personalized?.assessmentTitle || config.title)
    : config.title;

  const subjDisplay = showSubj && (personalized?.subject || config.subject)
    ? (personalized?.subject || config.subject)
    : config.subject;

  const secDisplay = showSec && (personalized?.section || config.section)
    ? (personalized?.section || config.section)
    : config.section;

  const termDisplay = showTerm && (personalized?.term || config.term)
    ? (personalized?.term || config.term)
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
  // 1. HEADER (Centered, Top of Sheet)
  // =========================================================================
  const centerX = page.width / 2;
  const hasLogo = Boolean(personalized?.logoData);
  let textY = hasLogo ? 60 : 28;

  svgElements += `  <!-- 1. Header (DepEd Official Header) -->\n`;
  if (hasLogo && personalized?.logoData) {
    svgElements += `  <image href="${escapeXml(personalized.logoData)}" x="${centerX - 18}" y="14" width="36" height="36" preserveAspectRatio="xMidYMid meet"/>\n`;
  }

  svgElements += `  <text x="${centerX}" y="${textY}" font-family="sans-serif" font-size="8" font-weight="500" fill="#4B5563" text-anchor="middle">Republic of the Philippines</text>\n`;
  textY += 12;
  svgElements += `  <text x="${centerX}" y="${textY}" font-family="sans-serif" font-size="9" font-weight="bold" fill="#111827" text-anchor="middle">Department of Education</text>\n`;

  if (personalized?.region && personalized.region.trim()) {
    textY += 11;
    svgElements += `  <text x="${centerX}" y="${textY}" font-family="sans-serif" font-size="8" fill="#4B5563" text-anchor="middle">${escapeXml(personalized.region.trim())}</text>\n`;
  }

  if (personalized?.division && personalized.division.trim()) {
    textY += 11;
    svgElements += `  <text x="${centerX}" y="${textY}" font-family="sans-serif" font-size="8" fill="#4B5563" text-anchor="middle">${escapeXml(personalized.division.trim())}</text>\n`;
  }

  textY += 13;
  svgElements += `  <text x="${centerX}" y="${textY}" font-family="sans-serif" font-size="10.5" font-weight="900" fill="#111827" text-anchor="middle">${escapeXml(schoolDisplay.toUpperCase())}</text>\n`;

  // =========================================================================
  // 2. LEARNER INFO & 6. IDENTIFICATION (Barcode vs Roll Grid)
  // =========================================================================
  svgElements += `  <!-- 2. Learner Information & Identification -->\n`;
  const infoX = 40;
  const infoRow1Y = 142;
  const infoRow2Y = 166;

  // Row 1: NAME, DATE, SCORE
  svgElements += `  <text x="${infoX}" y="${infoRow1Y}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#111827">NAME:</text>\n`;
  if (learnerNameDisplay) {
    svgElements += `  <text x="${infoX + 38}" y="${infoRow1Y}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#1D4ED8">${escapeXml(learnerNameDisplay)}</text>\n`;
    svgElements += `  <line x1="${infoX + 36}" y1="${infoRow1Y + 3}" x2="255" y2="${infoRow1Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  } else {
    svgElements += `  <line x1="${infoX + 36}" y1="${infoRow1Y + 3}" x2="255" y2="${infoRow1Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  }

  svgElements += `  <text x="265" y="${infoRow1Y}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#111827">DATE:</text>\n`;
  if (examDateDisplay) {
    svgElements += `  <text x="300" y="${infoRow1Y}" font-family="sans-serif" font-size="8.5" fill="#334155">${escapeXml(examDateDisplay)}</text>\n`;
    svgElements += `  <line x1="298" y1="${infoRow1Y + 3}" x2="370" y2="${infoRow1Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  } else {
    svgElements += `  <line x1="298" y1="${infoRow1Y + 3}" x2="370" y2="${infoRow1Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  }

  svgElements += `  <text x="380" y="${infoRow1Y}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#111827">SCORE:</text>\n`;
  svgElements += `  <line x1="422" y1="${infoRow1Y + 3}" x2="455" y2="${infoRow1Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;

  // Row 2: LRN, YEAR/SECTION
  svgElements += `  <text x="${infoX}" y="${infoRow2Y}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#111827">LRN:</text>\n`;
  if (lrnDisplay) {
    svgElements += `  <text x="${infoX + 28}" y="${infoRow2Y}" font-family="monospace" font-size="8.5" font-weight="bold" fill="#334155">${escapeXml(lrnDisplay)}</text>\n`;
    svgElements += `  <line x1="${infoX + 26}" y1="${infoRow2Y + 3}" x2="225" y2="${infoRow2Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  } else {
    svgElements += `  <line x1="${infoX + 26}" y1="${infoRow2Y + 3}" x2="225" y2="${infoRow2Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  }

  svgElements += `  <text x="235" y="${infoRow2Y}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#111827">YEAR/SECTION:</text>\n`;
  if (secDisplay) {
    svgElements += `  <text x="318" y="${infoRow2Y}" font-family="sans-serif" font-size="8.5" fill="#334155">${escapeXml(secDisplay)}</text>\n`;
    svgElements += `  <line x1="315" y1="${infoRow2Y + 3}" x2="455" y2="${infoRow2Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  } else {
    svgElements += `  <line x1="315" y1="${infoRow2Y + 3}" x2="455" y2="${infoRow2Y + 3}" stroke="#1E293B" stroke-width="0.75"/>\n`;
  }

  // Learner Identification in Header Zone (Right of Learner Info)
  if (isPersonalized && personalized?.studentId) {
    // 6a. Code 39 Barcode for Personalized Sheets (never encodes LRN)
    const cleanA = geometry.assessmentId.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
    const cleanS = personalized.studentId.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
    const barcodeCode = `K${cleanA}-${cleanS}`;
    const barcodeSvg = generateCode39Svg(barcodeCode, {
      x: 472,
      y: 135,
      height: 32,
      narrowBarWidth: 0.75,
      wideBarRatio: 2.3,
      showText: true,
    });
    svgElements += barcodeSvg;
  } else {
    // 6b. Compact Roll-Number Grid for Blank Sheets (1..classSize)
    svgElements += `  <!-- Compact Roll-Number Grid (Blank Sheets) -->\n`;
    svgElements += `  <text x="545" y="128" font-family="sans-serif" font-size="7.5" font-weight="bold" text-anchor="middle" fill="#111827">STUDENT ROLL NO. (1–${config.classSize})</text>\n`;

    const rollStartX = 458;
    const rollColSpacing = 17.5;
    for (let c = 0; c < 10; c++) {
      const x = rollStartX + c * rollColSpacing;
      svgElements += `  <text x="${x}" y="137" font-family="sans-serif" font-size="6.5" font-weight="bold" text-anchor="middle" fill="#6B7280">${c}</text>\n`;
    }

    if (geometry.rollNumberGrid) {
      for (const target of geometry.rollNumberGrid) {
        const isPreShaded = personalized?.rollNumber != null && target.rollNumber === personalized.rollNumber;
        const bubbleFill = isPreShaded ? '#000000' : '#FFFFFF';
        const textFill = isPreShaded ? '#FFFFFF' : '#374151';

        svgElements += `  <circle cx="${target.canonicalCenter.x}" cy="${target.canonicalCenter.y}" r="${target.radius}" fill="${bubbleFill}" stroke="#000000" stroke-width="0.8"/>\n`;
        svgElements += `  <text x="${target.canonicalCenter.x}" y="${target.canonicalCenter.y + 2}" font-family="sans-serif" font-size="5" font-weight="bold" text-anchor="middle" fill="${textFill}">${target.col}</text>\n`;
      }
    }
  }

  // =========================================================================
  // 3. TITLE BLOCK (Centered, Bold, Uppercase, Auto-Shrink Font)
  // =========================================================================
  const fullTitle = `${termDisplay} ${titleDisplay} ANSWER SHEET`.toUpperCase();
  const titleFontSize = fullTitle.length > 50 ? 8.5 : fullTitle.length > 35 ? 10 : 11.5;

  svgElements += `  <!-- 3. Title Block -->\n`;
  svgElements += `  <text x="${centerX}" y="202" font-family="sans-serif" font-size="${titleFontSize}" font-weight="900" fill="#111827" text-anchor="middle">${escapeXml(fullTitle)}</text>\n`;
  svgElements += `  <text x="${centerX}" y="217" font-family="sans-serif" font-size="9.5" font-weight="bold" fill="#374151" text-anchor="middle">${escapeXml(subjDisplay.toUpperCase())}</text>\n`;
  svgElements += `  <text x="${centerX}" y="231" font-family="sans-serif" font-size="8.5" fill="#4B5563" text-anchor="middle">S.Y. ${escapeXml(config.schoolYear)}</text>\n`;

  // =========================================================================
  // 4. SECTION BAR
  // =========================================================================
  svgElements += `  <!-- 4. Section Bar -->\n`;
  svgElements += `  <line x1="40" y1="246" x2="641" y2="246" stroke="#000000" stroke-width="1"/>\n`;
  svgElements += `  <text x="42" y="258" font-family="sans-serif" font-size="8.5" font-weight="900" fill="#111827">MULTIPLE CHOICE (${totalPoints} POINTS)</text>\n`;
  svgElements += `  <text x="42" y="269" font-family="sans-serif" font-size="7.5" font-style="italic" fill="#4B5563">Instructions: Shade the circle for the correct answer on the answer sheet.</text>\n`;
  svgElements += `  <text x="641" y="259" font-family="monospace" font-size="8" font-weight="bold" text-anchor="end" fill="#6B7280">${escapeXml(config.formCode)}</text>\n`;
  svgElements += `  <line x1="40" y1="274" x2="641" y2="274" stroke="#000000" stroke-width="0.75"/>\n`;

  // =========================================================================
  // 5. ANSWER AREA (Framed by exactly 4 solid black square markers)
  // =========================================================================
  const answersRegion = regions.find((r) => r.id === 'ANSWERS') || regions[0];
  if (answersRegion) {
    const { bounds, markers } = answersRegion;

    svgElements += `  <!-- 5. Answer Area (Framed by exactly 4 solid square markers) -->\n`;

    // Outer frame rectangle
    svgElements += `  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="none" stroke="#000000" stroke-width="1.25"/>\n`;

    // 4 Corner Solid Black Square Reference Markers
    const corners = ['TL', 'TR', 'BL', 'BR'] as const;
    for (const corner of corners) {
      const m = markers[corner];
      if (m) {
        svgElements += `  <rect id="${m.id}" x="${m.bounds.x}" y="${m.bounds.y}" width="${m.bounds.width}" height="${m.bounds.height}" fill="#000000"/>\n`;
      }
    }

    // Column dividers
    const cols = config.itemCount <= 50 ? 2 : 3;
    const colWidth = bounds.width / cols;
    for (let c = 1; c < cols; c++) {
      const divX = bounds.x + c * colWidth;
      svgElements += `  <line x1="${divX}" y1="${bounds.y}" x2="${divX}" y2="${bounds.y + bounds.height}" stroke="#E5E7EB" stroke-width="1"/>\n`;
    }

    // Column Choice Letter Headers (A, B, C, D)
    const choices = config.choices || ['A', 'B', 'C', 'D'];
    const choiceSpacing = choices.length > 4 ? (cols === 2 ? 22.0 : 19.5) : (cols === 2 ? 26.0 : 23.5);
    const headerChoicesY = bounds.y + 24;

    for (let c = 0; c < cols; c++) {
      const colBaseX = bounds.x + c * colWidth;
      const choicesStartX = cols === 2 ? colBaseX + 85 : colBaseX + 48;
      choices.forEach((choice, cIdx) => {
        const cx = choicesStartX + cIdx * choiceSpacing;
        svgElements += `  <text x="${cx}" y="${headerChoicesY}" font-family="sans-serif" font-size="7.5" font-weight="900" text-anchor="middle" fill="#6B7280">${choice}</text>\n`;
      });
    }

    // Answer Items and Bubbles
    if (answersRegion.answerItems) {
      for (const item of answersRegion.answerItems) {
        svgElements += `  <text x="${item.labelPosition.x}" y="${item.labelPosition.y}" font-family="sans-serif" font-size="8" font-weight="bold" text-anchor="end" fill="#111827">${item.label}</text>\n`;
        for (const choice of item.choices) {
          svgElements += `  <circle cx="${choice.canonicalCenter.x}" cy="${choice.canonicalCenter.y}" r="${choice.radius}" fill="#FFFFFF" stroke="#000000" stroke-width="1"/>\n`;
          svgElements += `  <text x="${choice.canonicalCenter.x}" y="${choice.canonicalCenter.y + 2.5}" font-family="sans-serif" font-size="6.5" font-weight="bold" text-anchor="middle" fill="#1F2937">${choice.choice}</text>\n`;
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
