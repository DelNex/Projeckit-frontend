import { ProjectiveHomography } from '../engines/homography';
import { RegionFiducials } from './geometry-types';

export interface ImageBubbleSample {
  x: number;
  y: number;
  radius: number;
}

/**
 * Map a canonical bubble into decoded-image pixel space. Its radius comes from
 * the detected marker quad at that position, never from frame or CSS size.
 */
export function mapCanonicalBubbleSample(
  position: { u: number; v: number },
  canonicalRadius: number,
  markers: RegionFiducials,
  homography: ProjectiveHomography,
  insetRatio = 0.8
): ImageBubbleSample {
  const canonicalWidth = markers.TR.center.x - markers.TL.center.x;
  const canonicalHeight = markers.BL.center.y - markers.TL.center.y;
  if (
    canonicalWidth <= 0 || canonicalHeight <= 0 ||
    !Number.isFinite(canonicalRadius) || canonicalRadius <= 0 ||
    insetRatio <= 0 || insetRatio > 1
  ) {
    throw new Error('CANONICAL_MAPPING_FAILED');
  }

  const center = homography.transformPoint(position.u, position.v);
  const deltaU = canonicalRadius / canonicalWidth;
  const deltaV = canonicalRadius / canonicalHeight;
  const left = homography.transformPoint(position.u - deltaU, position.v);
  const right = homography.transformPoint(position.u + deltaU, position.v);
  const up = homography.transformPoint(position.u, position.v - deltaV);
  const down = homography.transformPoint(position.u, position.v + deltaV);
  const distance = (point: { x: number; y: number }) => Math.hypot(point.x - center.x, point.y - center.y);
  const radiusX = (distance(left) + distance(right)) / 2;
  const radiusY = (distance(up) + distance(down)) / 2;
  const radius = Math.sqrt(radiusX * radiusY) * insetRatio;

  if (![center.x, center.y, radius].every(Number.isFinite) || radius <= 0) {
    throw new Error('CANONICAL_MAPPING_FAILED');
  }
  return { x: center.x, y: center.y, radius };
}
