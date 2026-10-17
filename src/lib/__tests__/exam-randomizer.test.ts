/**
 * Project KIT — Exam Option Randomizer Unit Tests
 * Validates balanced A-D distribution (<=35% per letter),
 * max 3 consecutive identical answers, rationale text integrity, and seeded reproducibility.
 */

import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  generateBalancedAnswerKeys,
  randomizeAndBalanceExamQuestions,
  createSeededRandom,
} from '../exam-randomizer';
import { ExamQuestion } from '../exam-types';

describe('Project KIT — Exam Option Randomizer & Balancer Tests', () => {
  it('1. balances 40 items across A-D with no letter exceeding 35% and max 3 identical in a row', () => {
    const rng = createSeededRandom(12345);
    const keys = generateBalancedAnswerKeys(40, rng);

    assert.strictEqual(keys.length, 40);

    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    keys.forEach((k) => counts[k]++);

    // 40 items: 25% is 10 items. 35% is 14 items.
    for (const letter of ['A', 'B', 'C', 'D']) {
      assert.ok(
        counts[letter] <= 14,
        `Letter ${letter} has ${counts[letter]} occurrences, exceeding 35% limit (14)`
      );
      assert.ok(
        counts[letter] >= 6,
        `Letter ${letter} has only ${counts[letter]} occurrences, too low`
      );
    }

    // Check no 4 identical consecutive answers
    for (let i = 3; i < keys.length; i++) {
      const isFourInARow =
        keys[i] === keys[i - 1] &&
        keys[i] === keys[i - 2] &&
        keys[i] === keys[i - 3];
      assert.strictEqual(
        isFourInARow,
        false,
        `Found 4 consecutive identical answers at index ${i}: ${keys.slice(i - 3, i + 1).join(', ')}`
      );
    }
  });

  it('2. shuffles questions, updates correct_answer and maintains correct text association', () => {
    const sampleQuestions: ExamQuestion[] = Array.from({ length: 40 }, (_, i) => ({
      item_number: i + 1,
      competency_id: 'COMP-1',
      cognitive_level: 'remembering',
      question: `Question ${i + 1} regarding biological processes?`,
      options: {
        A: `Correct answer for Q${i + 1}`,
        B: `Distractor B for Q${i + 1}`,
        C: `Distractor C for Q${i + 1}`,
        D: `Distractor D for Q${i + 1}`,
      },
      correct_answer: 'A', // All start as 'A'
      rationale: `Option A is correct because of photosynthesis evidence.`,
    }));

    const randomized = randomizeAndBalanceExamQuestions(sampleQuestions, 42);

    assert.strictEqual(randomized.length, 40);

    // Verify all questions still have their original correct text under the new correct_answer key
    randomized.forEach((q, i) => {
      const expectedText = `Correct answer for Q${i + 1}`;
      assert.strictEqual(
        q.options[q.correct_answer],
        expectedText,
        `Item ${q.item_number} correct_answer '${q.correct_answer}' does not point to original correct text`
      );

      // Verify rationale references the correct text
      assert.ok(
        q.rationale.includes(expectedText) || q.rationale.includes(q.correct_answer),
        `Item ${q.item_number} rationale does not properly reference answer`
      );
    });

    // Check letter distribution across the exam
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    randomized.forEach((q) => counts[q.correct_answer]++);

    for (const letter of ['A', 'B', 'C', 'D']) {
      assert.ok(counts[letter] <= 14, `Letter ${letter} count ${counts[letter]} > 14`);
      assert.ok(counts[letter] >= 7, `Letter ${letter} count ${counts[letter]} < 7`);
    }

    // Check no 4 in a row
    for (let i = 3; i < randomized.length; i++) {
      const isFour =
        randomized[i].correct_answer === randomized[i - 1].correct_answer &&
        randomized[i].correct_answer === randomized[i - 2].correct_answer &&
        randomized[i].correct_answer === randomized[i - 3].correct_answer;
      assert.strictEqual(isFour, false, `4 in a row at ${i}`);
    }
  });

  it('3. produces identical deterministic results with the same seed', () => {
    const questions: ExamQuestion[] = [
      {
        item_number: 1,
        competency_id: 'COMP-1',
        cognitive_level: 'remembering',
        question: 'What is water?',
        options: { A: 'H2O', B: 'CO2', C: 'NaCl', D: 'O2' },
        correct_answer: 'A',
        rationale: 'H2O is water.',
      },
      {
        item_number: 2,
        competency_id: 'COMP-1',
        cognitive_level: 'remembering',
        question: 'What is salt?',
        options: { A: 'NaCl', B: 'H2O', C: 'CO2', D: 'O2' },
        correct_answer: 'A',
        rationale: 'NaCl is salt.',
      },
    ];

    const run1 = randomizeAndBalanceExamQuestions(questions, 'seed-abc');
    const run2 = randomizeAndBalanceExamQuestions(questions, 'seed-abc');

    assert.deepStrictEqual(run1, run2);
  });
});

