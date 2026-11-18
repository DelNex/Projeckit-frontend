/**
 * Project KIT — Mobile fiducial calibration regression tests.
 * Uses synthetic camera perspective so marker registration is tested independently
 * from bubble classification and does not rely on a hand-picked screenshot.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { MarkerDetector } from '../engines/marker-detector';
import { ProjectiveHomography } from '../engines/homography';

function makePerspectiveFixture(removeBottomRight = false) {
  const geometry = generateCanonicalGeometry({
    assessmentId: 'mobile-perspective-regression',
    itemCount: 60,
    classSize: 60,
  });
  const width = 800;
  const height = 1200;
  const pixels = new Uint8ClampedArray(width * height * 4);
  pixels.fill(255);

  const pageTransform = ProjectiveHomography.fromUnitSquareToQuad({
    TL: { x: 80, y: 60 },
    TR: { x: 720, y: 120 },
    BL: { x: 30, y: 1140 },
    BR: { x: 770, y: 1050 },
  });

  for (const marker of geometry.markers) {
    if (removeBottomRight && marker.corner === 'BR') continue;
    const point = pageTransform.transformPoint(
      marker.center.x / geometry.page.width,
      marker.center.y / geometry.page.height,
    );
    const side = Math.max(8, Math.round(marker.size * 0.9));
    const left = Math.round(point.x - side / 2);
    const top = Math.round(point.y - side / 2);
    for (let y = top; y < top + side; y++) {
      for (let x = left; x < left + side; x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const offset = (y * width + x) * 4;
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
        pixels[offset + 3] = 255;
      }
    }
  }

  return { pixels, width, height, geometry };
}

describe('Project KIT — Mobile fiducial calibration', () => {
  it('registers all regions from a perspective-skewed phone capture', () => {
    const fixture = makePerspectiveFixture();
    const result = MarkerDetector.detectRegionMarkers(
      fixture.pixels,
      fixture.width,
      fixture.height,
      fixture.geometry,
    );

    assert.equal(result.allRegionsDetected, true, JSON.stringify(result.failedRegions));
    assert.equal(result.failedRegions.length, 0);
    assert.equal(Object.keys(result.detectedRegions).length, fixture.geometry.regions.length);
  });

  it('refuses registration when a physical fiducial is actually missing', () => {
    const fixture = makePerspectiveFixture(true);
    const result = MarkerDetector.detectRegionMarkers(
      fixture.pixels,
      fixture.width,
      fixture.height,
      fixture.geometry,
    );

    assert.equal(result.allRegionsDetected, false);
    assert.ok(result.failedRegions.length > 0);
  });
});
