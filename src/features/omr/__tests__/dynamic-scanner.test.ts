/**
 * Project KIT — Dynamic OMR Scanner & Pipeline Integration Tests
 * Validates dynamic rasterized sheets, marker-first homography, roll-number decoding,
 * rotated sheets, marker failures, and geometry/SVG parity.
 */

import assert from 'node:assert';
import { execSync } from 'node:child_process';
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

      // Verify each roll number bubble is present with exact coordinates
      for (const target of geom.rollNumberGrid) {
        assert.ok(
          svg.includes(`cx="${target.canonicalCenter.x}" cy="${target.canonicalCenter.y}"`),
          `Roll target ${target.rollNumber} rendered coordinates mismatch`
        );
      }
    });
  });

  describe('2. End-to-End Dynamic Sheet Scanning (Synthetic Raster Validation)', () => {
    it('scans a 60-item sheet, detecting roll number 37 and answers Q1=A, Q2=B, Q3=C, Q4=D', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-60-scan',
        itemCount: 60,
        classSize: 60,
      });

      let svg = renderOmrMasterSvg(geom);

      // Mark Roll Number 37
      const roll37 = geom.rollNumberGrid.find((t) => t.rollNumber === 37);
      assert.ok(roll37);

      // Mark Q1=A, Q2=B, Q3=C, Q4=D
      const q1A = geom.answerBlocks[0].choices.find((c) => c.choice === 'A');
      const q2B = geom.answerBlocks[1].choices.find((c) => c.choice === 'B');
      const q3C = geom.answerBlocks[2].choices.find((c) => c.choice === 'C');
      const q4D = geom.answerBlocks[3].choices.find((c) => c.choice === 'D');

      svg = svg.replace('</svg>', '');
      svg += `  <circle cx="${roll37.canonicalCenter.x}" cy="${roll37.canonicalCenter.y}" r="5.5" fill="#111827"/>\n`;
      svg += `  <circle cx="${q1A?.canonicalCenter.x}" cy="${q1A?.canonicalCenter.y}" r="6" fill="#111827"/>\n`;
      svg += `  <circle cx="${q2B?.canonicalCenter.x}" cy="${q2B?.canonicalCenter.y}" r="6" fill="#111827"/>\n`;
      svg += `  <circle cx="${q3C?.canonicalCenter.x}" cy="${q3C?.canonicalCenter.y}" r="6" fill="#111827"/>\n`;
      svg += `  <circle cx="${q4D?.canonicalCenter.x}" cy="${q4D?.canonicalCenter.y}" r="6" fill="#111827"/>\n`;
      svg += '</svg>';

      const svgPath = path.join(SCRATCH_DIR, 'marked_60.svg');
      const pngPath = path.join(SCRATCH_DIR, 'marked_60.png');
      fs.writeFileSync(svgPath, svg);
      execSync(`rsvg-convert ${svgPath} -o ${pngPath}`);

      const template = createKitOmrTemplate({ geometry: geom });
      const pngBytes = fs.readFileSync(pngPath);

      const result = await engine.process(pngBytes, template);

      assert.strictEqual(result.items.length, 60);
      assert.strictEqual(result.detectedRollNumber, 37);
      assert.strictEqual(result.fiducialDetected, true);

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

      // Subsequent items should be blank
      assert.strictEqual(result.items[4].selectedChoice, null);
      assert.strictEqual(result.items[4].state, 'BLANK');
    });

    it('scans a 63-item assessment, verifying exactly 63 items and 3 items in final block', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-63-scan',
        itemCount: 63,
        classSize: 67,
      });

      const svg = renderOmrMasterSvg(geom);
      const svgPath = path.join(SCRATCH_DIR, 'sheet_63.svg');
      const pngPath = path.join(SCRATCH_DIR, 'sheet_63.png');
      fs.writeFileSync(svgPath, svg);
      execSync(`rsvg-convert ${svgPath} -o ${pngPath}`);

      const template = createKitOmrTemplate({ geometry: geom });
      const pngBytes = fs.readFileSync(pngPath);

      const result = await engine.process(pngBytes, template);

      assert.strictEqual(result.items.length, 63);
      assert.strictEqual(result.items[62].itemNumber, 63);
      assert.strictEqual(result.items[63], undefined);
    });
  });

  describe('3. Marker Distortion, Rotation & Translation Robustness', () => {
    it('recovers coordinates and extracts correct answers on a rotated and translated sheet', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-rotated',
        itemCount: 60,
        classSize: 60,
      });

      const sourcePng = path.join(SCRATCH_DIR, 'marked_60.png');
      const rotatedPng = path.join(SCRATCH_DIR, 'rotated_60.png');

      // Rotate by 1.2 degrees and translate slightly
      execSync(`convert ${sourcePng} -background white -rotate 1.2 -crop 681x880+5+5 ${rotatedPng}`);

      const template = createKitOmrTemplate({ geometry: geom });
      const pngBytes = fs.readFileSync(rotatedPng);

      const result = await engine.process(pngBytes, template);

      assert.strictEqual(result.fiducialDetected, true);
      assert.strictEqual(result.detectedRollNumber, 37);
      assert.strictEqual(result.items[0].selectedChoice, 'A');
      assert.strictEqual(result.items[1].selectedChoice, 'B');
      assert.strictEqual(result.items[2].selectedChoice, 'C');
      assert.strictEqual(result.items[3].selectedChoice, 'D');
    });

    it('rejects with VERIFICATION_REQUIRED when a required region marker is missing', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-missing-marker',
        itemCount: 60,
        classSize: 60,
      });

      const sourcePng = path.join(SCRATCH_DIR, 'marked_60.png');
      const png = PNG.sync.read(fs.readFileSync(sourcePng));

      // White out ANSWERS_01_10.TL marker (x: 40..54, y: 215..229)
      for (let y = 215; y < 235; y++) {
        for (let x = 40; x < 60; x++) {
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
      assert.strictEqual(result.failedRegion?.regionId, 'ANSWERS_01_10');
      assert.strictEqual(result.failedRegion?.expectedMarkerCount, 4);
      assert.ok(result.failedRegion?.reason.includes('ANSWERS_01_10.TL'));
    });
  });

  describe('4. Ambiguity, Multiple Marks & Roll Number Robustness', () => {
    it('detects multiple marked roll numbers and flags for verification', async () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-multi-roll',
        itemCount: 20,
        classSize: 60,
      });

      let svg = renderOmrMasterSvg(geom);
      const roll10 = geom.rollNumberGrid.find((t) => t.rollNumber === 10);
      const roll20 = geom.rollNumberGrid.find((t) => t.rollNumber === 20);

      svg = svg.replace('</svg>', '');
      svg += `  <circle cx="${roll10?.canonicalCenter.x}" cy="${roll10?.canonicalCenter.y}" r="5.5" fill="#111827"/>\n`;
      svg += `  <circle cx="${roll20?.canonicalCenter.x}" cy="${roll20?.canonicalCenter.y}" r="5.5" fill="#111827"/>\n`;
      svg += '</svg>';

      const svgPath = path.join(SCRATCH_DIR, 'multi_roll.svg');
      const pngPath = path.join(SCRATCH_DIR, 'multi_roll.png');
      fs.writeFileSync(svgPath, svg);
      execSync(`rsvg-convert ${svgPath} -o ${pngPath}`);

      const template = createKitOmrTemplate({ geometry: geom });
      const result = await engine.process(fs.readFileSync(pngPath), template);

      assert.strictEqual(result.detectedRollNumber, null);
      assert.strictEqual(result.hasMultipleMarks, true);
      assert.strictEqual(result.status, 'VERIFICATION_REQUIRED');
    });
  });
});

