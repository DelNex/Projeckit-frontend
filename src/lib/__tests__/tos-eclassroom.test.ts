import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateTos,
  classifyActionVerb,
  allocateBalancedCognitiveDomains,
  allocateCognitiveDomains,
  validateItemPlacementUniqueness,
  BLOOM_LEVELS,
  TosCompetencyInput,
} from '../tos-calculator';
import { friendlyError, extractTechnicalError } from '../errors';

describe('Project KIT — TOS E-ClassRoom Redesign Tests', () => {
  describe('Phase 0 & 3: Error Mapping & Status Validation', () => {
    it('maps PGRST204 missing column error to a clear instruction message', () => {
      const err = {
        code: 'PGRST204',
        message: "Could not find the 'teacher_name' column of 'tos_documents' in the schema cache",
      };
      const msg = friendlyError(err);
      assert.ok(msg.includes('missing column \'teacher_name\''));
      assert.ok(msg.includes('migrations'));
    });

    it('maps P0001 custom trigger error to the exact business message', () => {
      const err = {
        code: 'P0001',
        message: 'A TOS can have up to 4 learning competencies. Current count: 5',
      };
      const msg = friendlyError(err);
      assert.strictEqual(msg, 'A TOS can have up to 4 learning competencies. Current count: 5');
    });

    it('maps 23505 unique violation to friendly message', () => {
      const msg = friendlyError({ code: '23505' });
      assert.strictEqual(msg, 'A record with this value already exists. Please use a unique value.');
    });

    it('extracts technical details for admin diagnostic disclosure', () => {
      const err = {
        code: 'PGRST204',
        message: 'Could not find column',
        details: 'Schema reload needed',
        hint: 'Run migration 20',
      };
      const tech = extractTechnicalError(err);
      assert.strictEqual(tech.code, 'PGRST204');
      assert.strictEqual(tech.hint, 'Run migration 20');
      assert.ok(tech.fullText.includes('PGRST204'));
    });
  });

  describe('Phase 3: Action Verb Classification', () => {
    it('accurately classifies English Bloom action verbs', () => {
      assert.strictEqual(classifyActionVerb('Define quadratic equations and state properties'), 'remembering');
      assert.strictEqual(classifyActionVerb('Explain the laws of thermodynamics'), 'understanding');
      assert.strictEqual(classifyActionVerb('Implement column aliases using SQL'), 'applying');
      assert.strictEqual(classifyActionVerb('Calculate the molar mass of compounds'), 'applying');
      assert.strictEqual(classifyActionVerb('Analyze the economic impacts of inflation'), 'analyzing');
      assert.strictEqual(classifyActionVerb('Differentiate scalar from vector quantities'), 'analyzing');
      assert.strictEqual(classifyActionVerb('Evaluate the effectiveness of public policies'), 'evaluating');
      assert.strictEqual(classifyActionVerb('Design an algorithmic solution for sorting'), 'creating');
    });

    it('accurately classifies Filipino action verbs', () => {
      assert.strictEqual(classifyActionVerb('Kilalanin ang mga pangunahing tauhan sa Noli Me Tangere'), 'remembering');
      assert.strictEqual(classifyActionVerb('Ipaliwanag ang kahalagahan ng wika'), 'understanding');
      assert.strictEqual(classifyActionVerb('Gamitin ang tamang bantas sa pangungusap'), 'applying');
      assert.strictEqual(classifyActionVerb('Suriin ang mga tayutay na ginamit sa tula'), 'analyzing');
      assert.strictEqual(classifyActionVerb('Tayain ang katumpakan ng mga datos'), 'evaluating');
      assert.strictEqual(classifyActionVerb('Lumikha ng isang orihinal na sanaysay'), 'creating');
    });

    it('defaults to understanding when no known action verb is found', () => {
      assert.strictEqual(classifyActionVerb('General topic without explicit action verb'), 'understanding');
      assert.strictEqual(classifyActionVerb(''), 'understanding');
    });
  });

  describe('Phase 3 & 4: Balanced Item Placement & Uniqueness', () => {
    it('balanced mode distributes items across 6 levels and puts remainder on primary verb level', () => {
      // 8 items, primary level = applying (index 2)
      // 8 / 6 = 1 each (6 items), remainder = 2 items
      // Remainder goes to applying (+1) and next priority level (+1)
      const domains = allocateBalancedCognitiveDomains(8, 'applying', 'Summative Test 1');
      const total = Object.values(domains).reduce((a, b) => a + b, 0);
      assert.strictEqual(total, 8);
      assert.strictEqual(domains.applying, 2); // Primary received remainder
      BLOOM_LEVELS.forEach((level) => {
        assert.ok(domains[level] >= 1, `Level ${level} should have at least 1 item`);
      });
    });

    it('assigns strictly unique item numbers covering 1..N exactly across 4 competencies', () => {
      const comps: TosCompetencyInput[] = [
        { id: 'c1', description: 'Implement column aliases using SQL', daysTaught: 3 },
        { id: 'c2', description: 'Analyze relational schema constraints', daysTaught: 2 },
        { id: 'c3', description: 'Define primary and foreign keys', daysTaught: 1 },
        { id: 'c4', description: 'Design a normalized database schema', daysTaught: 2 },
      ];

      const res = calculateTos(comps, 25, { allocationMode: 'action_verb', examType: 'Summative Test 1' });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.totalAllocatedItems, 25);
      assert.strictEqual(res.rows.length, 4);

      // Verify item uniqueness across the whole exam
      const uniqueness = validateItemPlacementUniqueness(res);
      assert.strictEqual(uniqueness.valid, true, `Uniqueness failed: missing ${uniqueness.missing}, duplicates ${uniqueness.duplicates}`);
      assert.strictEqual(uniqueness.duplicates.length, 0);
      assert.strictEqual(uniqueness.missing.length, 0);

      // Verify non-empty cells have comma-separated item numbers
      res.rows.forEach((row) => {
        BLOOM_LEVELS.forEach((level) => {
          const items = row.domainItemNumbers[level];
          const display = row.domainDisplay[level];
          if (items.length > 0) {
            assert.strictEqual(display, items.join(', '));
          } else {
            assert.strictEqual(display, '—');
          }
        });
      });
    });

    it('works correctly for 1 competency with 50 items', () => {
      const comps: TosCompetencyInput[] = [
        { id: 'c1', description: 'Apply calculus concepts in physics', daysTaught: 10 },
      ];
      const res = calculateTos(comps, 50, { allocationMode: 'action_verb', examType: 'Term Examination' });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.totalAllocatedItems, 50);

      const uniqueness = validateItemPlacementUniqueness(res);
      assert.strictEqual(uniqueness.valid, true);
    });

    it('supports 60/30/10 DepEd Order 8 mode as alternate selection', () => {
      const comps: TosCompetencyInput[] = [
        { id: 'c1', description: 'Comp 1', daysTaught: 5 },
        { id: 'c2', description: 'Comp 2', daysTaught: 5 },
      ];
      const res = calculateTos(comps, 50, { allocationMode: 'deped_order_8' });
      assert.strictEqual(res.isValid, true);
      assert.strictEqual(res.totalAllocatedItems, 50);

      const uniqueness = validateItemPlacementUniqueness(res);
      assert.strictEqual(uniqueness.valid, true);
    });
  });
});

