import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTosBlueprintSlots, getTosCompetencyId } from '../exam-types';

test('legacy competency identifiers remain stable when other TOS rows are inserted or reordered', () => {
  const photosynthesis = { description: 'Explain photosynthesis', domains: { remembering: 2, understanding: 1 }, daysTaught: 3 };
  const waterCycle = { description: 'Describe the water cycle', domains: { applying: 2 }, daysTaught: 2 };
  const first = getTosCompetencyId(photosynthesis);
  assert.equal(getTosCompetencyId(photosynthesis), first);
  assert.equal(getTosCompetencyId(photosynthesis), getTosCompetencyId({ description: 'Explain photosynthesis', domains: { remembering: 2, understanding: 1 }, daysTaught: 3 }));
  assert.notEqual(first, getTosCompetencyId(waterCycle));
  const slots = buildTosBlueprintSlots([waterCycle, photosynthesis], 5);
  assert.equal(slots[0].competency_id, getTosCompetencyId(waterCycle));
  assert.equal(slots[2].competency_id, getTosCompetencyId(photosynthesis));
  const reversedSlots = buildTosBlueprintSlots([photosynthesis, waterCycle], 5);
  assert.equal(reversedSlots[0].competency_id, getTosCompetencyId(photosynthesis));
  assert.equal(reversedSlots[3].competency_id, getTosCompetencyId(waterCycle));
});

test('explicit competency IDs and codes take precedence over generated legacy keys', () => {
  assert.equal(getTosCompetencyId({ id: 'row-123', code: 'BIO-1', description: 'Biology' }), 'row-123');
  assert.equal(getTosCompetencyId({ code: 'BIO-1', description: 'Biology' }), 'BIO-1');
});
