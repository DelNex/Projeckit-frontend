/**
 * Project KIT — Canonical OMR Geometry Unit Tests
 * Validates dynamic item counts (10, 20, 50, 60, 63, 70, 90),
 * class sizes (1, 10, 60, 63, 67, 70), boundary constraints,
 * zero fake questions, zero invalid roll targets, and 4 markers per region.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { validateCanonicalGeometry } from '../geometry/geometry-validator';

describe('Project KIT — Canonical Geometry Engine Tests', () => {
  describe('1. Item Count Variations & Dynamic Columns', () => {
    const testCases = [
      { itemCount: 10, expectedCols: 2, expectedRowsPerCol: 5 },
      { itemCount: 20, expectedCols: 2, expectedRowsPerCol: 10 },
      { itemCount: 50, expectedCols: 2, expectedRowsPerCol: 25 },
      { itemCount: 60, expectedCols: 3, expectedRowsPerCol: 20 },
      { itemCount: 63, expectedCols: 3, expectedRowsPerCol: 21 },
      { itemCount: 70, expectedCols: 3, expectedRowsPerCol: 24 },
      { itemCount: 90, expectedCols: 3, expectedRowsPerCol: 30 },
    ];

    for (const tc of testCases) {
      it(`generates exactly ${tc.itemCount} items in single answer area with ${tc.expectedCols} columns`, () => {
        const geom = generateCanonicalGeometry({
          assessmentId: `test-${tc.itemCount}`,
          itemCount: tc.itemCount,
          classSize: 60,
        });

        assert.strictEqual(geom.config.itemCount, tc.itemCount);
        assert.strictEqual(geom.answerBlocks.length, tc.itemCount);

        // Single rectangular answer area with 4 corner markers
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

        // Verify validation passes
        const val = validateCanonicalGeometry(geom);
        assert.strictEqual(val.valid, true, `Validation failed: ${val.errors.join(', ')}`);
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

  describe('2. Class Size & Roll Number Grid Variations', () => {
    const classSizeCases = [1, 10, 60, 63, 67, 70];

    for (const size of classSizeCases) {
      it(`generates exactly ${size} valid roll-number targets for classSize=${size}`, () => {
        const geom = generateCanonicalGeometry({
          assessmentId: `test-class-${size}`,
          itemCount: 50,
          classSize: size,
        });

        assert.strictEqual(geom.rollNumberGrid.length, size);
        assert.strictEqual(geom.config.classSize, size);

        // Verify all roll numbers 1..size are accounted for exactly once
        const rollNums = geom.rollNumberGrid.map((t) => t.rollNumber);
        for (let k = 1; k <= size; k++) {
          assert.ok(rollNums.includes(k), `Missing expected roll number ${k}`);
        }

        // Verify no roll numbers beyond size exist
        const invalidTarget = geom.rollNumberGrid.find((t) => t.rollNumber > size);
        assert.strictEqual(invalidTarget, undefined, `Found invalid target beyond classSize: ${invalidTarget?.rollNumber}`);
      });
    }

    it('classSize=67 populates exactly 7 items in row 7 and excludes cells 68-70', () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-67',
        itemCount: 50,
        classSize: 67,
      });

      assert.strictEqual(geom.rollNumberGrid.length, 67);

      // Row 7 (index 6) targets:
      const row7Targets = geom.rollNumberGrid.filter((t) => t.row === 6);
      assert.strictEqual(row7Targets.length, 7); // 61..67

      const target67 = geom.rollNumberGrid.find((t) => t.rollNumber === 67);
      assert.ok(target67);
      assert.strictEqual(target67?.row, 6);
      assert.strictEqual(target67?.col, 7);

      const target68 = geom.rollNumberGrid.find((t) => t.rollNumber === 68);
      assert.strictEqual(target68, undefined, 'Cell 68 must not be generated');
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

      // Roll numbers are located in the header zone outside the 4-marker frame (u in [0, 1], v < 0)
      for (const roll of geom.rollNumberGrid) {
        assert.ok(roll.relativePosition.u >= 0 && roll.relativePosition.u <= 1, `Roll u=${roll.relativePosition.u} outside [0, 1]`);
        assert.ok(roll.relativePosition.v < 0, `Roll v=${roll.relativePosition.v} should be in header zone (v < 0)`);
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

