/**
 * Project KIT — Exam Option Randomizer & Answer Key Balancer
 * Shuffles multiple-choice options server-side using seeded randomness,
 * balances correct answers evenly across A-D, prevents 4 identical consecutive keys,
 * and maintains rationale text references.
 */

import { ExamQuestion } from './exam-types';

/**
 * Fast, deterministic Mulberry32 PRNG.
 */
export function createSeededRandom(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Creates a numeric seed from a string or default timestamp.
 */
export function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

const CHOICES: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

/**
 * Generates a balanced distribution of answer letters across N items:
 * - No letter exceeds ~35% of the total exam
 * - No more than 3 identical answers in a row (e.g. no A-A-A-A)
 */
export function generateBalancedAnswerKeys(totalItems: number, rng: () => number): Array<'A' | 'B' | 'C' | 'D'> {
  if (totalItems <= 0) return [];
  if (totalItems <= 3) {
    // For 1-3 items, simply pick random choices
    return Array.from({ length: totalItems }, () => CHOICES[Math.floor(rng() * 4)]);
  }

  // 1. Build balanced base pool
  const pool: Array<'A' | 'B' | 'C' | 'D'> = [];
  const baseCount = Math.floor(totalItems / 4);
  const remainder = totalItems % 4;

  for (let i = 0; i < 4; i++) {
    const count = baseCount + (i < remainder ? 1 : 0);
    for (let c = 0; c < count; c++) {
      pool.push(CHOICES[i]);
    }
  }

  // 2. Fisher-Yates shuffle with seeded RNG
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }

  // 3. Prevent > 3 identical answers in a row
  for (let i = 3; i < pool.length; i++) {
    if (pool[i] === pool[i - 1] && pool[i] === pool[i - 2] && pool[i] === pool[i - 3]) {
      // Find a later element that differs to swap with
      let swapIdx = -1;
      for (let j = i + 1; j < pool.length; j++) {
        if (pool[j] !== pool[i]) {
          swapIdx = j;
          break;
        }
      }
      if (swapIdx !== -1) {
        const temp = pool[i];
        pool[i] = pool[swapIdx];
        pool[swapIdx] = temp;
      } else {
        // If at the end, find an earlier valid swap position
        for (let j = 0; j < i - 3; j++) {
          if (pool[j] !== pool[i] && pool[j + 1] !== pool[i]) {
            const temp = pool[i];
            pool[i] = pool[j];
            pool[j] = temp;
            break;
          }
        }
      }
    }
  }

  return pool;
}

/**
 * Cleans the rationale so it references the correct text rather than an outdated option letter.
 */
export function updateRationaleReferences(
  rationale: string,
  oldLetter: string,
  newLetter: string,
  correctText: string
): string {
  if (!rationale) {
    return `"${correctText}" is the correct answer according to the lesson material.`;
  }

  // Replace explicit mentions of "Option A", "Choice B", "(C)", etc. with the new correct text/letter
  let updated = rationale
    .replace(new RegExp(`\\b(Option|Choice)\\s+${oldLetter}\\b`, 'gi'), `Option ${newLetter} ("${correctText}")`)
    .replace(new RegExp(`\\(${oldLetter}\\)`, 'g'), `(${newLetter})`);

  // If rationale does not mention the text, prepend/clarify
  if (!updated.includes(correctText) && correctText.length > 3) {
    updated = `The correct answer is "${correctText}". ${updated}`;
  }

  return updated.trim();
}

/**
 * Shuffles options for all questions in an exam, balancing correct answers across A-D.
 */
export function randomizeAndBalanceExamQuestions(
  questions: ExamQuestion[],
  seedInput?: string | number
): ExamQuestion[] {
  if (!questions || questions.length === 0) return [];

  const seed = typeof seedInput === 'number'
    ? seedInput
    : typeof seedInput === 'string'
    ? hashStringToSeed(seedInput)
    : Math.floor(Math.random() * 1000000);

  const rng = createSeededRandom(seed);
  const targetKeys = generateBalancedAnswerKeys(questions.length, rng);

  return questions.map((q, idx) => {
    const oldCorrectLetter = q.correct_answer;
    const correctText = q.options[oldCorrectLetter];
    const targetCorrectLetter = targetKeys[idx] || 'A';

    // Collect distractors
    const distractors: string[] = [];
    CHOICES.forEach((letter) => {
      if (letter !== oldCorrectLetter) {
        distractors.push(q.options[letter]);
      }
    });

    // Shuffle distractors
    for (let i = distractors.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = distractors[i];
      distractors[i] = distractors[j];
      distractors[j] = temp;
    }

    // Assign to new option slots
    const newOptions: { A: string; B: string; C: string; D: string } = {
      A: '',
      B: '',
      C: '',
      D: '',
    };

    newOptions[targetCorrectLetter] = correctText;

    let distractorIdx = 0;
    CHOICES.forEach((letter) => {
      if (letter !== targetCorrectLetter) {
        newOptions[letter] = distractors[distractorIdx++] || `Alternative choice ${letter}`;
      }
    });

    const updatedRationale = updateRationaleReferences(
      q.rationale,
      oldCorrectLetter,
      targetCorrectLetter,
      correctText
    );

    return {
      ...q,
      options: newOptions,
      correct_answer: targetCorrectLetter,
      rationale: updatedRationale,
    };
  });
}

