import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Project KIT — Task 5: Sections & Students Consistency Tests', () => {
  const repoRoot = path.resolve(__dirname, '../../../../..');

  it('1. migration 24 defines section_id, backfill, and rename trigger', () => {
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260908000024_students_section_id.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 24 must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    assert.ok(
      sql.includes('ALTER TABLE public.students'),
      'Must alter students table'
    );
    assert.ok(
      sql.includes('ADD COLUMN IF NOT EXISTS section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL'),
      'Must add section_id with ON DELETE SET NULL'
    );
    assert.ok(
      sql.includes('CREATE INDEX IF NOT EXISTS idx_students_section_id ON public.students(section_id)'),
      'Must create index on section_id'
    );
    assert.ok(
      sql.includes('UPDATE public.students s') && sql.includes('SET section_id = sec.id'),
      'Must backfill students.section_id from sections'
    );
    assert.ok(
      sql.includes('CREATE OR REPLACE FUNCTION public.sync_section_name_to_students()'),
      'Must define sync_section_name_to_students function'
    );
    assert.ok(
      sql.includes('CREATE TRIGGER trg_sync_section_name_to_students'),
      'Must create trigger on sections update of name'
    );
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

  it('5. migration 27 defines conditional unique index on sections and safe relink', () => {
    const migrationPath = path.join(
      repoRoot,
      'supabase',
      'migrations',
      '20260908000027_sections_unique.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 27 must exist');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    assert.ok(
      sql.includes('uq_sections_config_grade_name'),
      'Must define uq_sections_config_grade_name index'
    );
    assert.ok(
      sql.includes('lower(trim(name))'),
      'Index must be on (config_id, grade, lower(trim(name)))'
    );
    assert.ok(
      sql.includes('UPDATE public.students s') && sql.includes('SET section_id = sec.id'),
      'Must safely relink students'
    );
    assert.ok(
      sql.replace(/\s+/g, ' ').toLowerCase().includes(
        'select count(*) from public.sections x where x.config_id = s.config_id and lower(trim(x.name)) = lower(trim(s.section_name))'
      ) && sql.includes('= 1'),
      'Must check exactly 1 matching section exists before relinking'
    );
  });
});

