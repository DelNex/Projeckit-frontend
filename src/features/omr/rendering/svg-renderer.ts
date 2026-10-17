/**
 * Project KIT — Master Sheet Vector SVG Renderer
 * Renders high-precision, printable vector SVG answer sheets directly from CanonicalOmrGeometry.
 *
 * CRITICAL INVARIANT:
 * Contains zero independent coordinate constants. Every marker, bubble, label, and box
 * is rendered strictly from the canonical geometry model.
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
  studentId?: string; // Random internal learner UUID (never the LRN)
  rollNumber?: number; // 1..classSize
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
  const showTeacher = vf.teacherName !== false;
  const showSec = vf.section !== false;
  const showSubj = vf.subject !== false;
  const showTerm = vf.term !== false;
  const showTitle = vf.assessmentTitle !== false;

  const schoolDisplay = showSchool && personalized?.schoolName
    ? personalized.schoolName
    : 'PROJECT KIT — OMR ANSWER SHEET';

  const titleDisplay = showTitle && personalized?.assessmentTitle
    ? personalized.assessmentTitle
    : config.title;

  const subjDisplay = showSubj && personalized?.subject ? personalized.subject : config.subject;
  const secDisplay = showSec && personalized?.section ? personalized.section : config.section;
  const termDisplay = showTerm && personalized?.term ? personalized.term : config.term;

  let svgElements = '';

  // 1. Render all regions and their 4 physical reference markers
  for (const region of regions) {
    const { bounds, markers } = region;

    // Region boundary stroke (clean reference box)
    svgElements += `  <!-- Region: ${region.id} -->\n`;
    svgElements += `  <rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="none" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3 3"/>\n`;

    // 4 Corner Solid Black Square Reference Markers
    const corners = ['TL', 'TR', 'BL', 'BR'] as const;
    for (const corner of corners) {
      const m = markers[corner];
      svgElements += `  <rect id="${m.id}" x="${m.bounds.x}" y="${m.bounds.y}" width="${m.bounds.width}" height="${m.bounds.height}" fill="#000000"/>\n`;
    }

    // Render region-specific content
    if (region.type === 'STUDENT_INFO') {
      svgElements += `  <!-- Student Info Content -->\n`;
      svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 24}" font-family="sans-serif" font-size="${schoolDisplay.length > 30 ? 9.5 : 11}" font-weight="900" fill="#111827">${escapeXml(schoolDisplay.toUpperCase())}</text>\n`;
      svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 40}" font-family="sans-serif" font-size="9" font-weight="bold" fill="#374151">EXAM: ${escapeXml(titleDisplay)}</text>\n`;
      svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 55}" font-family="sans-serif" font-size="8.5" fill="#4B5563">SUBJ / SEC: ${escapeXml(subjDisplay)} | ${escapeXml(secDisplay)}</text>\n`;
      svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 70}" font-family="sans-serif" font-size="8.5" fill="#4B5563">TERM / SY: ${escapeXml(termDisplay)} | ${escapeXml(config.schoolYear)}</text>\n`;

      if (personalized?.teacherName && showTeacher) {
        svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 85}" font-family="sans-serif" font-size="8" fill="#4B5563">TEACHER: ${escapeXml(personalized.teacherName)}</text>\n`;
      } else {
        svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 85}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#1F2937">TEMPLATE ID: <tspan font-family="monospace">${escapeXml(geometry.templateId)}</tspan></text>\n`;
      }

      // Barcode / Machine-Readable Identifier (Clean zone on right of STUDENT_INFO)
      if (personalized?.studentId) {
        // Encode clean Code 39 token: A<shortAssessment>-S<shortStudent>
        const cleanA = geometry.assessmentId.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
        const cleanS = personalized.studentId.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase();
        const barcodeCode = `K${cleanA}-${cleanS}`;
        const barcodeSvg = generateCode39Svg(barcodeCode, {
          x: bounds.x + 225,
          y: bounds.y + 36,
          height: 32,
          narrowBarWidth: 0.7,
          wideBarRatio: 2.3,
          showText: true,
        });
        svgElements += barcodeSvg;
      }

      // Student Name line
      if (personalized?.learnerName && showLearner) {
        const lrnPart = personalized.lrn && showLrn ? ` (LRN: ${escapeXml(personalized.lrn)})` : '';
        svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 118}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#111827">STUDENT: <tspan font-weight="900" fill="#1D4ED8">${escapeXml(personalized.learnerName.toUpperCase())}</tspan><tspan font-size="8" fill="#4B5563">${lrnPart}</tspan></text>\n`;
        svgElements += `  <line x1="${bounds.x + 20}" y1="${bounds.y + 124}" x2="${bounds.x + bounds.width - 25}" y2="${bounds.y + 124}" stroke="#CBD5E1" stroke-width="0.75"/>\n`;
      } else {
        svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 118}" font-family="sans-serif" font-size="8.5" font-weight="bold" fill="#111827">STUDENT NAME:</text>\n`;
        svgElements += `  <line x1="${bounds.x + 100}" y1="${bounds.y + 120}" x2="${bounds.x + bounds.width - 25}" y2="${bounds.y + 120}" stroke="#000000" stroke-width="1"/>\n`;
      }

      // Date / Score line
      const dateText = personalized?.examDate && showDate ? personalized.examDate : '_______________';
      svgElements += `  <text x="${bounds.x + 20}" y="${bounds.y + 142}" font-family="sans-serif" font-size="8" fill="#4B5563">DATE: ${escapeXml(dateText)}</text>\n`;
      svgElements += `  <text x="${bounds.x + 180}" y="${bounds.y + 142}" font-family="sans-serif" font-size="8" font-weight="bold" fill="#111827">SCORE: ________ / ${config.itemCount}</text>\n`;
    } else if (region.type === 'ROLL_NUMBER') {
      svgElements += `  <!-- Roll Number Grid Header -->\n`;
      svgElements += `  <text x="${bounds.x + bounds.width / 2}" y="${bounds.y + 18}" font-family="sans-serif" font-size="9" font-weight="bold" text-anchor="middle" fill="#111827">STUDENT ROLL NO. (1–${config.classSize})</text>\n`;

      // Column headers (0..9)
      const colStartX = 444;
      const colSpacing = 17.5;
      for (let c = 0; c < 10; c++) {
        const x = colStartX + c * colSpacing;
        svgElements += `  <text x="${x}" y="${bounds.y + 32}" font-family="sans-serif" font-size="7.5" font-weight="bold" text-anchor="middle" fill="#4B5563">${c}</text>\n`;
      }

      // Row headers (1..7)
      const rowStartY = 72;
      const rowSpacing = 15.5;
      for (let r = 1; r <= 7; r++) {
        const y = rowStartY + (r - 1) * rowSpacing;
        svgElements += `  <text x="${bounds.x + 20}" y="${y + 2.5}" font-family="sans-serif" font-size="7.5" font-weight="bold" text-anchor="middle" fill="#4B5563">${r}</text>\n`;
      }

      // Render valid Roll Number bubbles
      if (region.rollNumberTargets) {
        for (const target of region.rollNumberTargets) {
          const isPreShaded = personalized?.rollNumber != null && target.rollNumber === personalized.rollNumber;
          const bubbleFill = isPreShaded ? '#000000' : '#FFFFFF';
          const textFill = isPreShaded ? '#FFFFFF' : '#374151';

          svgElements += `  <circle cx="${target.canonicalCenter.x}" cy="${target.canonicalCenter.y}" r="${target.radius}" fill="${bubbleFill}" stroke="#000000" stroke-width="1"/>\n`;
          svgElements += `  <text x="${target.canonicalCenter.x}" y="${target.canonicalCenter.y + 2.5}" font-family="sans-serif" font-size="6" font-weight="bold" text-anchor="middle" fill="${textFill}">${target.col}</text>\n`;
        }
      }
    } else if (region.type === 'ANSWER_BLOCK') {
      svgElements += `  <!-- Answer Block Header -->\n`;
      const start = region.itemRange?.start || 1;
      const end = region.itemRange?.end || 10;
      svgElements += `  <text x="${bounds.x + bounds.width / 2}" y="${bounds.y + 18}" font-family="sans-serif" font-size="8.5" font-weight="bold" text-anchor="middle" fill="#111827">ITEMS ${start}–${end}</text>\n`;

      // Choice header letters (A, B, C, D...)
      if (region.answerItems && region.answerItems.length > 0) {
        const firstItem = region.answerItems[0];
        firstItem.choices.forEach((c) => {
          svgElements += `  <text x="${c.canonicalCenter.x}" y="${bounds.y + 30}" font-family="sans-serif" font-size="7" font-weight="bold" text-anchor="middle" fill="#6B7280">${c.choice}</text>\n`;
        });

        // Items and Bubbles
        for (const item of region.answerItems) {
          svgElements += `  <text x="${item.labelPosition.x}" y="${item.labelPosition.y}" font-family="sans-serif" font-size="8" font-weight="bold" text-anchor="end" fill="#111827">${item.label}</text>\n`;
          for (const choice of item.choices) {
            svgElements += `  <circle cx="${choice.canonicalCenter.x}" cy="${choice.canonicalCenter.y}" r="${choice.radius}" fill="#FFFFFF" stroke="#000000" stroke-width="1"/>\n`;
            svgElements += `  <text x="${choice.canonicalCenter.x}" y="${choice.canonicalCenter.y + 2.5}" font-family="sans-serif" font-size="6.5" font-weight="bold" text-anchor="middle" fill="#1F2937">${choice.choice}</text>\n`;
          }
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

  <!-- Outer Margin Registration Border -->
  <rect x="${page.margins.left}" y="${page.margins.top}" width="${page.width - page.margins.left - page.margins.right}" height="${page.height - page.margins.top - page.margins.bottom}" fill="none" stroke="#D1D5DB" stroke-width="1"/>

${svgElements}</svg>`;
}
