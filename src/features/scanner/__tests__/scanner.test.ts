/**
 * Project KIT — Scanner Architecture Unit Tests
 * Tests camera utilities, barcode payload decoding, document quality diagnostics,
 * and client-side AI advisor rules without external backend or Ollama dependencies.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';

import { formatCameraError } from '../camera/camera-utils';
import { extractDepEdBarcodePayload, isBarcodeFormatSupported } from '../barcode/barcode-engine';
import { adviseOnQuality, clientAiAdvisor } from '../ai/client-ai-advisor';
import { DocumentQualityMetrics } from '../ai/ai-types';

describe('Project KIT — Local AI Scanner Unit Tests', () => {
  describe('1. Camera Utilities & Error Formatting', () => {
    it('translates NotAllowedError into user-friendly permission error', () => {
      const err = new Error('Permission dismissed');
      err.name = 'NotAllowedError';
      const formatted = formatCameraError(err);
      assert.strictEqual(formatted.type, 'permission_denied');
      assert.match(formatted.message, /permission/i);
    });

    it('translates NotFoundError into device missing error', () => {
      const err = new Error('No device');
      err.name = 'NotFoundError';
      const formatted = formatCameraError(err);
      assert.strictEqual(formatted.type, 'not_found');
      assert.match(formatted.message, /no camera/i);
    });

    it('translates NotReadableError into hardware busy error', () => {
      const err = new Error('Hardware busy');
      err.name = 'NotReadableError';
      const formatted = formatCameraError(err);
      assert.strictEqual(formatted.type, 'not_readable');
      assert.match(formatted.message, /in use/i);
    });

    it('translates OverconstrainedError into constraint error', () => {
      const err = new Error('Constraints not met');
      err.name = 'OverconstrainedError';
      const formatted = formatCameraError(err);
      assert.strictEqual(formatted.type, 'overconstrained');
      assert.match(formatted.message, /resolution/i);
    });
  });

  describe('2. Barcode Engine & Payload Parsing', () => {
    it('verifies supported barcode formats', () => {
      assert.strictEqual(isBarcodeFormatSupported('code_39'), true);
      assert.strictEqual(isBarcodeFormatSupported('code_128'), true);
      assert.strictEqual(isBarcodeFormatSupported('qr_code'), true);
      assert.strictEqual(isBarcodeFormatSupported('unknown' as any), false);
    });

    it('extracts DepEd standard K-code barcode pattern (K<assessment>-<student>)', () => {
      const payload = extractDepEdBarcodePayload('K4A91B2-7C38E1');
      assert.ok(payload);
      assert.strictEqual(payload.assessmentId, '4A91B2');
      assert.strictEqual(payload.studentId, '7C38E1');
    });

    it('extracts DepEd KIT colon-delimited format (KIT:<assessment>:<student>)', () => {
      const payload = extractDepEdBarcodePayload('KIT:uuid-assessment-123:uuid-student-456');
      assert.ok(payload);
      assert.strictEqual(payload.assessmentId, 'uuid-assessment-123');
      assert.strictEqual(payload.studentId, 'uuid-student-456');
    });

    it('extracts DepEd LRN pattern (LRN:<12-digit>)', () => {
      const payload = extractDepEdBarcodePayload('LRN:109876543210');
      assert.ok(payload);
      assert.strictEqual(payload.studentId, '109876543210');
    });

    it('gracefully handles raw non-matching string barcodes', () => {
      const payload = extractDepEdBarcodePayload('RANDOM-CODE-999');
      assert.strictEqual(payload.assessmentId, undefined);
      assert.strictEqual(payload.studentId, undefined);
    });
  });

  describe('3. Client-Side AI Diagnostic Advisor', () => {
    it('diagnoses blur and low light', () => {
      const metrics: DocumentQualityMetrics = {
        brightness: 45, // < 65 => low ambient light
        contrast: 0.18,
        sharpness: 30,
        skewAngle: 2,
        cornersDetected: 4,
        shadowDetected: false,
        glareDetected: false,
        isQualityAcceptable: false,
        blurDetected: true,
      };

      const diagnostics = clientAiAdvisor.diagnoseQuality(metrics);
      const blurDiag = diagnostics.find((d) => d.category === 'blur');
      const lightDiag = diagnostics.find((d) => d.category === 'lighting');

      assert.ok(blurDiag, 'Expected blur diagnostic');
      assert.strictEqual(blurDiag?.level, 'warning');
      assert.ok(lightDiag, 'Expected lighting diagnostic');
      assert.strictEqual(lightDiag?.level, 'warning');
    });

    it('diagnoses missing corner fiducials and uneven shadows', () => {
      const metrics: DocumentQualityMetrics = {
        brightness: 120,
        contrast: 0.5,
        sharpness: 150,
        skewAngle: 8,
        cornersDetected: 2, // partial alignment
        shadowDetected: true, // shadow warning
        glareDetected: false,
        isQualityAcceptable: false,
        blurDetected: false,
      };

      const diagnostics = clientAiAdvisor.diagnoseQuality(metrics);
      const cornerDiag = diagnostics.find((d) => d.category === 'alignment');
      const shadowDiag = diagnostics.find((d) => d.id === 'shadow-detected');

      assert.ok(cornerDiag, 'Expected alignment diagnostic');
      assert.strictEqual(cornerDiag?.level, 'warning');
      assert.ok(shadowDiag, 'Expected shadow diagnostic');
      assert.strictEqual(shadowDiag?.level, 'warning');
    });

    it('advises ready to capture when all metrics are optimal', () => {
      const metrics: DocumentQualityMetrics = {
        brightness: 140,
        contrast: 0.65,
        sharpness: 220,
        skewAngle: 1,
        cornersDetected: 4,
        shadowDetected: false,
        glareDetected: false,
        isQualityAcceptable: true,
        blurDetected: false,
      };

      const advice = adviseOnQuality(metrics);
      assert.strictEqual(advice.readyToCapture, true);
      assert.match(advice.message, /ready/i);
    });

    it('diagnoses bubble mark anomalies and identifies low confidence items', () => {
      const items = [
        {
          itemNumber: 1,
          selectedChoice: 'A',
          state: 'MARKED',
          confidence: 0.95,
          scores: { A: 0.8, B: 0.05, C: 0.02, D: 0.01 },
        },
        {
          itemNumber: 2,
          selectedChoice: 'B',
          state: 'MULTIPLE_MARK',
          confidence: 0.45,
          scores: { A: 0.7, B: 0.72, C: 0.01, D: 0.02 },
        },
        {
          itemNumber: 3,
          selectedChoice: 'C',
          state: 'ERASED_MARK',
          confidence: 0.5,
          scores: { A: 0.05, B: 0.1, C: 0.4, D: 0.02 },
        },
      ];

      const diagnostics = clientAiAdvisor.diagnoseBubbles(items);
      const multiDiag = diagnostics.find((d) => d.id === 'omr-multiple-marks');
      const erasedDiag = diagnostics.find((d) => d.id === 'omr-erased-marks');

      assert.ok(multiDiag, 'Expected omr-multiple-marks diagnostic');
      assert.ok(erasedDiag, 'Expected omr-erased-marks diagnostic');
    });
  });
});
