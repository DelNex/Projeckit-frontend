import { expect, test } from '@playwright/test';
import expectedAnswerSets from '../src/features/omr/__tests__/fixtures/expected-answers.json';
import { calculateAssessmentScore, isAnswerCorrect } from '../src/lib/assessment-scoring';

type BrowserAnswer = {
  question: number;
  selected: string | null;
  expected: string | null;
  state: string;
  scores: Record<string, number> | null;
};

type BrowserReport = {
  outcome: string;
  imageHash?: string;
  correct?: number;
  total?: number;
  accuracy?: number;
  fiducialDetected?: boolean;
  openCvDiagnostics?: { status?: string };
  answers?: BrowserAnswer[];
  error?: string;
  inputParity?: {
    cameraBlob?: { passed?: boolean; detectedItems?: number; accuracy?: number; mimeType?: string };
    uploadFile?: { passed?: boolean; detectedItems?: number; accuracy?: number; mimeType?: string };
    sameAnswers?: boolean;
  };
};

const REAL_WORLD_IMAGE_SHA256 =
  'e4547385de6520dacf816ad90f183d5749d0151a503ebc7e8dd933652e20f068';
const answerKey = (expectedAnswerSets as Record<string, (string | null)[]>)['real_world_scan.png'];

test('scores the actual real-world OMR scan and rejects a wrong detected option', async ({ page }) => {
  expect(answerKey).toHaveLength(60);

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  // This page fetches real_world_scan.png and runs the website's actual
  // processOmrScan -> native OpenCV worker pipeline in Chromium.
  await page.goto('/omr-validation');
  const output = page.getByTestId('omr-browser-result');
  await expect(output).not.toHaveText('RUNNING', { timeout: 60_000 });

  const report = JSON.parse(await output.textContent() || '{}') as BrowserReport;
  expect(report.error).toBeUndefined();
  expect(report.outcome).toBe('PASS');
  expect(report.imageHash).toBe(REAL_WORLD_IMAGE_SHA256);
  expect(report.fiducialDetected).toBe(true);
  expect(report.openCvDiagnostics?.status).toBe('used');
  expect(report.answers).toHaveLength(60);
  expect(report.inputParity?.cameraBlob).toMatchObject({
    passed: true,
    detectedItems: 60,
    accuracy: 1,
  });
  expect(report.inputParity?.uploadFile).toMatchObject({
    passed: true,
    detectedItems: 60,
    accuracy: 1,
  });
  expect(report.inputParity?.cameraBlob?.mimeType).toBe('image/jpeg');
  expect(report.inputParity?.uploadFile?.mimeType).toBe('image/png');
  expect(report.inputParity?.sameAnswers).toBe(true);

  const orderedAnswers = [...report.answers!].sort(
    (left, right) => left.question - right.question,
  );
  const detectedAnswers = orderedAnswers.map((answer, index) => {
    expect(answer.question).toBe(index + 1);
    expect(answer.expected).toBe(answerKey[index]);
    expect(answer.selected).toBe(answerKey[index]);
    expect(answer.state).toBe('MARKED');

    const selectedScore = answer.scores?.[answer.selected || ''] ?? 0;
    const runnerUpScore = Math.max(
      0,
      ...Object.entries(answer.scores || {})
        .filter(([choice]) => choice !== answer.selected)
        .map(([, score]) => score),
    );
    expect(
      selectedScore - runnerUpScore,
      `Q${answer.question}: selected bubble must beat every alternative`,
    ).toBeGreaterThan(0.3);
    return answer.selected;
  });
  const detectedStates = Object.fromEntries(
    orderedAnswers.map((answer) => [answer.question, answer.state]),
  );

  // Independently score the browser's actual detected choices with the same
  // canonical scoring helper used by assessment saving and analytics.
  const actualScore = calculateAssessmentScore(
    detectedAnswers,
    answerKey,
    answerKey.length,
    detectedStates,
  );
  expect(actualScore).toEqual({
    score: 60,
    totalItems: 60,
    percentage: 100,
  });

  // Negative control: Q1's answer key is A. If the scanner reports C instead,
  // C must be scored wrong even though it is a valid, confidently shaded bubble.
  expect(answerKey[0]).toBe('A');
  const deliberatelyWrongAnswers = [...detectedAnswers];
  deliberatelyWrongAnswers[0] = 'C';
  expect(isAnswerCorrect(deliberatelyWrongAnswers, answerKey, 1)).toBe(false);

  const wrongAnswerScore = calculateAssessmentScore(
    deliberatelyWrongAnswers,
    answerKey,
    answerKey.length,
    detectedStates,
  );
  expect(wrongAnswerScore).toEqual({
    score: 59,
    totalItems: 60,
    percentage: 98.3,
  });
  expect(wrongAnswerScore.score).toBeLessThan(actualScore.score);
  expect(pageErrors).toEqual([]);
});
