/**
 * Project KIT — OMR Adapter & Engine Integration Test Suite
 * Validates canonical template creation, image preprocessing,
 * real-sheet optical scanning via homography, Roll Number decoding,
 * and engine fallback behavior.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { KitOmrAdapter, processOmrScan } from '../adapter';
import { NativeOpticalEngineAdapter } from '../engines/native-optical-engine';
import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { buildOmrCheckerTemplate, createKitOmrTemplate } from '../templates/template-builder';

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

describe('Project KIT — OMR Pipeline & Adapter Tests', () => {
  const geometry = generateCanonicalGeometry({
    assessmentId: 'canonical-assessment',
    itemCount: 60,
    classSize: 60,
  });
  const template = createKitOmrTemplate({ geometry });

  describe('1. Canonical Geometry & Template Specification', () => {
    it('creates standard canonical KIT template derived from geometry', () => {
      assert.strictEqual(template.targetItems, 60);
      assert.strictEqual(template.dimensions.width, 681);
      assert.strictEqual(template.dimensions.height, 880);
      assert.strictEqual(template.thresholds.markMinFill, 0.35);
      assert.strictEqual(template.thresholds.ambiguousDelta, 0.15);
      assert.strictEqual(template.thresholds.highConfidenceMin, 0.85);

      // Verify item grid coordinates derived from canonical geometry
      assert.strictEqual(template.itemGrid.length, 60);
      assert.strictEqual(template.itemGrid[0].bubbles['A'].x, 90);
      assert.strictEqual(template.itemGrid[0].bubbles['A'].y, 251);

      // Verify canonical geometry attachment
      assert.ok(template.canonicalGeometry);
      assert.strictEqual(template.canonicalGeometry?.rollNumberGrid.length, 60);
    });

    it('builds valid JSON template for @armghan3071/omrchecker from canonical geometry', () => {
      const checkerTpl = buildOmrCheckerTemplate(template);

      assert.deepStrictEqual(checkerTpl.pageDimensions, [681, 880]);
      assert.deepStrictEqual(checkerTpl.bubbleDimensions, [14, 14]);
      assert.strictEqual(checkerTpl.preProcessors[0].name, 'CropPage');

      // Verify fieldBlocks generated for answer blocks
      assert.ok(checkerTpl.fieldBlocks['ANSWERS_01_10']);
      assert.ok(checkerTpl.fieldBlocks['ANSWERS_11_20']);
      assert.ok(checkerTpl.fieldBlocks['ROLL_NUMBER']);
    });
  });

  describe('2. Optical Preprocessing & Corner Fiducial Metrics', () => {
    it('detects lighting and corners in simulated clean sheet buffer', () => {
      const width = 200;
      const height = 200;
      const pixels = new Uint8ClampedArray(width * height * 4);

      // Fill with white background
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = 240;
        pixels[i + 1] = 240;
        pixels[i + 2] = 240;
        pixels[i + 3] = 255;
      }

      // Add dark corner fiducials to the 4 corners
      const cornerSize = 24;
      const stampDarkCorner = (startX: number, startY: number) => {
        for (let y = startY; y < startY + cornerSize; y++) {
          for (let x = startX; x < startX + cornerSize; x++) {
            const idx = (y * width + x) * 4;
            pixels[idx] = 20;
            pixels[idx + 1] = 20;
            pixels[idx + 2] = 20;
          }
        }
      };

      stampDarkCorner(10, 10);
      stampDarkCorner(width - cornerSize - 10, 10);
      stampDarkCorner(10, height - cornerSize - 10);
      stampDarkCorner(width - cornerSize - 10, height - cornerSize - 10);

      const metrics = NativeOpticalEngineAdapter.evaluateImageMetrics(pixels, width, height);

      assert.strictEqual(metrics.cornerCount, 4);
      assert.strictEqual(metrics.markersDetected, true);
      assert.strictEqual(metrics.isLightingAcceptable, true);
      assert.ok(metrics.contrastRatio > 0.8);
    });

    it('flags poor lighting when image is excessively dark', () => {
      const width = 100;
      const height = 100;
      const darkPixels = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < darkPixels.length; i += 4) {
        darkPixels[i] = 20;
        darkPixels[i + 1] = 20;
        darkPixels[i + 2] = 20;
        darkPixels[i + 3] = 255;
      }

      const metrics = NativeOpticalEngineAdapter.evaluateImageMetrics(darkPixels, width, height);
      assert.strictEqual(metrics.isLightingAcceptable, false);
    });
  });

  describe('3. Real-Sheet Optical Mark Processing & Homography Sampling', () => {
    const engine = new NativeOpticalEngineAdapter();

    it('processes marked sheet and correctly extracts roll number and answers', async () => {
      const markedPath = path.join(FIXTURES_DIR, 'marked_60.png');
      const markedBytes = fs.readFileSync(markedPath);

      const result = await engine.process(markedBytes, template, {
        assessmentId: 'canonical-assessment',
      });

      assert.strictEqual(result.items.length, 60);
      assert.strictEqual(result.detectedRollNumber, 37);
      assert.strictEqual(result.fiducialDetected, true);

      // Verify specific marked answers: Q1=A, Q2=B, Q3=C, Q4=D
      assert.strictEqual(result.items[0].selectedChoice, 'A');
      assert.strictEqual(result.items[0].state, 'MARKED');
      assert.ok(result.items[0].scores['A'] > 0.7);

      assert.strictEqual(result.items[1].selectedChoice, 'B');
      assert.strictEqual(result.items[1].state, 'MARKED');
      assert.ok(result.items[1].scores['B'] > 0.7);

      assert.strictEqual(result.items[2].selectedChoice, 'C');
      assert.strictEqual(result.items[2].state, 'MARKED');
      assert.ok(result.items[2].scores['C'] > 0.7);

      assert.strictEqual(result.items[3].selectedChoice, 'D');
      assert.strictEqual(result.items[3].state, 'MARKED');
      assert.ok(result.items[3].scores['D'] > 0.7);

      // Verify subsequent unmarked items are BLANK
      assert.strictEqual(result.items[4].selectedChoice, null);
      assert.strictEqual(result.items[4].state, 'BLANK');
    });

    it('identifies partial 63-item assessment with exactly 3 items in final block', async () => {
      const g63 = generateCanonicalGeometry({
        assessmentId: 'test-63',
        itemCount: 63,
        classSize: 67,
      });
      const tpl63 = createKitOmrTemplate({ geometry: g63 });
      const sheet63Bytes = fs.readFileSync(path.join(FIXTURES_DIR, 'sheet_63.png'));

      const result = await engine.process(sheet63Bytes, tpl63);

      assert.strictEqual(result.items.length, 63);
      assert.strictEqual(result.items[62].itemNumber, 63);
      assert.strictEqual(result.items[63], undefined);
    });

    it('correctly throws error on empty input', async () => {
      await assert.rejects(
        async () => {
          await engine.process(new Uint8Array(0), template);
        },
        /Image payload is empty or invalid/
      );
    });
  });

  describe('4. Adapter Deduplication, Fallback & Idempotency Guarantee', () => {
    it('produces identical SHA-256 hash for identical image bytes', async () => {
      const engine = new NativeOpticalEngineAdapter();
      const markedPath = path.join(FIXTURES_DIR, 'marked_60.png');
      const markedBytes = fs.readFileSync(markedPath);

      const res1 = await engine.process(markedBytes, template);
      const res2 = await engine.process(markedBytes, template);

      assert.strictEqual(res1.imageHash, res2.imageHash);
      assert.deepStrictEqual(res1.rawAnswers, res2.rawAnswers);
      assert.strictEqual(res1.detectedRollNumber, res2.detectedRollNumber);
    });

    it('KitOmrAdapter falls back to native optical engine in non-browser environment', async () => {
      const adapter = new KitOmrAdapter();
      const markedPath = path.join(FIXTURES_DIR, 'marked_60.png');
      const markedBytes = fs.readFileSync(markedPath);

      const result = await adapter.processScan(markedBytes, template);

      assert.strictEqual(result.engineUsed, 'kit-optical-native');
      assert.strictEqual(result.items.length, 60);
      assert.strictEqual(result.detectedRollNumber, 37);
      assert.strictEqual(result.items[0].selectedChoice, 'A');
    });

    it('KitOmrAdapter respects forceEngine option', async () => {
      const markedPath = path.join(FIXTURES_DIR, 'marked_60.png');
      const markedBytes = fs.readFileSync(markedPath);

      const result = await processOmrScan(markedBytes, template, {
        forceEngine: 'kit-optical-native',
      });

      assert.strictEqual(result.engineUsed, 'kit-optical-native');
      assert.strictEqual(result.items.length, 60);
      assert.strictEqual(result.items[0].selectedChoice, 'A');
    });
  });
});
