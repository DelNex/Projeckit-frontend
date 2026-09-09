/**
 * Project KIT — Browser-Native Marker-Relative Optical Mark Recognition Engine
 *
 * Implements marker-first optical parsing using projective homography derived from
 * 4 physical corner fiducials per region.
 *
 * Non-negotiable architectural invariants:
 * 1. Marker detection occurs before any bubble sampling.
 * 2. Never guesses coordinates or falls back to static global page coordinates.
 * 3. Perspective, rotation, and translation are corrected per-region via homography.
 * 4. Missing or low-confidence markers return VERIFICATION_REQUIRED with failedRegion diagnostics.
 * 5. Roll number grid (1..classSize) and answer items (1..itemCount) are dynamically evaluated.
 */

import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { CanonicalOmrGeometry } from '../geometry/geometry-types';
import {
  KitOmrTemplate,
  OmrEngineAdapter,
  OmrPreprocessResult,
  OmrProcessOptions,
  OmrScanResult,
  ProcessedItemResult,
} from '../types';
import { MarkerDetector } from './marker-detector';

export interface DecodedImage {
  pixels: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

export class NativeOpticalEngineAdapter implements OmrEngineAdapter {
  readonly name = 'kit-optical-native';

  /**
   * Preprocesses image to evaluate average lighting, contrast, and corner metrics.
   */
  static evaluateImageMetrics(
    pixels: Uint8ClampedArray | number[] | Uint8Array,
    width: number,
    height: number
  ): OmrPreprocessResult {
    let totalLuminance = 0;
    let minLum = 255;
    let maxLum = 0;

    const pixelCount = Math.floor(pixels.length / 4);

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      totalLuminance += lum;
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const avgLuminance = pixelCount > 0 ? totalLuminance / pixelCount : 128;
    const contrastRatio = maxLum > 0 ? (maxLum - minLum) / maxLum : 0;
    const isLightingAcceptable = avgLuminance >= 35 && avgLuminance <= 235 && contrastRatio >= 0.35;

    // Outer corner marker detection in 4 quadrants (12% bounding zones)
    const cornerSize = Math.floor(Math.min(width, height) * 0.12);
    let cornersFound = 0;

    const checkZone = (startX: number, startY: number) => {
      let darkPixels = 0;
      const zoneArea = cornerSize * cornerSize;
      for (let y = startY; y < startY + cornerSize; y += 2) {
        for (let x = startX; x < startX + cornerSize; x += 2) {
          const idx = (y * width + x) * 4;
          if (idx + 2 < pixels.length) {
            const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            if (lum < 90) darkPixels++;
          }
        }
      }
      return darkPixels > zoneArea * 0.04;
    };

    if (checkZone(10, 10)) cornersFound++;
    if (checkZone(width - cornerSize - 10, 10)) cornersFound++;
    if (checkZone(10, height - cornerSize - 10)) cornersFound++;
    if (checkZone(width - cornerSize - 10, height - cornerSize - 10)) cornersFound++;

    return {
      markersDetected: cornersFound >= 3,
      cornerCount: cornersFound,
      contrastRatio: parseFloat(contrastRatio.toFixed(2)),
      isLightingAcceptable,
      skewAngle: 0.0,
    };
  }

  /**
   * Samples mean darkness within a circle at physical image coordinates (cx, cy, radius).
   * Returns a value 0.0 (white/paper) to 1.0 (black mark).
   */
  static sampleCircleDarkness(
    pixels: Uint8Array | Uint8ClampedArray,
    width: number,
    height: number,
    cx: number,
    cy: number,
    radius: number
  ): number {
    const r2 = radius * radius;
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(width - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(height - 1, Math.ceil(cy + radius));

    let lumSum = 0;
    let count = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          const idx = (y * width + x) * 4;
          if (idx + 2 < pixels.length) {
            const lum = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
            lumSum += lum;
            count++;
          }
        }
      }
    }

