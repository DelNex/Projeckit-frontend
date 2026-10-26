export type AnswerSet = Record<string | number, unknown> | Array<unknown> | null | undefined;

export function normalizeAnswer(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

export function getItemAnswer(answers: AnswerSet, itemNumber: number): string {
  if (Array.isArray(answers)) return normalizeAnswer(answers[itemNumber - 1]);
  if (!answers || typeof answers !== 'object') return '';
  const value = answers[String(itemNumber)] ?? answers[itemNumber - 1];
  return normalizeAnswer(value);
}

export function isAnswerCorrect(
  answers: AnswerSet,
  answerKey: AnswerSet,
  itemNumber: number,
  itemStates?: Record<string | number, unknown>
): boolean {
  const state = normalizeAnswer(itemStates?.[String(itemNumber)] ?? itemStates?.[itemNumber - 1]);
  if (state === 'ERASED_MARK' || state === 'MULTIPLE_MARK') return false;
  const selected = getItemAnswer(answers, itemNumber);
  const correct = getItemAnswer(answerKey, itemNumber);
  return Boolean(selected && correct && selected === correct);
}

export interface AssessmentScore {
  score: number;
  totalItems: number;
  percentage: number;
}

/** Convert Percentage of Learner (raw percent) to the school's DepEd MPS value. */
export function percentageToMps(pl: number): number {
  return Number.isFinite(pl) ? (pl * 0.98) + 2 : 0;
}

/** One canonical raw-score rule for scan saving and all item-count analytics. */
export function calculateAssessmentScore(
  answers: AnswerSet,
  answerKey: AnswerSet,
  itemCount: number,
  itemStates?: Record<string | number, unknown>
): AssessmentScore {
  const totalItems = Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;
  let score = 0;
  for (let itemNumber = 1; itemNumber <= totalItems; itemNumber++) {
    if (isAnswerCorrect(answers, answerKey, itemNumber, itemStates)) score++;
  }
  return {
    score,
    totalItems,
    percentage: totalItems ? Math.round((score / totalItems) * 1000) / 10 : 0,
  };
}
