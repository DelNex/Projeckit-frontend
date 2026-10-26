export interface SavedAssessmentResponse {
  id: string;
  assessment_id: string;
  student_id: string | null;
  student_lrn: string | null;
  section_name?: string | null;
  score: number | null;
  status: string;
  scanned_at: string;
  raw_response?: unknown;
}

export interface SectionTermMetrics {
  sectionName: string;
  cases: number;
  items: number;
  highest: number | null;
  lowest: number | null;
  mean: number | null;
  pl: number | null;
  mps: number | null;
}

function learnerKey(response: SavedAssessmentResponse): string | null {
  if (response.student_id) return `student:${response.student_id}`;
  const lrn = response.student_lrn?.trim().toLowerCase();
  return lrn ? `lrn:${lrn}` : null;
}

/** Select one latest graded response per learner and assessment. */
export function deduplicateScoredResponses<T extends SavedAssessmentResponse>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const score = Number(row.score);
    if (!['GRADED', 'EVALUATED'].includes(String(row.status || '').toUpperCase()) || !Number.isFinite(score)) continue;
    const key = learnerKey(row);
    // Without a learner id/LRN, don't silently count anonymous scans as learners.
    if (!key) continue;
    const compoundKey = `${row.assessment_id}:${key}`;
    const previous = latest.get(compoundKey);
    if (!previous || Date.parse(row.scanned_at || '') >= Date.parse(previous.scanned_at || '')) {
      latest.set(compoundKey, row);
    }
  }
  return Array.from(latest.values());
}

export function calculateSectionTermMetrics(
  sectionName: string,
  rows: SavedAssessmentResponse[],
  items: number
): SectionTermMetrics {
  const cases = deduplicateScoredResponses(rows);
  if (!cases.length || items <= 0) {
    return { sectionName, cases: cases.length, items, highest: null, lowest: null, mean: null, pl: null, mps: null };
  }

  const scores = cases.map((row) => Number(row.score));
  const mean = scores.reduce((sum, score) => sum + score, 0) / cases.length;
  const pl = (mean / items) * 100;
  const mps = percentageToMps(pl);
  return {
    sectionName,
    cases: cases.length,
    items,
    highest: Math.max(...scores),
    lowest: Math.min(...scores),
    mean,
    pl,
    mps,
  };
}

/** The supplied sample's Average row is a simple mean of section rows, not pooled by cases. */
export function calculateSectionAverage(rows: SectionTermMetrics[]): Omit<SectionTermMetrics, 'sectionName' | 'cases' | 'items' | 'highest' | 'lowest'> {
  const populated = rows.filter((row) => row.cases > 0 && row.mean !== null && row.pl !== null && row.mps !== null);
  if (!populated.length) return { mean: null, pl: null, mps: null };
  return {
    mean: populated.reduce((sum, row) => sum + (row.mean || 0), 0) / populated.length,
    pl: populated.reduce((sum, row) => sum + (row.pl || 0), 0) / populated.length,
    mps: populated.reduce((sum, row) => sum + (row.mps || 0), 0) / populated.length,
  };
}

export function readSelectedOption(raw: unknown, itemNumber: number): string {
  let value: unknown;
  if (Array.isArray(raw)) value = raw[itemNumber - 1];
  else if (raw && typeof raw === 'object') {
    const object = raw as Record<string, unknown>;
    value = object[String(itemNumber)] ?? object[itemNumber - 1];
  }
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}
import { percentageToMps } from '@/lib/assessment-scoring';
