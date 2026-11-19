import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isLikelyScannedPdfPage } from '../pdf-page-analysis';

test('flags a raster page with no selectable text for OCR', () => {
  assert.equal(isLikelyScannedPdfPage({ textLength: 0, imageOperatorCount: 1 }), true);
});

test('does not flag image pages with enough selectable text', () => {
  assert.equal(isLikelyScannedPdfPage({ textLength: 16, imageOperatorCount: 1 }), false);
});

test('does not flag text-only pages', () => {
  assert.equal(isLikelyScannedPdfPage({ textLength: 0, imageOperatorCount: 0 }), false);
});

test('rejects invalid measurement values', () => {
  assert.equal(isLikelyScannedPdfPage({ textLength: Number.NaN, imageOperatorCount: 1 }), false);
  assert.equal(isLikelyScannedPdfPage({ textLength: 0, imageOperatorCount: -1 }), false);
});
