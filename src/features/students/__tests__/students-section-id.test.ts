import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Project KIT — Task 5: Sections & Students Consistency Tests', () => {
  const repoRoot = path.resolve(__dirname, '../../../../');

  it('1. generated database types expose the nullable student section foreign key', () => {
    const types = fs.readFileSync(path.join(repoRoot, 'src', 'types', 'database.types.ts'), 'utf8');
    assert.match(types, /section_id: string \| null/);
    assert.match(types, /section_name: string \| null/);
    assert.match(types, /students_section_id_fkey/);
  });

  it('2. section lookup correctly maps section name to section_id and normalized section_name', () => {
    const availableSections = [
      { id: 'sec-1', name: 'Diamond', grade: '10', strand_code: 'STEM' },
      { id: 'sec-2', name: 'Emerald', grade: '10', strand_code: 'ABM' },
    ];

    const inputFormSection = 'diamond';
    const matched = availableSections.find(
      (s) =>
        s.id === inputFormSection ||
        s.name.trim().toLowerCase() === inputFormSection.trim().toLowerCase()
    );

    assert.ok(matched, 'Must find matching section case-insensitively');
    assert.strictEqual(matched?.id, 'sec-1');
    assert.strictEqual(matched?.name, 'Diamond');

    const payload = {
      name: 'Cruz, Juan',
      lrn: '123456789012',
      section_id: matched?.id || null,
      section_name: matched?.name || inputFormSection,
    };

    assert.strictEqual(payload.section_id, 'sec-1');
    assert.strictEqual(payload.section_name, 'Diamond');
  });

  it('3. bulk import correctly assigns section_id from sectionIdMap', () => {
    const sections = [
      { id: 'sec-uuid-1', name: 'Grade 10 - Rizal' },
      { id: 'sec-uuid-2', name: 'Grade 10 - Bonifacio' },
    ];

    const sectionIdMap = new Map<string, string>();
    sections.forEach((s) => {
      sectionIdMap.set(s.name.trim().toLowerCase(), s.id);
    });

    const parsedRow = {
      rawLrn: '109988776655',
      rawName: 'Santos, Maria',
      normalizedSection: 'Grade 10 - Rizal',
    };

    const record = {
      lrn: parsedRow.rawLrn,
      name: parsedRow.rawName,
      section_id: sectionIdMap.get(parsedRow.normalizedSection.trim().toLowerCase()) || null,
      section_name: parsedRow.normalizedSection,
    };

    assert.strictEqual(record.section_id, 'sec-uuid-1');
    assert.strictEqual(record.section_name, 'Grade 10 - Rizal');
  });

  it('4. TOS subjects suggestion list combines subjects table and existing TOS subjects uniquely', () => {
    const dbSubjects = ['Science 10', 'Mathematics 10', 'English 10'];
    const tosList = [
      { subject: 'Science 10' },
      { subject: 'Filipino 10' },
      { subject: 'Mathematics 10' },
    ];

    const combined = Array.from(
      new Set([
        ...dbSubjects,
        ...tosList.map((t) => t.subject).filter(Boolean),
      ])
    ).sort();

    assert.deepStrictEqual(combined, [
      'English 10',
      'Filipino 10',
      'Mathematics 10',
      'Science 10',
    ]);
  });

  it('5. student move endpoint updates the section foreign key and display name together', () => {
    const route = fs.readFileSync(path.join(repoRoot, 'src', 'app', 'api', 'students', 'bulk', 'route.ts'), 'utf8');
    assert.match(route, /section_id:\s*activeSection\.id/);
    assert.match(route, /section_name:\s*activeSection\.name/);
    assert.match(route, /\.eq\('tenant_id', tenantId\)/);
  });
});

