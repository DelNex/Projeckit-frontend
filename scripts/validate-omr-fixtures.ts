import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { NativeOpticalEngineAdapter } from '../src/features/omr/engines/native-optical-engine';
import { createKitOmrTemplate } from '../src/features/omr/templates/template-builder';

const fixturesDir = path.resolve('src/features/omr/__tests__/fixtures');
const imageNames = fs.readdirSync(fixturesDir)
  .filter((name) => /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name))
  .sort();

assert.ok(imageNames.length > 0, 'No raster OMR fixtures were found; refusing to skip validation.');

const expectedRealWorld = [
  'A', 'B', 'C', 'D', 'B', 'A', 'C', 'D', 'B', 'A',
  'A', 'A', 'C', 'A', 'A', 'D', 'A', 'A', 'A', 'B',
  'D', 'D', 'D', 'A', 'C', 'B', 'B', 'B', 'C', 'C',
  'A', 'B', 'B', 'B', 'A', 'C', 'B', 'B', 'B', 'C',
  'B', 'C', 'D', 'A', 'D', 'B', 'D', 'B', 'D', 'D',
  'B', 'A', 'C', 'B', 'D', 'D', 'B', 'C', 'C', 'D',
];
const firstFourMarked = ['A', 'B', 'C', 'D', ...Array.from({ length: 56 }, () => null)];

function itemCountFor(name: string): number {
  if (name.includes('sheet_63')) return 63;
  if (name.includes('sample_90')) return 90;
  if (name.includes('sample_30')) return 30;
  if (name.includes('multi_roll')) return 20;
  return 60;
}

async function main() {
  const engine = new NativeOpticalEngineAdapter();
  const results: Array<{ name: string; status: string; items: number; marker: boolean }> = [];

  for (const name of imageNames) {
    const bytes = fs.readFileSync(path.join(fixturesDir, name));
    const count = itemCountFor(name);
    const includeRollNumberGrid = name.includes('legacy_roll') || name.includes('multi_roll');
    const template = createKitOmrTemplate({ itemCount: count, includeRollNumberGrid });
    const result = await engine.process(new Uint8Array(bytes), template);

    assert.notEqual(result.errorCode, 'DECODE_FAILED', `${name}: image could not be decoded`);

    if (result.fiducialDetected) {
      assert.equal(result.items.length, count, `${name}: registered sheet returned an incomplete answer set`);
      assert.equal(result.normalizedAnswers.length, count, `${name}: normalized answer count does not match the template`);
    } else {
      assert.ok(
        result.status === 'VERIFICATION_REQUIRED' || result.status === 'REJECTED',
        `${name}: missing markers must be rejected or sent for review, got ${result.status}`,
      );
    }

    if (name === 'real_world_scan.png') {
      const correct = result.normalizedAnswers.reduce(
        (total, answer, index) => total + Number(answer === expectedRealWorld[index]), 0,
      );
      assert.equal(result.fiducialDetected, true, 'real_world_scan.png: registration failed');
      assert.equal(result.items.length, 60, 'real_world_scan.png: expected all 60 answers');
      assert.equal(correct, 60, `real_world_scan.png: expected 60/60 answers, got ${correct}/60`);
    }

    if (name === 'marked_60.png' || name === 'rotated_60.png') {
      assert.equal(result.fiducialDetected, true, `${name}: registration failed`);
      assert.deepEqual(
        result.normalizedAnswers,
        firstFourMarked,
        `${name}: known marked/blank answer pattern changed`,
      );
    }

    results.push({
      name,
      status: result.status,
      items: result.items.length,
      marker: result.fiducialDetected,
    });
  }

  console.log(`OMR fixture validation passed: ${results.length} raster images`);
  for (const result of results) {
    console.log(`- ${result.name}: ${result.status}, markers=${result.marker}, items=${result.items}`);
  }
}

main().catch((error) => {
  console.error('OMR fixture validation failed:', error);
  process.exitCode = 1;
});
