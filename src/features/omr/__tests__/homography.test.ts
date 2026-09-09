/**
 * Project KIT — Projective Homography Unit Tests
 * Validates perspective warping, affine scaling, rotation, and singularity handling.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { ProjectiveHomography } from '../engines/homography';

describe('Project KIT — Projective Homography Tests', () => {
  it('maps unit square corners exactly to a target rectangular quad', () => {
    const quad = {
      TL: { x: 40, y: 100 },
      TR: { x: 240, y: 100 },
      BL: { x: 40, y: 300 },
      BR: { x: 240, y: 300 },
    };

    const H = ProjectiveHomography.fromUnitSquareToQuad(quad);

    const pTL = H.transformPoint(0, 0);
    const pTR = H.transformPoint(1, 0);
    const pBL = H.transformPoint(0, 1);
    const pBR = H.transformPoint(1, 1);
    const pCenter = H.transformPoint(0.5, 0.5);

    assert.strictEqual(Math.round(pTL.x), 40);
    assert.strictEqual(Math.round(pTL.y), 100);
    assert.strictEqual(Math.round(pTR.x), 240);
    assert.strictEqual(Math.round(pTR.y), 100);
    assert.strictEqual(Math.round(pBL.x), 40);
    assert.strictEqual(Math.round(pBL.y), 300);
    assert.strictEqual(Math.round(pBR.x), 240);
    assert.strictEqual(Math.round(pBR.y), 300);
    assert.strictEqual(Math.round(pCenter.x), 140);
    assert.strictEqual(Math.round(pCenter.y), 200);
  });

  it('accurately maps perspective trapezoid quad (camera tilt distortion)', () => {
    const quad = {
      TL: { x: 100, y: 100 },
      TR: { x: 300, y: 100 },
      BL: { x: 50, y: 400 },
      BR: { x: 350, y: 400 },
    };

    const H = ProjectiveHomography.fromUnitSquareToQuad(quad);

    const pTL = H.transformPoint(0, 0);
    const pTR = H.transformPoint(1, 0);
    const pBL = H.transformPoint(0, 1);
    const pBR = H.transformPoint(1, 1);

    assert.ok(Math.abs(pTL.x - 100) < 1e-4);
    assert.ok(Math.abs(pTL.y - 100) < 1e-4);
    assert.ok(Math.abs(pTR.x - 300) < 1e-4);
    assert.ok(Math.abs(pTR.y - 100) < 1e-4);
    assert.ok(Math.abs(pBL.x - 50) < 1e-4);
    assert.ok(Math.abs(pBL.y - 400) < 1e-4);
    assert.ok(Math.abs(pBR.x - 350) < 1e-4);
    assert.ok(Math.abs(pBR.y - 400) < 1e-4);

    // Center of perspective quad is shifted lower due to perspective projection
    const pCenter = H.transformPoint(0.5, 0.5);
    assert.strictEqual(Math.round(pCenter.x), 200);
    assert.ok(pCenter.y > 200, `Expected center Y (${pCenter.y}) to be > 200 due to perspective foreshortening`);
  });

  it('correctly throws error on degenerate or collinear marker quadrilateral', () => {
    const degenerateQuad = {
      TL: { x: 0, y: 0 },
      TR: { x: 100, y: 100 },
      BL: { x: 200, y: 200 },
      BR: { x: 300, y: 300 }, // All 4 points collinear
    };

    assert.throws(() => {
      ProjectiveHomography.fromUnitSquareToQuad(degenerateQuad);
    }, /Degenerate quadrilateral/);
  });
});

