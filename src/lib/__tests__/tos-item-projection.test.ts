import assert from 'node:assert/strict';
import test from 'node:test';
import { projectTosItems } from '../tos-item-projection';

test('projects a complete contiguous exam allocation using days taught', () => {
  const items = projectTosItems([
    { id: 'c1', code: 'LC1', description: 'Remember facts', daysTaught: 1 },
    { id: 'c2', code: 'LC2', description: 'Apply the method', daysTaught: 3 },
  ], 12);

  assert.equal(items.length, 12);
  assert.deepEqual(items.map((item) => item.itemNumber), Array.from({ length: 12 }, (_, index) => index + 1));
  // The calculator guarantees at least one item per competency, then weights
  // the remaining ten items according to the 1:3 days-taught ratio.
  assert.equal(items.filter((item) => item.code === 'LC1').length, 4);
  assert.equal(items.filter((item) => item.code === 'LC2').length, 8);
  assert.ok(new Set(items.map((item) => item.domain)).size > 1);
});

test('limits projection to four competencies and handles legacy rows without days', () => {
  const items = projectTosItems([
    { code: 'LC1', description: 'Understand concepts', days: 1 },
    { code: 'LC2', description: 'Apply concepts', days_taught: 1 },
    { code: 'LC3', description: 'Evaluate evidence', daysTaught: 1 },
    { code: 'LC4', description: 'Create a solution', daysTaught: 1 },
    { code: 'LC5', description: 'Ignore beyond supported limit', daysTaught: 100 },
  ], 8);

  assert.equal(items.length, 8);
  assert.deepEqual(Array.from(new Set(items.map((item) => item.code))), ['LC1', 'LC2', 'LC3', 'LC4']);
});
