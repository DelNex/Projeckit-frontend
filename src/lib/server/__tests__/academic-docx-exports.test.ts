import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMostLeastLearnedDocx,
  createTermResultsDocx,
  createTosDocx,
  type SchoolReportHeader,
} from '../academic-docx-exports';
import type { TosDocument } from '@/types/tos';

const header: SchoolReportHeader = {
  schoolName: 'Sample School',
  region: 'Region III',
  division: 'Tarlac Province',
  subject: 'Computer Programming',
  term: 'Term 1',
  schoolYear: '2026-2027',
  assessmentTitle: 'Term Examination',
  preparedBy: 'Sample Teacher',
};

describe('DOCX report exports', () => {
  it('generates valid Word package buffers for all report types', async () => {
    const tos = {
      id: 'tos-1', tenant_id: 'tenant-1', subject: header.subject, term: header.term,
      school_year: header.schoolYear, target_items: 6, status: 'final', rows: [
        { id: '1', code: 'COMP-1', description: 'Apply database query syntax', daysTaught: 2 },
        { id: '2', code: 'COMP-2', description: 'Analyze grouped results', daysTaught: 1 },
      ], teacher_name: header.preparedBy,
    } as TosDocument;
    const termRows = [{ sectionName: 'Grade 12 - Sample', cases: 2, items: 6, highest: 5, lowest: 3, mean: 4, pl: (4 / 6) * 100, mps: ((4 / 6) * 100 * 0.98) + 2 }];
    const skillRows = Array.from({ length: 6 }, (_, index) => ({
      itemNumber: index + 1,
      competency: `Competency ${index + 1}`,
      correct: index,
      cases: 5,
      masteryPct: index * 20,
    }));
    const legacyTos = {
      ...tos,
      id: 'tos-legacy',
      target_items: 11,
      rows: Array.from({ length: 11 }, (_, index) => ({
        id: String(index + 1),
        description: `Legacy competency ${index + 1}`,
        daysTaught: 1,
        itemCount: 1,
        percentage: 100 / 11,
        domains: { remembering: 0, understanding: 1, applying: 0, analyzing: 0, evaluating: 0, creating: 0 },
        domainItemNumbers: { remembering: [], understanding: [index + 1], applying: [], analyzing: [], evaluating: [], creating: [] },
        domainDisplay: { remembering: '—', understanding: String(index + 1), applying: '—', analyzing: '—', evaluating: '—', creating: '—' },
      })),
    } as TosDocument;

    const buffers = [
      await createTosDocx(tos, { name: header.schoolName, region: header.region, division: header.division }),
      await createTosDocx(legacyTos, { name: header.schoolName, region: header.region, division: header.division }),
      await createTermResultsDocx(header, termRows),
      await createMostLeastLearnedDocx(header, skillRows),
    ];
    for (const buffer of buffers) {
      assert.ok(buffer.length > 500);
      assert.equal(buffer.subarray(0, 2).toString(), 'PK');
    }
  });
});
