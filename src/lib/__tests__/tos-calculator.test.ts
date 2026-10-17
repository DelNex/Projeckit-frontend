import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateTos,
  allocateCognitiveDomains,
  formatRange,
  DEFAULT_COGNITIVE_DISTRIBUTION,
  TosCompetencyInput,
} from '../tos-calculator';

describe('TOS Deterministic Math & Allocation Engine', () => {
  // C4: Unit Tests
  it('handles 1 single competency correctly with 100% allocation', () => {
    const competencies: TosCompetencyInput[] = [
      { id: 'c1', description: 'Quadratic Equations', daysTaught: 10 },
    ];
    const res = calculateTos(competencies, 50);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.totalDays, 10);
    assert.strictEqual(res.totalAllocatedItems, 50);
    assert.strictEqual(res.rows.length, 1);
    assert.strictEqual(res.rows[0].itemCount, 50);
    assert.strictEqual(res.rows[0].itemRange, '1–50');
  });

  it('allocates equally when competencies have equal days taught', () => {
    const competencies: TosCompetencyInput[] = [
      { id: 'c1', description: 'Comp 1', daysTaught: 5 },
      { id: 'c2', description: 'Comp 2', daysTaught: 5 },
      { id: 'c3', description: 'Comp 3', daysTaught: 5 },
      { id: 'c4', description: 'Comp 4', daysTaught: 5 },
    ];
    const res = calculateTos(competencies, 40);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.totalDays, 20);
    assert.strictEqual(res.totalAllocatedItems, 40);
    res.rows.forEach((r) => {
      assert.strictEqual(r.itemCount, 10);
      assert.strictEqual(r.percentage, 25);
    });
    assert.strictEqual(res.rows[0].itemRange, '1–10');
    assert.strictEqual(res.rows[1].itemRange, '11–20');
    assert.strictEqual(res.rows[2].itemRange, '21–30');
    assert.strictEqual(res.rows[3].itemRange, '31–40');
  });

  it('handles uneven days taught using Hamilton largest-remainder (days 5, 3, 2, 4 with 40 items)', () => {
    const competencies: TosCompetencyInput[] = [
      { id: 'c1', description: 'Comp 1', daysTaught: 5 },
      { id: 'c2', description: 'Comp 2', daysTaught: 3 },
      { id: 'c3', description: 'Comp 3', daysTaught: 2 },
      { id: 'c4', description: 'Comp 4', daysTaught: 4 },
    ];
    // Total days = 14
    // c1: 40 * 5 / 14 = 14.2857 -> floor 14
    // c2: 40 * 3 / 14 = 8.5714  -> floor 8
    // c3: 40 * 2 / 14 = 5.7142  -> floor 5
    // c4: 40 * 4 / 14 = 11.4285 -> floor 11
    // Total floor = 38. Surplus = 2.
    // Remainders: c2 (0.5714), c3 (0.7142), c1 (0.2857), c4 (0.4285)
    // Surplus goes to highest remainders: c3 (+1 = 6), c2 (+1 = 9)
    // Counts: c1=14, c2=9, c3=6, c4=11 -> sum = 40 exactly!
    const res = calculateTos(competencies, 40);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.totalDays, 14);
    assert.strictEqual(res.totalAllocatedItems, 40);
    assert.strictEqual(res.rows[0].itemCount, 14);
    assert.strictEqual(res.rows[1].itemCount, 9);
    assert.strictEqual(res.rows[2].itemCount, 6);
    assert.strictEqual(res.rows[3].itemCount, 11);

    // Contiguous item ranges check (C6)
    assert.strictEqual(res.rows[0].itemRange, '1–14');
    assert.strictEqual(res.rows[1].itemRange, '15–23');
    assert.strictEqual(res.rows[2].itemRange, '24–29');
    assert.strictEqual(res.rows[3].itemRange, '30–40');
  });

  it('guarantees at least 1 item per competency when totalItems >= competencies.length (4 comps, 5 items)', () => {
    const competencies: TosCompetencyInput[] = [
      { id: 'c1', description: 'Comp 1', daysTaught: 10 },
      { id: 'c2', description: 'Comp 2', daysTaught: 1 },
      { id: 'c3', description: 'Comp 3', daysTaught: 1 },
      { id: 'c4', description: 'Comp 4', daysTaught: 1 },
    ];
    const res = calculateTos(competencies, 5);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.totalAllocatedItems, 5);
    res.rows.forEach((r) => {
      assert.ok(r.itemCount >= 1, `Competency ${r.code} must have at least 1 item`);
    });
    assert.strictEqual(res.rows.reduce((sum, r) => sum + r.itemCount, 0), 5);
  });

  it('breaks ties deterministically and stably in remainder allocation', () => {
    const competencies: TosCompetencyInput[] = [
      { id: 'c1', description: 'Comp A', daysTaught: 1 },
      { id: 'c2', description: 'Comp B', daysTaught: 1 },
      { id: 'c3', description: 'Comp C', daysTaught: 1 },
    ];
    // 3 comps, 4 items -> each gets floor 1, 1 surplus with identical remainders (0.333...)
    const run1 = calculateTos(competencies, 4);
    const run2 = calculateTos(competencies, 4);

    assert.deepStrictEqual(run1.rows.map((r) => r.itemCount), run2.rows.map((r) => r.itemCount));
    assert.strictEqual(run1.rows[0].itemCount, 2); // First comp wins tie deterministically
    assert.strictEqual(run1.rows[1].itemCount, 1);
    assert.strictEqual(run1.rows[2].itemCount, 1);
  });

  it('handles large totals (200 items) without rounding error or discrepancy', () => {
    const competencies: TosCompetencyInput[] = [
      { id: 'c1', description: 'Comp 1', daysTaught: 7 },
      { id: 'c2', description: 'Comp 2', daysTaught: 13 },
      { id: 'c3', description: 'Comp 3', daysTaught: 11 },
      { id: 'c4', description: 'Comp 4', daysTaught: 19 },
    ];
    const res = calculateTos(competencies, 200);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.totalAllocatedItems, 200);
    assert.strictEqual(res.rows.reduce((sum, r) => sum + r.itemCount, 0), 200);
    assert.strictEqual(res.rows[3].endItem, 200);
  });

  // C5: Cognitive Distribution Tests (proves not just ANA appears)
  it('C5: distributes items across multiple cognitive levels instead of dumping only in ANA', () => {
    const domains = allocateCognitiveDomains(40, DEFAULT_COGNITIVE_DISTRIBUTION);

    // Sum must equal 40 exactly
    const domainSum =
      domains.remembering +
      domains.understanding +
      domains.applying +
      domains.analyzing +
      domains.evaluating +
      domains.creating;
    assert.strictEqual(domainSum, 40);

    // Multiple levels must appear (not just ANA!)
    assert.ok(domains.remembering > 0, 'Remembering must have items');
    assert.ok(domains.understanding > 0, 'Understanding must have items');
    assert.ok(domains.applying > 0, 'Applying must have items');
    assert.ok(domains.analyzing > 0, 'Analyzing must have items');
    assert.ok(domains.evaluating > 0, 'Evaluating must have items');
    assert.ok(domains.creating > 0, 'Creating must have items');

    // Expected default ratio (60% lower, 30% mid, 10% higher):
    // 40 items: Lower = 24 (12 REM, 12 UND), Mid = 12 (6 APP, 6 ANA), Higher = 4 (2 EVA, 2 CRE)
    assert.strictEqual(domains.remembering, 12);
    assert.strictEqual(domains.understanding, 12);
    assert.strictEqual(domains.applying, 6);
    assert.strictEqual(domains.analyzing, 6);
    assert.strictEqual(domains.evaluating, 2);
    assert.strictEqual(domains.creating, 2);
  });

  // C6: Item Range Invariant Tests
  it('C6: ensures contiguous, non-overlapping item ranges across all rows and cells', () => {
    const competencies: TosCompetencyInput[] = [
      { id: 'c1', description: 'Comp 1', daysTaught: 4 },
      { id: 'c2', description: 'Comp 2', daysTaught: 6 },
      { id: 'c3', description: 'Comp 3', daysTaught: 10 },
    ];
    const res = calculateTos(competencies, 30);

    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.totalAllocatedItems, 30);

    let expectedItem = 1;
    res.rows.forEach((row) => {
      assert.strictEqual(row.startItem, expectedItem);
      assert.strictEqual(row.endItem, expectedItem + row.itemCount - 1);
      expectedItem = row.endItem + 1;

      // Cognitive level sub-ranges must sum to row item count
      const sumDomains = Object.values(row.domains).reduce((a, b) => a + b, 0);
      assert.strictEqual(sumDomains, row.itemCount);
    });
    assert.strictEqual(expectedItem - 1, 30);
  });

  it('rejects invalid inputs (0 items, 0 days, >4 competencies)', () => {
    const invalidDays: TosCompetencyInput[] = [
      { id: 'c1', description: 'Comp 1', daysTaught: 0 },
    ];
    assert.strictEqual(calculateTos(invalidDays, 50).isValid, false);

    const fiveComps: TosCompetencyInput[] = [
      { id: 'c1', description: '1', daysTaught: 2 },
      { id: 'c2', description: '2', daysTaught: 2 },
      { id: 'c3', description: '3', daysTaught: 2 },
      { id: 'c4', description: '4', daysTaught: 2 },
      { id: 'c5', description: '5', daysTaught: 2 },
    ];
    assert.strictEqual(calculateTos(fiveComps, 50).isValid, false);

    const zeroItems: TosCompetencyInput[] = [
      { id: 'c1', description: '1', daysTaught: 2 },
    ];
    assert.strictEqual(calculateTos(zeroItems, 0).isValid, false);
  });
});

