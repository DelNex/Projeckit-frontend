export interface ItemResponseScan {
  id: string;
  student_id: string | null;
  detected_roll_number: number | null;
  status: string;
  created_at: string;
  normalized_answers?: unknown;
  raw_answers?: unknown;
}

export interface ItemChoiceCount {
  choice: string;
  count: number;
  correct: boolean;
}

export interface ItemChoiceDistribution {
  itemNumber: number;
  correctAnswer: string;
  choices: ItemChoiceCount[];
  unanswered: number;
  invalidMarks: number;
  cases: number;
}

export function readScanItemStates(scan: Pick<ItemResponseScan, 'raw_answers'>): Record<number, string> {
  const raw = scan.raw_answers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const states = (raw as Record<string, unknown>)._itemStates;
  if (!states || typeof states !== 'object' || Array.isArray(states)) return {};
  return Object.fromEntries(Object.entries(states as Record<string, unknown>)
    .filter(([key, state]) => Number.isInteger(Number(key)) && Number(key) > 0 && typeof state === 'string')
    .map(([key, state]) => [Number(key), state as string]));
}

export function readScanAnswers(scan: Pick<ItemResponseScan, 'normalized_answers' | 'raw_answers'>): Record<number, string> {
  const raw = scan.raw_answers;
  const normalized = scan.normalized_answers;
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : normalized;
  const answers: Record<number, string> = {};
  if (Array.isArray(source)) {
    source.forEach((value, index) => {
      if (typeof value === 'string' && value.trim()) answers[index + 1] = value.trim().toUpperCase();
    });
  } else if (source && typeof source === 'object') {
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      const itemNumber = Number(key);
      if (Number.isInteger(itemNumber) && itemNumber > 0 && typeof value === 'string' && value.trim()) {
        answers[itemNumber] = value.trim().toUpperCase();
      }
    }
  }
  return answers;
}

/** Keep the newest graded scan per identified learner so reshoots do not inflate the counts. */
export function deduplicateItemScans<T extends ItemResponseScan>(scans: T[]): T[] {
  const sorted = [...scans].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const seen = new Set<string>();
  const latest: T[] = [];
  for (const scan of sorted) {
    // Only confirmed, scored sheets are evidence for learning reports. Pending
    // and review-required scans remain visible in the scanner for correction.
    if (!['PROCESSED', 'GRADED', 'EVALUATED'].includes(String(scan.status).toUpperCase())) continue;
    const identity = scan.student_id
      ? `student:${scan.student_id}`
      : scan.detected_roll_number !== null
        ? `roll:${scan.detected_roll_number}`
        : `scan:${scan.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    latest.push(scan);
  }
  return latest;
}

export function calculateItemChoiceDistributions(
  scans: ItemResponseScan[],
  answerKey: Record<string, unknown>,
  itemCount: number,
  choices: string[] = ['A', 'B', 'C', 'D']
): ItemChoiceDistribution[] {
  const graded = deduplicateItemScans(scans).map((scan) => ({ scan, answers: readScanAnswers(scan) }));
  return Array.from({ length: itemCount }, (_, index) => {
    const itemNumber = index + 1;
    const correctAnswer = String(answerKey[String(itemNumber)] || '').trim().toUpperCase();
    const counts = new Map(choices.map((choice) => [choice, 0]));
    let unanswered = 0;
    let invalidMarks = 0;
    for (const { scan, answers } of graded) {
      const selected = answers[itemNumber];
      const state = readScanItemStates(scan)[itemNumber];
      if (state === 'MULTIPLE_MARK' || state === 'ERASED_MARK') invalidMarks++;
      else if (selected && counts.has(selected)) counts.set(selected, (counts.get(selected) || 0) + 1);
      else unanswered++;
    }
    return {
      itemNumber,
      correctAnswer,
      choices: choices.map((choice) => ({ choice, count: counts.get(choice) || 0, correct: choice === correctAnswer })),
      unanswered,
      invalidMarks,
      cases: graded.length,
    };
  });
}
