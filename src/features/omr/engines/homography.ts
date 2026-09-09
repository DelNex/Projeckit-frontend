/**
 * Project KIT — Projective Homography Engine
 * Computes exact 3x3 projective homography transformations mapping canonical
 * region-relative coordinates (u, v) ∈ [0, 1] to physical image pixels (x, y).
 *
 * Mathematically corrects for camera perspective tilt, paper rotation, scale, and translation.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface QuadPoints {
  TL: Point2D;
  TR: Point2D;
  BL: Point2D;
  BR: Point2D;
}

export class ProjectiveHomography {
  // 3x3 Matrix elements:
  // [ h00 h01 h02 ]
  // [ h10 h11 h12 ]
  // [ h20 h21 h22 ]
  private readonly h: number[];

  constructor(matrix: number[]) {
    if (matrix.length !== 9) {
      throw new Error('ProjectiveHomography requires a 3x3 matrix (9 elements).');
    }
    this.h = matrix;
  }

  /**
   * Transforms normalized coordinates (u, v) ∈ [0, 1]^2 into physical image pixel coordinates (x, y).
   */
  transformPoint(u: number, v: number): Point2D {
    const h = this.h;
    const xNumerator = h[0] * u + h[1] * v + h[2];
    const yNumerator = h[3] * u + h[4] * v + h[5];
    const denominator = h[6] * u + h[7] * v + h[8];

    if (Math.abs(denominator) < 1e-10) {
      throw new Error('Homography projection singularity (denominator near zero).');
    }

    return {
      x: xNumerator / denominator,
      y: yNumerator / denominator,
    };
  }

  /**
   * Derives a projective homography mapping the unit square:
   *   TL = (0, 0)
   *   TR = (1, 0)
   *   BL = (0, 1)
   *   BR = (1, 1)
   * into an arbitrary target quadrilateral (TL, TR, BL, BR).
   *
   * Reference: Paul Heckbert, "Fundamentals of Texture Mapping and Image Warping" (1989).
   */
  static fromUnitSquareToQuad(quad: QuadPoints): ProjectiveHomography {
    const x0 = quad.TL.x;
    const y0 = quad.TL.y;
    const x1 = quad.TR.x;
    const y1 = quad.TR.y;
    const x2 = quad.BL.x;
    const y2 = quad.BL.y;
    const x3 = quad.BR.x;
    const y3 = quad.BR.y;

    const dx1 = x1 - x3;
    const dx2 = x2 - x3;
    const dx3 = x0 - x1 + x3 - x2;

    const dy1 = y1 - y3;
    const dy2 = y2 - y3;
    const dy3 = y0 - y1 + y3 - y2;

    // Affine case (parallelogram): check determinant
    if (Math.abs(dx3) < 1e-7 && Math.abs(dy3) < 1e-7) {
      const detAffine = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(detAffine) < 1e-7) {
        throw new Error('Degenerate quadrilateral: four markers are collinear or collapsed.');
      }
      return new ProjectiveHomography([
        x1 - x0, x2 - x0, x0,
        y1 - y0, y2 - y0, y0,
        0,       0,       1,
      ]);
    }

    // Full Projective Perspective case
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-10) {
      throw new Error('Degenerate quadrilateral: four markers are collinear or self-intersecting.');
    }

    const a31 = (dx3 * dy2 - dx2 * dy3) / det;
    const a32 = (dx1 * dy3 - dx3 * dy1) / det;

    const a11 = x1 - x0 + a31 * x1;
    const a12 = x2 - x0 + a32 * x2;
    const a13 = x0;

    const a21 = y1 - y0 + a31 * y1;
    const a22 = y2 - y0 + a32 * y2;
    const a23 = y0;

    return new ProjectiveHomography([
      a11, a12, a13,
      a21, a22, a23,
      a31, a32, 1.0,
    ]);
  }
}
