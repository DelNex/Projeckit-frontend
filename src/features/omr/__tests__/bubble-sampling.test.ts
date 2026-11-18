import assert from 'node:assert';
import { describe, it } from 'node:test';
import { generateCanonicalGeometry } from '../geometry/canonical-geometry';
import { mapCanonicalBubbleSample } from '../geometry/bubble-sampling';
import { ProjectiveHomography } from '../engines/homography';

describe('canonical bubble sampling coordinates', () => {
  const markers = generateCanonicalGeometry({
    assessmentId: 'sampling-test',
    itemCount: 60,
    classSize: 60,
  }).regions[0].markers;

  it('scales the sampling radius from the detected sheet quad, not the camera frame', () => {
    const homography = ProjectiveHomography.fromUnitSquareToQuad({
      TL: { x: 100, y: 200 }, TR: { x: 1078, y: 200 },
      BL: { x: 100, y: 1320 }, BR: { x: 1078, y: 1320 },
    });
    const sample = mapCanonicalBubbleSample({ u: 0.5, v: 0.5 }, 7.5, markers, homography);

    assert.ok(Math.abs(sample.x - 589) < 1e-6);
    assert.ok(Math.abs(sample.y - 760) < 1e-6);
    assert.ok(Math.abs(sample.radius - 12) < 0.1);
  });

  it('adapts the radius to perspective scale at each bubble location', () => {
    const homography = ProjectiveHomography.fromUnitSquareToQuad({
      TL: { x: 100, y: 100 }, TR: { x: 900, y: 100 },
      BL: { x: 0, y: 1500 }, BR: { x: 1000, y: 1500 },
    });
    const top = mapCanonicalBubbleSample({ u: 0.5, v: 0.1 }, 7.5, markers, homography);
    const bottom = mapCanonicalBubbleSample({ u: 0.5, v: 0.9 }, 7.5, markers, homography);

    assert.ok(bottom.radius > top.radius);
  });
});
