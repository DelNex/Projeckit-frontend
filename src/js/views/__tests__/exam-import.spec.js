import { parseOcrText } from '../exam-import.js';

describe('parseOcrText', () => {
  test('parses a typical scanned gradebook line into lrn, name, and responses', () => {
    const rows = parseOcrText(`
      LRN  LEARNER NAME  ITEM1 ITEM2 ITEM3
      109823450001  JUAN DELA CRUZ  1 0 1 1 0
      109823450002  MARIA SANTOS  0 1 1 0 1
    `);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ lrn: '109823450001', name: 'JUAN DELA CRUZ', responses: [1, 0, 1, 1, 0] });
    expect(rows[1]).toEqual({ lrn: '109823450002', name: 'MARIA SANTOS', responses: [0, 1, 1, 0, 1] });
  });

  test('skips header lines and rows without a valid LRN', () => {
    const rows = parseOcrText(`
      GRADE 12 - STEM SECTION A
      1234  WITH LRN ONLY
      short name 1 0 1
      567890123456  A STUDENT  1 1
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0].lrn).toBe('567890123456');
  });

  test('fixes common OCR confusions O->0 and l->1', () => {
    const rows = parseOcrText('109823450003  PEDRO OCAMPO  O l 1 0');
    expect(rows[0].responses).toEqual([0, 1, 1, 0]);
  });

  test('ignores lines with scores only or empty content', () => {
    const rows = parseOcrText('1 0 1 0\n\n     \n109823450004  ANA REYES  1 1 1');
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('ANA REYES');
  });
});
