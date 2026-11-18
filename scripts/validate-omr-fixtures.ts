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
  const failures: string[] = [];

  for (const name of imageNames) {
    const bytes = fs.readFileSync(path.join(fixturesDir, name));
    const count = itemCountFor(name);
    const includeRollNumberGrid = name.includes('legacy_roll') || name.includes('multi_roll');
    const template = createKitOmrTemplate({ itemCount: count, includeRollNumberGrid });
    const result = await engine.process(new Uint8Array(bytes), template);

    if (result.errorCode === 'DECODE_FAILED') failures.push(`${name}: image could not be decoded`);

    if (result.fiducialDetected) {
      if (result.items.length !== count) failures.push(`${name}: registered sheet returned ${result.items.length}/${count} items`);
      if (result.normalizedAnswers.length !== count) failures.push(`${name}: normalized answer count ${result.normalizedAnswers.length}/${count}`);
    } else {
      if (result.status !== 'VERIFICATION_REQUIRED' && result.status !== 'REJECTED') failures.push(`${name}: missing markers produced unsafe status ${result.status}`);
    }

    const expected = expectedAnswers[name];
    let correct: number | null = null;
    if (expected) {
      if (expected.length !== count) failures.push(`${name}: answer key length ${expected.length} does not match template ${count}`);
      const mismatches = expected.flatMap((answer, index) =>
        (result.normalizedAnswers[index] ?? null) === answer ? [] : [{
          question: index + 1,
          expected: answer,
          actual: result.normalizedAnswers[index] ?? null,
          state: result.items[index]?.state ?? 'MISSING_ITEM',
          scores: result.items[index]?.scores ?? null,
        }],
      );
      correct = expected.length - mismatches.length;
      if (mismatches.length) failures.push(`${name}: ${mismatches.length}/${expected.length} answer mismatches`);
    }

    results.push({
      name,
      status: result.status,
      items: result.items.length,
      marker: result.fiducialDetected,
      nullCount: result.normalizedAnswers.filter((answer) => answer === null).length,
      compared: expected?.length ?? null,
      correct,
      mismatches: expected ? expected.flatMap((answer, index) => (result.normalizedAnswers[index] ?? null) === answer ? [] : [{ question: index + 1, expected: answer, actual: result.normalizedAnswers[index] ?? null, state: result.items[index]?.state ?? 'MISSING_ITEM' }]) : null,
      fiducialConfidence: result.fiducialConfidence,
      openCvDiagnostics: result.openCvDiagnostics,
      failedRegion: result.failedRegion,
      errorCode: result.errorCode,
    });
  }

  console.log('OMR fixture diagnostic report:', JSON.stringify(results));
  console.log(`OMR fixture validation summary: ${results.length} raster images; ${results.filter((result) => result.compared !== null).length} labeled images; ${results.reduce((sum, result) => sum + (result.correct ?? 0), 0)} correct answers across ${results.reduce((sum, result) => sum + (result.compared ?? 0), 0)} labeled answers.`);
  if (failures.length) {
    console.error('OMR fixture validation failures:', JSON.stringify(failures));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('OMR fixture validation failed:', error);
  process.exitCode = 1;
});
