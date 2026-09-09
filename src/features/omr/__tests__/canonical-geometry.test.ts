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
  describe('1. Item Count Variations & Dynamic Chunking', () => {
    const testCases = [
      { itemCount: 10, expectedBlocks: 1, expectedTotalRegions: 3 }, // STUDENT_INFO + ROLL_NUMBER + 1 block
      { itemCount: 20, expectedBlocks: 2, expectedTotalRegions: 4 },
      { itemCount: 50, expectedBlocks: 5, expectedTotalRegions: 7 },
      { itemCount: 60, expectedBlocks: 6, expectedTotalRegions: 8 },
      { itemCount: 63, expectedBlocks: 7, expectedTotalRegions: 9 },
      { itemCount: 70, expectedBlocks: 7, expectedTotalRegions: 9 },
      { itemCount: 90, expectedBlocks: 9, expectedTotalRegions: 11 },
    ];

    for (const tc of testCases) {
      it(`generates exactly ${tc.itemCount} items across ${tc.expectedBlocks} answer blocks`, () => {
        const geom = generateCanonicalGeometry({
          assessmentId: `test-${tc.itemCount}`,
          itemCount: tc.itemCount,
          classSize: 60,
        });

        assert.strictEqual(geom.config.itemCount, tc.itemCount);
        assert.strictEqual(geom.answerBlocks.length, tc.itemCount);

        const answerRegions = geom.regions.filter((r) => r.type === 'ANSWER_BLOCK');
        assert.strictEqual(answerRegions.length, tc.expectedBlocks);
        assert.strictEqual(geom.regions.length, tc.expectedTotalRegions);

        // Verify validation passes
        const val = validateCanonicalGeometry(geom);
        assert.strictEqual(val.valid, true, `Validation failed: ${val.errors.join(', ')}`);
      });
    }

    it('generates partial final block correctly with no fake questions (63 items)', () => {
      const geom = generateCanonicalGeometry({
        assessmentId: 'test-63',
        itemCount: 63,
        classSize: 60,
      });

      const answerRegions = geom.regions.filter((r) => r.type === 'ANSWER_BLOCK');
      assert.strictEqual(answerRegions.length, 7);

      // Blocks 1..6 have 10 items
      for (let i = 0; i < 6; i++) {
        assert.strictEqual(answerRegions[i].answerItems?.length, 10);
      }

      // Block 7 (ANSWERS_61_70) has EXACTLY 3 items (61, 62, 63)
      const finalRegion = answerRegions[6];
      assert.strictEqual(finalRegion.id, 'ANSWERS_61_70');
      assert.strictEqual(finalRegion.answerItems?.length, 3);
      assert.strictEqual(finalRegion.answerItems?.[0].itemNumber, 61);
      assert.strictEqual(finalRegion.answerItems?.[1].itemNumber, 62);
      assert.strictEqual(finalRegion.answerItems?.[2].itemNumber, 63);

      // Verify questions 64..70 do NOT exist
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

    it('all normalized bubble coordinates (u, v) lie strictly inside [0, 1]', () => {
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

      for (const roll of geom.rollNumberGrid) {
        assert.ok(roll.relativePosition.u >= 0 && roll.relativePosition.u <= 1, `Roll u=${roll.relativePosition.u} outside [0, 1]`);
        assert.ok(roll.relativePosition.v >= 0 && roll.relativePosition.v <= 1, `Roll v=${roll.relativePosition.v} outside [0, 1]`);
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

