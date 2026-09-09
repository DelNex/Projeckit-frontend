/**
 * Project KIT — OMR Template Builder & Formatter
 * Generates KitOmrTemplate and JSON templates for @armghan3071/omrchecker
 * strictly derived from CanonicalOmrGeometry.
 */

import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { AssessmentOmrConfig, CanonicalOmrGeometry } from '../geometry/geometry-types';
import {
  KitOmrTemplate,
  LrnGridColumn,
  OmrBubbleGridItem,
  OmrCheckerFieldBlock,
  OmrCheckerJsonTemplate,
} from '../types';

export interface CreateTemplateOptions extends Partial<AssessmentOmrConfig> {
  id?: string;
  name?: string;
  targetItems?: number;
  width?: number;
  height?: number;
  lrnColumns?: number;
  markMinFill?: number;
  ambiguousDelta?: number;
  highConfidenceMin?: number;
  geometry?: CanonicalOmrGeometry;
}

/**
 * Creates a normalized KIT OMR Template configuration
 * derived strictly from CanonicalOmrGeometry.
 */
export function createKitOmrTemplate(options: CreateTemplateOptions = {}): KitOmrTemplate {
  const itemCount = options.geometry?.config.itemCount || options.itemCount || options.targetItems || 50;
  const classSize = options.geometry?.config.classSize || options.classSize || 60;
  const choices = options.geometry?.config.choices || options.choices || ['A', 'B', 'C', 'D'];

  // Use provided geometry or generate from canonical geometry engine
  const geometry: CanonicalOmrGeometry =
    options.geometry ||
    generateCanonicalGeometry({
      assessmentId: options.assessmentId || options.id || 'canonical-assessment',
      title: options.title || options.name || 'Assessment Examination',
      subject: options.subject,
      section: options.section,
      itemCount,
      classSize,
      choices,
      pageWidth: options.width || options.pageWidth || 681,
      pageHeight: options.height || options.pageHeight || 880,
    });

  const { page, answerBlocks } = geometry;

  // Derive itemGrid from canonical geometry answerBlocks
  const itemGrid: OmrBubbleGridItem[] = answerBlocks.map((item) => {
    const bubbles: Record<string, { x: number; y: number; radius: number }> = {};
    item.choices.forEach((c) => {
      bubbles[c.choice] = {
        x: c.canonicalCenter.x,
        y: c.canonicalCenter.y,
        radius: c.radius,
      };
    });
    return {
      itemNumber: item.itemNumber,
      bubbles,
    };
  });

  // Optional legacy LRN grid (empty if not needed)
  const lrnGrid: LrnGridColumn[] = [];

  return {
    id: geometry.templateId,
    name: options.name || `Project KIT Standard ${itemCount}-Item Assessment`,
    targetItems: itemCount,
    choices,
    dimensions: { width: page.width, height: page.height },
    fiducials: {
      topLeft: { x: page.margins.left, y: page.margins.top },
      topRight: { x: page.width - page.margins.right, y: page.margins.top },
      bottomLeft: { x: page.margins.left, y: page.height - page.margins.bottom },
      bottomRight: { x: page.width - page.margins.right, y: page.height - page.margins.bottom },
    },
    itemGrid,
    lrnGrid,
    lrnColumns: options.lrnColumns ?? 12,
    canonicalGeometry: geometry,
    thresholds: {
      markMinFill: options.markMinFill ?? 0.35,
      ambiguousDelta: options.ambiguousDelta ?? 0.15,
      highConfidenceMin: options.highConfidenceMin ?? 0.85,
    },
  };
}

/**
 * Transforms a KitOmrTemplate or CanonicalOmrGeometry into the JSON template specification
 * required by @armghan3071/omrchecker engine.
 */
export function buildOmrCheckerTemplate(templateOrGeometry: KitOmrTemplate | CanonicalOmrGeometry): OmrCheckerJsonTemplate {
  const geometry: CanonicalOmrGeometry =
    'regions' in templateOrGeometry
      ? templateOrGeometry
      : templateOrGeometry.canonicalGeometry ||
        generateCanonicalGeometry({
          assessmentId: templateOrGeometry.id,
          itemCount: templateOrGeometry.targetItems,
          classSize: 60,
          choices: templateOrGeometry.choices,
          pageWidth: templateOrGeometry.dimensions.width,
          pageHeight: templateOrGeometry.dimensions.height,
        });

  const { page, regions } = geometry;
  const fieldBlocks: Record<string, OmrCheckerFieldBlock> = {};

  // Generate fieldBlocks dynamically for each ANSWER_BLOCK region
  for (const region of regions) {
    if (region.type === 'ANSWER_BLOCK' && region.answerItems && region.answerItems.length > 0) {
      const firstItem = region.answerItems[0];
      const startNum = region.itemRange?.start || firstItem.itemNumber;
      const endNum = region.itemRange?.end || region.answerItems[region.answerItems.length - 1].itemNumber;

      const originX = firstItem.choices[0]?.canonicalCenter.x - 10 || region.bounds.x + 40;
      const originY = firstItem.choices[0]?.canonicalCenter.y - 10 || region.bounds.y + 35;

      fieldBlocks[region.id] = {
        fieldType: 'QTYPE_MCQ4',
        origin: [originX, originY],
        fieldLabels: [`q${startNum}..${endNum}`],
        bubblesGap: 26,
        labelsGap: 16,
        direction: 'horizontal',
        bubbleDimensions: [14, 14],
      };
    } else if (region.type === 'ROLL_NUMBER' && region.rollNumberTargets && region.rollNumberTargets.length > 0) {
      const firstTarget = region.rollNumberTargets[0];
      fieldBlocks['ROLL_NUMBER'] = {
        fieldType: 'QTYPE_INT',
        origin: [firstTarget.canonicalCenter.x - 8, firstTarget.canonicalCenter.y - 8],
        fieldLabels: [`roll1..${region.rollNumberTargets.length}`],
        bubblesGap: 17,
        labelsGap: 15,
        direction: 'vertical',
        bubbleDimensions: [12, 12],
      };
    }
  }

  return {
    pageDimensions: [page.width, page.height],
    bubbleDimensions: [14, 14],
    emptyValue: '',
    preProcessors: [
      {
        name: 'CropPage',
        options: {
          morphKernel: [10, 10],
        },
      },
    ],
    fieldBlocks,
  };
}
