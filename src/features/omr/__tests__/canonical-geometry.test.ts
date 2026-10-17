/**
 * Project KIT — Canonical OMR Geometry Unit Tests
 * Validates dynamic item counts (10, 30, 40, 41, 60, 61, 90),
 * HALF (A5) and FULL (A4) sheet formats, bubble radii (>= 7.0 half, >= 8.0 full),
 * row pitches (>= 19.0 half, >= 20.0 full), bottom margin <= 3%,
 * roll-number grid removal on new sheets, and legacy regression compatibility.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { validateCanonicalGeometry } from '../geometry/geometry-validator';

describe('Project KIT — Canonical Geometry Engine Tests', () => {
  describe('1. Item Count Variations, Sheet Formats & Dynamic Layout', () => {
    const testCases = [
      { itemCount: 10, expectedCols: 2, expectedRowsPerCol: 5, expectedFormat: 'HALF' as const, minRadius: 7.0, minPitch: 19.0 },
      { itemCount: 30, expectedCols: 2, expectedRowsPerCol: 15, expectedFormat: 'HALF' as const, minRadius: 7.0, minPitch: 19.0 },
      { itemCount: 40, expectedCols: 2, expectedRowsPerCol: 20, expectedFormat: 'HALF' as const, minRadius: 7.0, minPitch: 19.0 },
      { itemCount: 41, expectedCols: 3, expectedRowsPerCol: 14, expectedFormat: 'HALF' as const, minRadius: 7.0, minPitch: 19.0 },
      { itemCount: 60, expectedCols: 3, expectedRowsPerCol: 20, expectedFormat: 'HALF' as const, minRadius: 7.0, minPitch: 19.0 },
      { itemCount: 61, expectedCols: 3, expectedRowsPerCol: 21, expectedFormat: 'FULL' as const, minRadius: 8.0, minPitch: 20.0 },
      { itemCount: 90, expectedCols: 3, expectedRowsPerCol: 30, expectedFormat: 'FULL' as const, minRadius: 8.0, minPitch: 20.0 },
    ];

    for (const tc of testCases) {
      it(`generates exactly ${tc.itemCount} items: format=${tc.expectedFormat}, cols=${tc.expectedCols}, bottomGap<=3%`, () => {
        const geom = generateCanonicalGeometry({
          assessmentId: `test-${tc.itemCount}`,
          itemCount: tc.itemCount,
          classSize: 60,
        });

        assert.strictEqual(geom.config.itemCount, tc.itemCount);
        assert.strictEqual(geom.answerBlocks.length, tc.itemCount);
        assert.strictEqual(geom.sheetFormat, tc.expectedFormat);
        assert.strictEqual(geom.layout.sheetFormat, tc.expectedFormat);

        // Verify page dimensions
        if (tc.expectedFormat === 'HALF') {
          assert.strictEqual(geom.page.width, 559);
          assert.strictEqual(geom.page.height, 794);
        } else {
          assert.strictEqual(geom.page.width, 794);
          assert.strictEqual(geom.page.height, 1123);
        }

        // Single rectangular answer area with exactly 4 corner markers
        const answerRegions = geom.regions.filter((r) => r.type === 'ANSWER_BLOCK');
        assert.strictEqual(answerRegions.length, 1);
        assert.strictEqual(geom.regions.length, 1);
        assert.strictEqual(answerRegions[0].id, 'ANSWERS');
        assert.strictEqual(answerRegions[0].answerItems?.length, tc.itemCount);

        // Verify column distribution
        const rowsPerCol = tc.expectedRowsPerCol;
        const firstColLastItem = geom.answerBlocks[rowsPerCol - 1];
        assert.strictEqual(firstColLastItem.itemNumber, rowsPerCol);

        if (tc.itemCount > rowsPerCol) {
          const secondColFirstItem = geom.answerBlocks[rowsPerCol];
          assert.strictEqual(secondColFirstItem.itemNumber, rowsPerCol + 1);
          assert.ok(
            secondColFirstItem.choices[0].canonicalCenter.x > firstColLastItem.choices[0].canonicalCenter.x,
            'Column 2 items must be to the right of Column 1'
          );
        }

        // Scanner safety minimums
        assert.ok(
          geom.layout.answerArea.bubbleRadius >= tc.minRadius - 0.05,
          `bubbleRadius ${geom.layout.answerArea.bubbleRadius} must be >= ${tc.minRadius}`
        );
        assert.ok(
          geom.layout.answerArea.rowPitch >= tc.minPitch - 0.05,
          `rowPitch ${geom.layout.answerArea.rowPitch} must be >= ${tc.minPitch}`
        );

        // Validation passes
        const val = validateCanonicalGeometry(geom);
        assert.strictEqual(val.valid, true, `Validation failed: ${val.errors.join(', ')}`);

        // Bottom margin empty paper constraint: must never leave more than 3% empty below markers
        assert.ok(
          val.metrics.bottomGapPercent <= 3.01,
          `Bottom gap ${val.metrics.bottomGapPercent}% exceeds 3% maximum empty space`
        );
      });
    }

    it('generates 3 columns for 63 items with exactly 21 rows per column and no fake questions', () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-63',
        itemCount: 63,
        classSize: 60,
      });

      const answerRegions = geom.regions.filter((r) => r.type === 'ANSWER_BLOCK');
      assert.strictEqual(answerRegions.length, 1);
      assert.strictEqual(answerRegions[0].answerItems?.length, 63);

      // Verify column boundaries: 21 rows per col
      // Col 1: items 1..21
      assert.strictEqual(geom.answerBlocks[0].itemNumber, 1);
      assert.strictEqual(geom.answerBlocks[20].itemNumber, 21);
      // Col 2: items 22..42
      assert.strictEqual(geom.answerBlocks[21].itemNumber, 22);
      assert.strictEqual(geom.answerBlocks[41].itemNumber, 42);
      // Col 3: items 43..63
      assert.strictEqual(geom.answerBlocks[42].itemNumber, 43);
      assert.strictEqual(geom.answerBlocks[62].itemNumber, 63);

      // Verify questions 64..90 do NOT exist
      const q64 = geom.answerBlocks.find((b) => b.itemNumber === 64);
      assert.strictEqual(q64, undefined, 'Fake question 64 must not exist');
    });

    it('enforces single-page capacity limit and throws CONFIGURATION_ERROR for >90 items', () => {
      assert.throws(
        () => {
          generateCanonicalGeometry({
            assessmentId: 'test-overflow',
            itemCount: 91,
            classSize: 60,
          });
        },
        /CONFIGURATION_ERROR: EXCEEDS_PAGE_CAPACITY/
      );
    });
  });

  describe('2. Roll Number Removal & Legacy Compatibility', () => {
    it('removes roll-number bubbles on new v3 geometry (empty grid)', () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-v3-no-roll',
        itemCount: 50,
        classSize: 60,
      });

      assert.strictEqual(geom.rollNumberGrid.length, 0);
      const val = validateCanonicalGeometry(geom);
      assert.strictEqual(val.valid, true);
    });

    it('legacy regression test: generates valid roll targets when includeRollNumberGrid=true', () => {
      const sizeCases = [10, 60, 67];
      for (const size of sizeCases) {
        const geom = generateCanonicalGeometry({
          assessmentId: `test-legacy-${size}`,
          itemCount: 50,
          classSize: size,
          includeRollNumberGrid: true,
        } as any);

        assert.strictEqual(geom.rollNumberGrid.length, size);
        assert.strictEqual(geom.config.classSize, size);

        // Verify all roll numbers 1..size are accounted for exactly once
        const rollNums = geom.rollNumberGrid.map((t) => t.rollNumber);
        for (let k = 1; k <= size; k++) {
          assert.ok(rollNums.includes(k), `Missing expected roll number ${k}`);
        }

        const val = validateCanonicalGeometry(geom);
        assert.strictEqual(val.valid, true);
      }
    });

    it('rejects invalid class sizes <1 or >70', () => {
      assert.throws(() => {
        generateCanonicalGeometry({ assessmentId: 'test', itemCount: 50, classSize: 0 });
      }, /Invalid classSize/);

      assert.throws(() => {
        generateCanonicalGeometry({ assessmentId: 'test', itemCount: 50, classSize: 71 });
      }, /Invalid classSize/);
    });
  });

  describe('3. Reference Marker Invariants & Topology', () => {
    it('every region has exactly 4 physical square reference markers', () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-markers',
        itemCount: 60,
        classSize: 60,
      });

      for (const region of geom.regions) {
        const { TL, TR, BL, BR } = region.markers;
        assert.ok(TL, `Region ${region.id} missing TL marker`);
        assert.ok(TR, `Region ${region.id} missing TR marker`);
        assert.ok(BL, `Region ${region.id} missing BL marker`);
        assert.ok(BR, `Region ${region.id} missing BR marker`);

        assert.strictEqual(TL.id, `${region.id}.TL`);
        assert.strictEqual(TR.id, `${region.id}.TR`);
        assert.strictEqual(BL.id, `${region.id}.BL`);
        assert.strictEqual(BR.id, `${region.id}.BR`);

        assert.strictEqual(TL.size, 14);
        assert.strictEqual(TL.bounds.width, TL.bounds.height);

        // Relative geometry check
        assert.ok(TR.center.x > TL.center.x, `TR (${TR.center.x}) must be right of TL (${TL.center.x})`);
        assert.ok(BL.center.y > TL.center.y, `BL (${BL.center.y}) must be below TL (${TL.center.y})`);
        assert.ok(BR.center.x > BL.center.x, `BR (${BR.center.x}) must be right of BL (${BL.center.x})`);
        assert.ok(BR.center.y > TR.center.y, `BR (${BR.center.y}) must be below TR (${TR.center.y})`);
      }
    });

    it('all normalized answer bubble coordinates (u, v) lie strictly inside [0, 1]', () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-uv',
        itemCount: 63,
        classSize: 67,
      });

      for (const item of geom.answerBlocks) {
        for (const choice of item.choices) {
          assert.ok(choice.relativePosition.u >= 0 && choice.relativePosition.u <= 1, `u=${choice.relativePosition.u} outside [0, 1]`);
          assert.ok(choice.relativePosition.v >= 0 && choice.relativePosition.v <= 1, `v=${choice.relativePosition.v} outside [0, 1]`);
        }
      }
    });
  });

  describe('4. Configurable Choices', () => {
    it('supports 5-choice assessments (A, B, C, D, E)', () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-5choices',
        itemCount: 20,
        classSize: 60,
        choices: ['A', 'B', 'C', 'D', 'E'],
      });

      assert.strictEqual(geom.config.choices.length, 5);
      for (const item of geom.answerBlocks) {
        assert.strictEqual(item.choices.length, 5);
        assert.deepStrictEqual(item.choices.map((c) => c.choice), ['A', 'B', 'C', 'D', 'E']);
      }
    });
  });
});
