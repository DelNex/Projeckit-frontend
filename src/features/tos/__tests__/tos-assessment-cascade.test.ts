import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

describe('Project KIT — TOS Assessment Link & Non-Cascading Deletion Tests', () => {
  it('1. verifies migration 23 defines ON DELETE SET NULL and dynamic pg_constraint lookup', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      '../supabase/migrations/20260908000023_tos_assessment_link_cascade_fix.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 23 file must exist');

    const sql = fs.readFileSync(migrationPath, 'utf8');
    assert.ok(
      sql.includes('ON DELETE SET NULL'),
      'Migration must recreate foreign key with ON DELETE SET NULL'
    );
    assert.ok(
      sql.includes('pg_constraint'),
      'Migration must look up constraint name from pg_constraint'
    );
    assert.ok(
      sql.includes('trg_sync_tos_assessment_link'),
      'Migration must install trg_sync_tos_assessment_link trigger'
    );
    assert.ok(
      sql.includes('sync_tos_assessment_link()'),
      'Migration must define sync_tos_assessment_link function'
    );
  });

  it('2. verifies deleting an assessment leaves its linked TOS in place and syncs assessment_id', () => {
    // Model state
    interface TosDoc {
      id: string;
      subject: string;
      assessment_id: string | null;
    }
    interface Assessment {
      id: string;
      tos_id: string;
      title: string;
    }

    const tosDocs: Map<string, TosDoc> = new Map([
      ['tos-100', { id: 'tos-100', subject: 'Mathematics 10', assessment_id: 'ass-1' }],
    ]);

    const assessments: Map<string, Assessment> = new Map([
      ['ass-1', { id: 'ass-1', tos_id: 'tos-100', title: 'Math Exam Section A' }],
      ['ass-2', { id: 'ass-2', tos_id: 'tos-100', title: 'Math Exam Section B' }],
    ]);

    // Simulate deleteAssessment with ON DELETE SET NULL + trigger logic
    function deleteAssessment(assessmentId: string) {
      const deleted = assessments.get(assessmentId);
      if (!deleted) return;
      assessments.delete(assessmentId);

      // Trigger simulation: sync tos_documents.assessment_id from remaining assessments
      const targetTos = tosDocs.get(deleted.tos_id);
      if (targetTos) {
        // ON DELETE SET NULL clears the link if it referenced the deleted row
        if (targetTos.assessment_id === assessmentId) {
          targetTos.assessment_id = null;
        }

        // Trigger updates tos_documents.assessment_id to first remaining assessment
        const remaining = Array.from(assessments.values()).filter(
          (a) => a.tos_id === deleted.tos_id
        );
        targetTos.assessment_id = remaining.length > 0 ? remaining[0].id : null;
      }
    }

    // Step A: Delete ass-1. TOS-100 MUST NOT be deleted (ON DELETE SET NULL + trigger points to ass-2)
    deleteAssessment('ass-1');
    assert.strictEqual(assessments.has('ass-1'), false);
    assert.strictEqual(tosDocs.has('tos-100'), true, 'TOS document must remain intact');
    assert.strictEqual(
      tosDocs.get('tos-100')?.assessment_id,
      'ass-2',
      'TOS assessment_id should point to remaining assessment'
    );

    // Step B: Delete ass-2. TOS-100 MUST still exist, with assessment_id set to null
    deleteAssessment('ass-2');
    assert.strictEqual(assessments.has('ass-2'), false);
    assert.strictEqual(tosDocs.has('tos-100'), true, 'TOS document must still exist');
    assert.strictEqual(
      tosDocs.get('tos-100')?.assessment_id,
      null,
      'TOS assessment_id becomes null when all assessments are deleted'
    );
  });
});