    if (count === 0) return 0;
    const meanLum = lumSum / count;
    return 1.0 - meanLum / 255.0; // 0 = white, 1 = black
  }

  /**
   * Main scan processing pipeline.
   */
  async process(
    image: File | Blob | ArrayBuffer | Uint8Array | string | DecodedImage,
    template: KitOmrTemplate,
    options: OmrProcessOptions = {}
  ): Promise<OmrScanResult> {
    let decoded: DecodedImage | null = null;
    let rawBuffer: Uint8Array;

    // Check if input is already decoded RGBA pixels
    if (this.isDecodedImage(image)) {
      decoded = image;
      rawBuffer = new Uint8Array(image.pixels.buffer, image.pixels.byteOffset, image.pixels.byteLength);
    } else if (image instanceof Uint8Array) {
      rawBuffer = image;
    } else if (image instanceof ArrayBuffer) {
      rawBuffer = new Uint8Array(image);
    } else if (typeof image === 'string') {
      if (image.startsWith('data:')) {
        const base64Data = image.split(',')[1] || '';
        rawBuffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      } else {
        const encoder = new TextEncoder();
        rawBuffer = encoder.encode(image);
      }
    } else {
      const arrayBuf = await image.arrayBuffer();
      rawBuffer = new Uint8Array(arrayBuf);
    }

    if (rawBuffer.length === 0) {
      throw new Error('Image payload is empty or invalid.');
    }

    const imageHash = await this.computeSha256(rawBuffer);

    // Try decoding PNG in Node if not already decoded
    if (!decoded) {
      decoded = await this.tryDecodePng(rawBuffer);
    }

    if (!decoded) {
      return {
        idempotencyKey: options.idempotencyKey || `scan-${imageHash.substring(0, 16)}`,
        imageHash,
        detectedForm: template.name,
        detectedStudentLrn: options.hintStudentLrn || null,
        detectedRollNumber: null,
        detectedAssessmentId: options.assessmentId || null,
        overallConfidence: 0,
        fiducialDetected: false,
        fiducialConfidence: 0,
        items: [],
        rawAnswers: {},
        normalizedAnswers: [],
        hasAmbiguity: false,
        hasMultipleMarks: false,
        status: 'REJECTED',
        errorCode: 'DECODE_FAILED',
        engineUsed: 'kit-optical-native',
      };
    }

    // Resolve CanonicalOmrGeometry
    const geometry: CanonicalOmrGeometry =
      template.canonicalGeometry ||
      generateCanonicalGeometry({
        assessmentId: options.assessmentId || template.id,
        itemCount: template.targetItems,
        classSize: 60,
        choices: template.choices,
        pageWidth: template.dimensions.width,
        pageHeight: template.dimensions.height,
      });

    return this.processWithHomography(decoded, geometry, template, imageHash, options);
  }

  /**
   * Processes decoded RGBA image using marker-first projective homography.
   */
  private processWithHomography(
    decoded: DecodedImage,
    geometry: CanonicalOmrGeometry,
    template: KitOmrTemplate,
    imageHash: string,
    options: OmrProcessOptions
  ): OmrScanResult {
    const { pixels, width, height } = decoded;

    // Pre-flight image metrics (contrast and general illumination)
    const metrics = NativeOpticalEngineAdapter.evaluateImageMetrics(pixels, width, height);

    // STEP 1: PHYSICAL MARKER DETECTION (Mandatory first step)
    const markerResult = MarkerDetector.detectRegionMarkers(pixels, width, height, geometry);

    // STEP 2: STRICT FAILURE ENFORCEMENT
    // Never guess coordinates if required region markers are missing or degenerate
    if (!markerResult.allRegionsDetected) {
      const primaryFailure = markerResult.failedRegions[0];
      return {
        idempotencyKey: options.idempotencyKey || `scan-${imageHash.substring(0, 16)}`,
        imageHash,
        detectedForm: geometry.templateId,
        detectedStudentLrn: options.hintStudentLrn || null,
        detectedRollNumber: null,
        detectedAssessmentId: options.assessmentId || geometry.assessmentId,
        overallConfidence: markerResult.overallMarkerConfidence,
        fiducialDetected: false,
        fiducialConfidence: markerResult.overallMarkerConfidence,
        items: [],
        rawAnswers: {},
        normalizedAnswers: [],
        hasAmbiguity: false,
        hasMultipleMarks: false,
        status: 'VERIFICATION_REQUIRED',
        errorCode: 'REGION_MARKER_DETECTION_FAILED',
        failedRegion: primaryFailure,
        engineUsed: 'kit-optical-native',
      };
    }

    const { detectedRegions } = markerResult;
    const { markMinFill, ambiguousDelta, highConfidenceMin } = template.thresholds;

    // Scale factor for radius
    const scale = Math.min(width / geometry.page.width, height / geometry.page.height);

    // STEP 3: DYNAMIC ROLL NUMBER DECODING
    let detectedRollNumber: number | null = null;
    let rollAmbiguity = false;
    let rollMultipleMarks = false;

    const rollRegion = detectedRegions['ROLL_NUMBER'];
    if (rollRegion && geometry.rollNumberGrid.length > 0) {
      const H = rollRegion.homography;
      const markedRolls: Array<{ rollNumber: number; score: number }> = [];

      for (const target of geometry.rollNumberGrid) {
        // Project normalized (u, v) into physical image coordinates
        const pt = H.transformPoint(target.relativePosition.u, target.relativePosition.v);
        const score = NativeOpticalEngineAdapter.sampleCircleDarkness(
          pixels,
          width,
          height,
          pt.x,
          pt.y,
          target.radius * scale
        );

        if (score >= markMinFill) {
          markedRolls.push({ rollNumber: target.rollNumber, score });
        }
      }

      if (markedRolls.length === 1) {
        detectedRollNumber = markedRolls[0].rollNumber;
      } else if (markedRolls.length > 1) {
        rollMultipleMarks = true;
      } else {
        // Zero roll marks detected
        rollAmbiguity = true;
      }
    }

    // STEP 4: DYNAMIC ANSWER ITEM DECODING VIA HOMOGRAPHY
    const items: ProcessedItemResult[] = [];
    const rawAnswers: Record<number, string | null> = {};
    const normalizedAnswers: (string | null)[] = [];

    let hasAmbiguity = false;
    let hasMultipleMarks = false;
    let confidenceSum = 0;

    for (const item of geometry.answerBlocks) {
      const regionQuad = detectedRegions[item.regionId];
      if (!regionQuad) continue;

      const H = regionQuad.homography;
      const scores: Record<string, number> = {};

      for (const choice of item.choices) {
        const pt = H.transformPoint(choice.relativePosition.u, choice.relativePosition.v);
        const score = NativeOpticalEngineAdapter.sampleCircleDarkness(
          pixels,
          width,
          height,
          pt.x,
          pt.y,
          choice.radius * scale
        );
        scores[choice.choice] = parseFloat(score.toFixed(3));
      }

      const choicesList = item.choices.map((c) => c.choice);
      const markedChoices = choicesList.filter((c) => scores[c] >= markMinFill);

      const sorted = [...choicesList].sort((a, b) => scores[b] - scores[a]);
      const topScore = scores[sorted[0]] || 0;
      const secondScore = scores[sorted[1]] || 0;

      let selectedChoice: string | null = null;
      let state: ProcessedItemResult['state'] = 'BLANK';
      let confidence = 0;

      if (markedChoices.length === 0) {
        state = 'BLANK';
        confidence = Math.max(0, 1.0 - topScore);
      } else if (markedChoices.length === 1) {
        selectedChoice = markedChoices[0];
        state = 'MARKED';
        confidence = Math.min(1.0, topScore - secondScore + 0.5);
      } else {
        const delta = topScore - secondScore;
        if (delta < ambiguousDelta) {
          state = 'AMBIGUOUS';
          hasAmbiguity = true;
          confidence = delta / ambiguousDelta;
        } else {
          state = 'MULTIPLE_MARK';
          hasMultipleMarks = true;
          confidence = 0.3;
        }
      }

      confidenceSum += confidence;

      items.push({
        itemNumber: item.itemNumber,
        selectedChoice,
        confidence: parseFloat(confidence.toFixed(3)),
        state,
        scores,
      });

      rawAnswers[item.itemNumber] = selectedChoice;
      normalizedAnswers.push(selectedChoice);
    }

    const avgConfidence = items.length > 0 ? confidenceSum / items.length : 0;
    const overallConfidence = parseFloat(
      ((avgConfidence * 0.7 + markerResult.overallMarkerConfidence * 0.3)).toFixed(3)
    );

    let status: OmrScanResult['status'] = 'PROCESSED';
    if (
      hasMultipleMarks ||
      hasAmbiguity ||
      rollMultipleMarks ||
      rollAmbiguity ||
      overallConfidence < highConfidenceMin ||
      !metrics.isLightingAcceptable
    ) {
      status = 'VERIFICATION_REQUIRED';
    }

    return {
      idempotencyKey: options.idempotencyKey || `scan-${imageHash.substring(0, 16)}`,
      imageHash,
      detectedForm: geometry.templateId,
      detectedStudentLrn: options.hintStudentLrn || (detectedRollNumber ? `ROLL-${detectedRollNumber}` : null),
      detectedRollNumber,
      detectedAssessmentId: options.assessmentId || geometry.assessmentId,
      overallConfidence,
      fiducialDetected: true,
      fiducialConfidence: markerResult.overallMarkerConfidence,
      items,
      rawAnswers,
      normalizedAnswers,
      hasAmbiguity: hasAmbiguity || rollAmbiguity,
      hasMultipleMarks: hasMultipleMarks || rollMultipleMarks,
      status,
      engineUsed: 'kit-optical-native',
    };
  }

  private isDecodedImage(image: unknown): image is DecodedImage {
    return (
      typeof image === 'object' &&
      image !== null &&
      'pixels' in image &&
      'width' in image &&
      'height' in image
    );
  }

  private async tryDecodePng(buffer: Uint8Array): Promise<DecodedImage | null> {
    if (buffer.length < 8 || buffer[0] !== 137 || buffer[1] !== 80 || buffer[2] !== 78 || buffer[3] !== 71) {
      return null;
    }

    try {
      const { PNG } = await import('pngjs');
      const png = PNG.sync.read(Buffer.from(buffer));
      return {
        pixels: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
        width: png.width,
        height: png.height,
      };
    } catch {
      return null;
    }
  }

  private async computeSha256(buffer: Uint8Array): Promise<string> {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const hashBuf = await window.crypto.subtle.digest('SHA-256', buffer as any);
      return Array.from(new Uint8Array(hashBuf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    try {
      const nodeCrypto = await import('crypto');
      return nodeCrypto.createHash('sha256').update(buffer).digest('hex');
    } catch {
      let h = 0x811c9dc5;
      for (let i = 0; i < buffer.length; i++) {
        h ^= buffer[i];
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(64, '0');
    }
  }
}
