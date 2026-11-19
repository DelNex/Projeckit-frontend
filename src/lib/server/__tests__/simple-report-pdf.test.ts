import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSimpleReportPdf } from '../simple-report-pdf';

test('creates a valid PDF document with escaped text and a cross-reference table', () => {
  const bytes = createSimpleReportPdf('Test Results', 'School | Subject', [
    'Section A | 30 cases | Mean 24.50',
    'Parentheses (and) backslashes \\ are escaped.',
  ]);
  const pdf = new TextDecoder().decode(bytes);
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.includes('/Type /Catalog'));
  assert.ok(pdf.includes('xref'));
  assert.ok(pdf.endsWith('%%EOF'));
  assert.ok(pdf.includes('Section A'));
  assert.ok(pdf.includes('Parentheses \\(and\\) backslashes'));
});

test('splits long reports into multiple pages', () => {
  const lines = Array.from({ length: 100 }, (_, index) => `Report row ${index + 1}`);
  const pdf = new TextDecoder().decode(createSimpleReportPdf('Long Report', 'School', lines));
  assert.ok(pdf.includes('/Count 3'));
  assert.ok(pdf.includes('(Page 3 of 3)'));
});
