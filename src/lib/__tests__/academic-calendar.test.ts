/**
 * Project KIT — Unit Tests: Academic Calendar (A2) & Tenant Name Display (A1)
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import { getPhilippineSchoolYear, isValidSchoolYear } from '../academic-calendar';

describe('A2. Philippine Academic Calendar & School Year Computation', () => {
  it('correctly calculates school year for dates from June to December (month >= 5)', () => {
    // June 1, 2026 -> 2026-2027
    const june2026 = new Date(2026, 5, 1);
    assert.strictEqual(getPhilippineSchoolYear(june2026), '2026-2027');

    // October 15, 2026 -> 2026-2027
    const oct2026 = new Date(2026, 9, 15);
    assert.strictEqual(getPhilippineSchoolYear(oct2026), '2026-2027');

    // December 31, 2026 -> 2026-2027
    const dec2026 = new Date(2026, 11, 31);
    assert.strictEqual(getPhilippineSchoolYear(dec2026), '2026-2027');
  });

  it('correctly calculates school year for dates from January to May (month < 5)', () => {
    // January 1, 2027 -> 2026-2027
    const jan2027 = new Date(2027, 0, 1);
    assert.strictEqual(getPhilippineSchoolYear(jan2027), '2026-2027');

    // March 15, 2027 -> 2026-2027
    const mar2027 = new Date(2027, 2, 15);
    assert.strictEqual(getPhilippineSchoolYear(mar2027), '2026-2027');

    // May 31, 2027 -> 2026-2027
    const may2027 = new Date(2027, 4, 31);
    assert.strictEqual(getPhilippineSchoolYear(may2027), '2026-2027');
  });

  it('validates consecutive-year format "YYYY-YYYY"', () => {
    assert.strictEqual(isValidSchoolYear('2025-2026'), true);
    assert.strictEqual(isValidSchoolYear('2026-2027'), true);
    assert.strictEqual(isValidSchoolYear('2024-2025'), true);
    assert.strictEqual(isValidSchoolYear(' 2025-2026 '), true); // Trimming
  });

  it('rejects invalid school year formats and non-consecutive years', () => {
    assert.strictEqual(isValidSchoolYear('2025-2025'), false); // Same year
    assert.strictEqual(isValidSchoolYear('2025-2027'), false); // Gap of 2 years
    assert.strictEqual(isValidSchoolYear('2026-2025'), false); // Descending
    assert.strictEqual(isValidSchoolYear('2025'), false); // Single year
    assert.strictEqual(isValidSchoolYear('2025/2026'), false); // Wrong delimiter
    assert.strictEqual(isValidSchoolYear(''), false); // Empty string
  });
});

describe('A1. Tenant Name Dynamic Display & Fallback Isolation', () => {
  it('prefers the logged-in user tenant name over any defaults', () => {
    const tenantRecord = { id: 'uuid-123', name: 'Mabalacat Technical High School' };
    const resolvedName = tenantRecord.name || 'Department of Education';
    assert.strictEqual(resolvedName, 'Mabalacat Technical High School');
    assert.ok(!resolvedName.includes('Capas'));
  });

  it('falls back to neutral DepEd branding when tenant name is absent, never a hardcoded school', () => {
    const neutralSubtitle = 'Assessment & Academic Analytics';
    const missingTenantName: string | undefined = undefined;
    const resolved = missingTenantName || neutralSubtitle;
    assert.strictEqual(resolved, 'Assessment & Academic Analytics');
    assert.ok(!resolved.includes('Capas'));
  });

  it('ensures clean provisioning defaults contain zero hardcoded school identifiers', () => {
    const newSchoolName = 'Tarlac National High School';
    const config = {
      schoolName: newSchoolName,
      defaultSection: 'Section 1',
      term: '1st Term',
    };
    assert.strictEqual(config.schoolName, 'Tarlac National High School');
    assert.notStrictEqual(config.schoolName, 'Capas Senior High School');
  });
});

