import assert from 'node:assert';
import { describe, it } from 'node:test';
import { fitImageDimensions } from '../image-normalization';

describe('OMR image dimension normalization', () => {
  it('preserves aspect ratio and caps landscape, portrait, and high-resolution inputs', () => {
    const cases = [
      { input: [1920, 1080], expected: [1600, 900] },
      { input: [1080, 1920], expected: [900, 1600] },
      { input: [3024, 4032], expected: [1200, 1600] },
      { input: [4000, 3000], expected: [1600, 1200] },
    ];

    for (const { input: [width, height], expected } of cases) {
      assert.deepStrictEqual(fitImageDimensions(width, height), {
        width: expected[0],
        height: expected[1],
      });
    }
  });

  it('does not upscale small images and rejects invalid dimensions', () => {
    assert.deepStrictEqual(fitImageDimensions(640, 480), { width: 640, height: 480 });
    assert.throws(() => fitImageDimensions(0, 480), /INVALID_IMAGE_DIMENSIONS/);
    assert.throws(() => fitImageDimensions(640, 480, Number.NaN), /INVALID_IMAGE_DIMENSIONS/);
  });
});
