/**
 * Project KIT — Dynamic OMR Scanner & Pipeline Integration Tests
 * Validates dynamic rasterized sheets, marker-first homography, answers decoding,
 * rotated sheets, marker failures, and legacy roll-number backwards compatibility.
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PNG } from 'pngjs';
import { NativeOpticalEngineAdapter } from '../engines/native-optical-engine';
import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { renderOmrMasterSvg } from '../rendering/svg-renderer';
import { createKitOmrTemplate } from '../templates/template-builder';

const SCRATCH_DIR = path.join(__dirname, 'fixtures');

describe('Project KIT — Dynamic OMR Scanner Integration Tests', () => {
  const engine = new NativeOpticalEngineAdapter();

  describe('1. SVG Rendering & Canonical Geometry Parity', () => {
    it('verifies that SVG rendered markers and bubble positions match canonical geometry exactly', () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'parity-test',
        itemCount: 63,
        classSize: 67,
      });

      const svg = renderOmrMasterSvg(geom);

      // Verify each marker is present in SVG with exact canonical bounds
      for (const marker of geom.markers) {
        assert.ok(svg.includes(`id="${marker.id}"`), `Marker ${marker.id} not found in SVG`);
        assert.ok(
          svg.includes(`x="${marker.bounds.x}" y="${marker.bounds.y}"`),
          `Marker ${marker.id} rendered coordinates mismatch`
        );
      }

      // Verify each answer bubble is present in SVG with exact canonical coordinates
      for (const item of geom.answerBlocks) {
        for (const choice of item.choices) {
          assert.ok(
            svg.includes(`cx="${choice.canonicalCenter.x}" cy="${choice.canonicalCenter.y}"`),
            `Choice bubble ${item.itemNumber}${choice.choice} rendered coordinates mismatch`
          );
        }
      }
    });
  });

  describe('2. End-to-End Dynamic Sheet Scanning (Synthetic Raster Validation)', () => {
    it('scans a 60-item sheet, detecting answers Q1=A, Q2=B, Q3=C, Q4=D and blank remaining items', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-60-scan',
        itemCount: 60,
        classSize: 60,
      });

      const template = createKitOmrTemplate({ geometry: geom });
      const pngBytes = fs.readFileSync(path.join(SCRATCH_DIR, 'marked_60.png'));

      const result = await engine.process(pngBytes, template);

      assert.strictEqual(result.items.length, 60);
      assert.strictEqual(result.fiducialDetected, true);

      assert.strictEqual(result.items[0].selectedChoice, 'A');
      assert.strictEqual(result.items[0].state, 'MARKED');
      assert.ok(result.items[0].scores['A'] > 0.5);

      assert.strictEqual(result.items[1].selectedChoice, 'B');
      assert.strictEqual(result.items[1].state, 'MARKED');
      assert.ok(result.items[1].scores['B'] > 0.5);

      assert.strictEqual(result.items[2].selectedChoice, 'C');
      assert.strictEqual(result.items[2].state, 'MARKED');
      assert.ok(result.items[2].scores['C'] > 0.5);

      assert.strictEqual(result.items[3].selectedChoice, 'D');
      assert.strictEqual(result.items[3].state, 'MARKED');
      assert.ok(result.items[3].scores['D'] > 0.5);

      // Subsequent items should be blank
      assert.strictEqual(result.items[4].selectedChoice, null);
      assert.strictEqual(result.items[4].state, 'BLANK');
    });

    it('never accepts the strongest bubble when a second answer bubble is also clearly filled', async (t) => {
      const sourcePath = path.join(SCRATCH_DIR, 'marked_60.png');
      if (!fs.existsSync(sourcePath)) {
        t.skip('Skipping: source fixture marked_60.png not found');
        return;
      }

      const geom = generateCanonicalGeometry({
        assessmentId: 'test-double-mark',
        itemCount: 60,
        classSize: 60,
      });
      const png = PNG.sync.read(fs.readFileSync(sourcePath));
      const secondChoice = geom.answerBlocks[0].choices.find((choice) => choice.choice === 'B');
      assert.ok(secondChoice, 'Q1 B bubble must exist in canonical geometry');

      // Q1 A is already filled in marked_60.png. Fill Q1 B as well to
      // reproduce a double mark where one bubble can be darker than the other.
      // Fixtures may be rendered above canonical page resolution.
      const scaleX = png.width / geom.page.width;
      const scaleY = png.height / geom.page.height;
      const centerX = secondChoice.canonicalCenter.x * scaleX;
      const centerY = secondChoice.canonicalCenter.y * scaleY;
      const radius = secondChoice.radius * Math.min(scaleX, scaleY) * 0.58;
      for (let y = Math.max(0, Math.floor(centerY - radius)); y <= Math.min(png.height - 1, Math.ceil(centerY + radius)); y++) {
        for (let x = Math.max(0, Math.floor(centerX - radius)); x <= Math.min(png.width - 1, Math.ceil(centerX + radius)); x++) {
          if ((x - centerX) ** 2 + (y - centerY) ** 2 > radius ** 2) continue;
          const index = (y * png.width + x) * 4;
          png.data[index] = 0;
          png.data[index + 1] = 0;
          png.data[index + 2] = 0;
          png.data[index + 3] = 255;
        }
      }

      const result = await engine.process(PNG.sync.write(png), createKitOmrTemplate({ geometry: geom }));
      assert.strictEqual(result.items[0].selectedChoice, null);
      assert.strictEqual(result.items[0].state, 'MULTIPLE_MARK');
      assert.strictEqual(result.hasMultipleMarks, true);
      assert.strictEqual(result.status, 'VERIFICATION_REQUIRED');
    });

    it('scans a 63-item assessment, verifying exactly 63 items and 3 items in final block', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-63-scan',
        itemCount: 63,
        classSize: 67,
      });

      const template = createKitOmrTemplate({ geometry: geom });
      const pngBytes = fs.readFileSync(path.join(SCRATCH_DIR, 'sheet_63.png'));

      const result = await engine.process(pngBytes, template);

      assert.strictEqual(result.items.length, 63);
      assert.strictEqual(result.items[62].itemNumber, 63);
      assert.strictEqual(result.items[63], undefined);
    });
  });

  describe('3. Marker Distortion, Rotation & Translation Robustness', () => {
    it('recovers coordinates and extracts correct answers on a rotated and translated sheet', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-60-scan',
        itemCount: 60,
        classSize: 60,
      });

      const rotatedPng = path.join(SCRATCH_DIR, 'rotated_60.png');

      const template = createKitOmrTemplate({ geometry: geom });
      const pngBytes = fs.readFileSync(rotatedPng);

      const result = await engine.process(pngBytes, template);

      assert.strictEqual(result.fiducialDetected, true);
      assert.strictEqual(result.items[0].selectedChoice, 'A');
      assert.strictEqual(result.items[1].selectedChoice, 'B');
      assert.strictEqual(result.items[2].selectedChoice, 'C');
      assert.strictEqual(result.items[3].selectedChoice, 'D');
    });

    it('detects markers when a portrait sheet is centered in a wider phone frame', async (t) => {
      const sourcePng = path.join(SCRATCH_DIR, 'marked_60.png');
      if (!fs.existsSync(sourcePng)) {
        t.skip('Skipping: source fixture marked_60.png not found');
        return;
      }

      const source = PNG.sync.read(fs.readFileSync(sourcePng));
      const padded = new PNG({ width: 1280, height: source.height });
      padded.data.fill(255);
      for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
          const sourceIndex = (y * source.width + x) * 4;
          const targetIndex = (y * padded.width + x + 360) * 4;
          padded.data[targetIndex] = source.data[sourceIndex];
          padded.data[targetIndex + 1] = source.data[sourceIndex + 1];
          padded.data[targetIndex + 2] = source.data[sourceIndex + 2];
          padded.data[targetIndex + 3] = source.data[sourceIndex + 3];
        }
      }

      const geom = generateCanonicalGeometry({
        assessmentId: 'test-60-scan',
        itemCount: 60,
        classSize: 60,
      });
      const result = await engine.process(PNG.sync.write(padded), createKitOmrTemplate({ geometry: geom }));

      assert.strictEqual(result.fiducialDetected, true);
      assert.strictEqual(result.items[0].selectedChoice, 'A');
      assert.strictEqual(result.items[1].selectedChoice, 'B');
      assert.strictEqual(result.items[2].selectedChoice, 'C');
      assert.strictEqual(result.items[3].selectedChoice, 'D');
    });

    it('rejects with VERIFICATION_REQUIRED when a required region marker is missing', async (t) => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-missing-marker',
        itemCount: 60,
        classSize: 60,
      });

      const sourcePng = path.join(SCRATCH_DIR, 'marked_60.png');
      if (!fs.existsSync(sourcePng)) {
        t.skip('Skipping: source fixture marked_60.png not found');
        return;
      }
      const png = PNG.sync.read(fs.readFileSync(sourcePng));

      // White out ANSWERS.TL marker
      const tl = geom.markerMap['ANSWERS.TL'];
      const xStart = Math.max(0, Math.floor(tl.bounds.x - 2));
      const xEnd = Math.min(png.width, Math.ceil(tl.bounds.x + tl.bounds.width + 2));
      const yStart = Math.max(0, Math.floor(tl.bounds.y - 2));
      const yEnd = Math.min(png.height, Math.ceil(tl.bounds.y + tl.bounds.height + 2));

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const idx = (y * png.width + x) * 4;
          png.data[idx] = 255;
          png.data[idx + 1] = 255;
          png.data[idx + 2] = 255;
        }
      }

      const damagedBuffer = PNG.sync.write(png);
      const template = createKitOmrTemplate({ geometry: geom });

      const result = await engine.process(damagedBuffer, template);

      assert.strictEqual(result.status, 'VERIFICATION_REQUIRED');
      assert.strictEqual(result.errorCode, 'REGION_MARKER_DETECTION_FAILED');
      assert.ok(result.failedRegion !== undefined);
      assert.strictEqual(result.failedRegion?.regionId, 'ANSWERS');
      assert.strictEqual(result.failedRegion?.expectedMarkerCount, 4);
      assert.ok(result.failedRegion?.reason.includes('ANSWERS.TL'));
      // A partial marker set must never be used to produce guessed bubble coordinates.
      assert.strictEqual(result.items.length, 0);
      assert.deepStrictEqual(result.normalizedAnswers, []);
      assert.strictEqual(result.fiducialDetected, false);
    });
  });

  describe('4. Legacy Roll Number Regression & Multiple Marks', () => {
    it('legacy regression test: correctly decodes roll number 37 on older template with roll grid', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-legacy-roll',
        itemCount: 60,
        classSize: 60,
        includeRollNumberGrid: true,
      } as any);

      const template = createKitOmrTemplate({ geometry: geom });
      const pngBytes = fs.readFileSync(path.join(SCRATCH_DIR, 'legacy_roll.png'));
      const result = await engine.process(pngBytes, template);

      assert.strictEqual(result.detectedRollNumber, 37);
      assert.strictEqual(result.items[0].selectedChoice, 'A');
    });

    it('detects multiple marked roll numbers on legacy template and flags for verification', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-multi-roll',
        itemCount: 20,
        classSize: 60,
        includeRollNumberGrid: true,
      } as any);

      const template = createKitOmrTemplate({ geometry: geom });
      const result = await engine.process(fs.readFileSync(path.join(SCRATCH_DIR, 'multi_roll.png')), template);

      assert.strictEqual(result.detectedRollNumber, null);
      assert.strictEqual(result.hasMultipleMarks, true);
      assert.strictEqual(result.status, 'VERIFICATION_REQUIRED');
    });
  });
});
