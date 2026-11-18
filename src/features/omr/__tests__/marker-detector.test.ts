/**
 * Project KIT — Mobile fiducial calibration regression tests.
 * Synthetic camera perspective isolates registration from bubble classification.
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
  it('registers a perspective-skewed phone capture with all four physical markers', () => {
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

  it('rejects registration when a physical fiducial is missing', () => {
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
  it('registers a small, off-center sheet without assuming it fills or is centered in the frame', () => {
    const geometry = generateCanonicalGeometry({
      assessmentId: 'small-off-center-mobile-regression',
      itemCount: 60,
      classSize: 60,
    });
    const width = 1600;
    const height = 1200;
    const pixels = new Uint8ClampedArray(width * height * 4);
    pixels.fill(255);
    // The printed sheet occupies only ~35% of the frame and is pushed into
    // the upper-left corner, as can happen with phone uploads/camera framing.
    const pageTransform = ProjectiveHomography.fromUnitSquareToQuad({
      TL: { x: 18, y: 16 },
      TR: { x: 278, y: 28 },
      BL: { x: 12, y: 382 },
      BR: { x: 290, y: 370 },
    });

    for (const marker of geometry.markers) {
      const point = pageTransform.transformPoint(
        marker.center.x / geometry.page.width,
        marker.center.y / geometry.page.height,
      );
      const side = Math.max(3, Math.round(marker.size * 0.36));
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

    const result = MarkerDetector.detectRegionMarkers(pixels, width, height, geometry);
    assert.equal(result.allRegionsDetected, true, JSON.stringify(result.failedRegions));
    assert.equal(result.failedRegions.length, 0);
    assert.equal(Object.keys(result.detectedRegions).length, geometry.regions.length);
  });

});
