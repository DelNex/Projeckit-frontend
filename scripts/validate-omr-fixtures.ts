import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NativeOpticalEngineAdapter } from '../src/features/omr/engines/native-optical-engine';
import { createKitOmrTemplate } from '../src/features/omr/templates/template-builder';

const fixturesDir = path.resolve('src/features/omr/__tests__/fixtures');
const imageNames = fs.readdirSync(fixturesDir)
  .filter((name) => /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name))
  .sort();
const expectedAnswers = JSON.parse(
  fs.readFileSync(path.join(fixturesDir, 'expected-answers.json'), 'utf8'),
) as Record<string, (string | null)[]>;

assert.ok(imageNames.length > 0, 'No raster OMR fixtures were found; refusing to skip validation.');

function itemCountFor(name: string): number {
  if (name.includes('sheet_63')) return 63;
  if (name.includes('sample_90')) return 90;
  if (name.includes('sample_30')) return 30;
  if (name.includes('multi_roll')) return 20;
  return 60;
}

async function main() {
  const engine = new NativeOpticalEngineAdapter();
  const results: Array<{
    name: string;
    status: string;
    items: number;
    marker: boolean;
    nullCount: number;
    compared: number | null;
    correct: number | null;
  }> = [];

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

    const expected = expectedAnswers[name];
    let correct: number | null = null;
    if (expected) {
      assert.equal(expected.length, count, `${name}: answer key length does not match its template`);
      const mismatches = expected.flatMap((answer, index) =>
        result.normalizedAnswers[index] === answer ? [] : [{
          question: index + 1,
          expected: answer,
          actual: result.normalizedAnswers[index] ?? null,
          state: result.items[index]?.state ?? 'MISSING_ITEM',
          scores: result.items[index]?.scores ?? null,
        }],
      );
      correct = expected.length - mismatches.length;
      assert.deepEqual(
        mismatches,
        [],
        `${name}: expected answers did not match scanner output (including null answers). Diagnostics: ${JSON.stringify({
          imageHash: result.imageHash,
          fiducialDetected: result.fiducialDetected,
          fiducialConfidence: result.fiducialConfidence,
          openCvDiagnostics: result.openCvDiagnostics,
          mismatches,
        })}`,
      );
    }

    results.push({
      name,
      status: result.status,
      items: result.items.length,
      marker: result.fiducialDetected,
      nullCount: result.normalizedAnswers.filter((answer) => answer === null).length,
      compared: expected?.length ?? null,
      correct,
    });
  }

  console.log('OMR fixture diagnostic report:', JSON.stringify(results));
  console.log(`OMR fixture validation passed: ${results.length} raster images; ${results.filter((result) => result.compared !== null).length} labeled images checked exactly`);
}

main().catch((error) => {
  console.error('OMR fixture validation failed:', error);
  process.exitCode = 1;
});
