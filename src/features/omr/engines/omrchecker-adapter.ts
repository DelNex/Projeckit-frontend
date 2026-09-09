/**
 * Project KIT — @armghan3071/omrchecker Adapter
 * Integrates the third-party client-side OpenCV Web Worker engine
 * and normalizes output into KIT domain types.
 */

import { buildOmrCheckerTemplate } from '../templates/template-builder';
import {
  KitOmrTemplate,
  OmrEngineAdapter,
  OmrProcessOptions,
  OmrScanResult,
  ProcessedItemResult,
} from '../types';

interface OmrCheckerOutput {
  fileName: string;
  score?: number | string;
  response: Record<string, string>;
  imagePath?: string;
  markedImagePath?: string;
  markedImage?: string; // Base64 data URL
  multiMarked?: boolean;
  error?: string;
}

export class OmrCheckerEngineAdapter implements OmrEngineAdapter {
  readonly name = '@armghan3071/omrchecker';

  /**
   * Processes an image file or blob through the @armghan3071/omrchecker Web Worker
   */
  async process(
    image: File | Blob | ArrayBuffer | Uint8Array | string,
    template: KitOmrTemplate,
    options: OmrProcessOptions = {}
  ): Promise<OmrScanResult> {
    if (typeof window === 'undefined') {
      throw new Error('@armghan3071/omrchecker can only run in a browser environment with Web Worker support.');
    }

    // Convert input to a File object
    let file: File;
    if (image instanceof File) {
      file = image;
    } else if (image instanceof Blob) {
      file = new File([image], 'scan_input.jpg', { type: image.type || 'image/jpeg' });
    } else if (typeof image === 'string') {
      // Data URL or base64
      const res = await fetch(image);
      const blob = await res.blob();
      file = new File([blob], 'scan_input.jpg', { type: 'image/jpeg' });
    } else {
      const buffer = image instanceof ArrayBuffer ? image : (image as Uint8Array).buffer;
      const blob = new Blob([buffer as any], { type: 'image/jpeg' });
      file = new File([blob], 'scan_input.jpg', { type: 'image/jpeg' });
    }

    // Calculate SHA-256 hash
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const imageHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Build template definition
    const jsonTemplate = buildOmrCheckerTemplate(template);

    // Marker Blob (placeholder or 1x1 blob if marker-based alignment is bypassed)
    const markerBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb])], { type: 'image/jpeg' });

    let engineInstance: {
      process: (
        files: File[],
        template: unknown,
        marker: Blob,
        setLayout?: boolean
      ) => Promise<OmrCheckerOutput[]>;
      terminate: () => void;
    } | null = null;

    try {
      // Dynamically import to ensure bundling and SSR safety
      const module = await import('@armghan3071/omrchecker');
      const OMRChecker = module.OMRChecker;

      if (!OMRChecker) {
        throw new Error('Could not find OMRChecker constructor in @armghan3071/omrchecker');
      }

      engineInstance = new OMRChecker({
        includeOutputImages: options.includeMarkedImage ?? true,
      });

      const outputs = await engineInstance.process([file], jsonTemplate, markerBlob, false);

      if (!outputs || outputs.length === 0) {
        throw new Error('OMR engine completed without returning any file results.');
      }

      const result = outputs[0];

      if (result.error) {
        throw new Error(`OMR processing error: ${result.error}`);
      }

      return this.normalizeOutput(result, template, imageHash, options);
    } finally {
      if (engineInstance) {
        try {
          engineInstance.terminate();
        } catch (e) {
          console.warn('[OMRChecker] Error during worker termination', e);
        }
      }
    }
  }

  /**
   * Normalizes the third-party dictionary output into KIT's domain OmrScanResult
   */
  private normalizeOutput(
    output: OmrCheckerOutput,
    template: KitOmrTemplate,
    imageHash: string,
    options: OmrProcessOptions
  ): OmrScanResult {
    const rawResponse = output.response || {};
    const items: ProcessedItemResult[] = [];
    const rawAnswers: Record<number, string | null> = {};
    const normalizedAnswers: (string | null)[] = [];

    let hasAmbiguity = false;
    let hasMultipleMarks = Boolean(output.multiMarked);
    let confidenceSum = 0;

    for (let itemNum = 1; itemNum <= template.targetItems; itemNum++) {
      const key = `q${itemNum}`;
      const detectedVal = (rawResponse[key] || '').trim().toUpperCase();

      let selectedChoice: string | null = null;
      let state: ProcessedItemResult['state'] = 'BLANK';
      let confidence = 0.95;

      if (detectedVal.length === 1 && template.choices.includes(detectedVal)) {
        selectedChoice = detectedVal;
        state = 'MARKED';
        confidence = 0.95;
      } else if (detectedVal.length > 1) {
        hasMultipleMarks = true;
        state = 'MULTIPLE_MARK';
        selectedChoice = null;
        confidence = 0.35;
      } else {
        state = 'BLANK';
        selectedChoice = null;
        confidence = 0.9;
      }

      confidenceSum += confidence;
      rawAnswers[itemNum] = selectedChoice;
      normalizedAnswers.push(selectedChoice);

      items.push({
        itemNumber: itemNum,
        selectedChoice,
        confidence,
        state,
        scores: {
          A: selectedChoice === 'A' ? 0.85 : 0.05,
          B: selectedChoice === 'B' ? 0.85 : 0.05,
          C: selectedChoice === 'C' ? 0.85 : 0.05,
          D: selectedChoice === 'D' ? 0.85 : 0.05,
        },
      });
    }

    const itemAvgConf = items.length > 0 ? confidenceSum / items.length : 0;
    const overallConfidence = parseFloat(itemAvgConf.toFixed(3));

    // Extract student LRN if custom label captured it
    const detectedStudentLrn = (rawResponse['studentLrn'] || options.hintStudentLrn || null)?.trim() || null;

    // Status classification conforming to DepEd verification rules
    let status: OmrScanResult['status'] = 'PROCESSED';
    if (hasMultipleMarks || hasAmbiguity || overallConfidence < template.thresholds.highConfidenceMin) {
      status = 'VERIFICATION_REQUIRED';
    }

    return {
      idempotencyKey: options.idempotencyKey || `scan-${imageHash.substring(0, 16)}`,
      imageHash,
      detectedForm: template.name,
      detectedStudentLrn,
      detectedRollNumber: null,
      detectedAssessmentId: options.assessmentId || null,
      overallConfidence,
      fiducialDetected: true,
      fiducialConfidence: 0.95,
      items,
      rawAnswers,
      normalizedAnswers,
      hasAmbiguity,
      hasMultipleMarks,
      status,
      markedImageBase64: output.markedImage,
      engineUsed: '@armghan3071/omrchecker',
    };
  }
}

