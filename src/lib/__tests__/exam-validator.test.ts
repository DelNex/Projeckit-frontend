import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateExamQuestions,
  buildTosBlueprintSlots,
  ExamQuestion,
  TosBlueprintSlot,
} from '../exam-types';

test('AI Exam Validator — Unit Tests', async (t) => {
  await t.test('1. Correct JSON passes without changes', () => {
    const slots: TosBlueprintSlot[] = [
      {
        item_number: 1,
        competency_id: 'COMP-1',
        competency_code: 'COMP-1',
        competency_description: 'Solve rational equations',
        cognitive_level: 'remembering',
      },
      {
        item_number: 2,
        competency_id: 'COMP-1',
        competency_code: 'COMP-1',
        competency_description: 'Solve rational equations',
        cognitive_level: 'understanding',
      },
    ];

    const inputQuestions: ExamQuestion[] = [
      {
        item_number: 1,
        competency_id: 'COMP-1',
        cognitive_level: 'remembering',
        question: 'Which of the following is a rational function?',
        options: {
          A: 'f(x) = (x + 1)/(x - 2)',
          B: 'f(x) = sqrt(x)',
          C: 'f(x) = 2^x',
          D: 'f(x) = |x|',
        },
        correct_answer: 'A',
        rationale: 'A rational function is an algebraic fraction of polynomials.',
      },
      {
        item_number: 2,
        competency_id: 'COMP-1',
        cognitive_level: 'understanding',
        question: 'What is the vertical asymptote of f(x) = 1/(x - 3)?',
        options: {
          A: 'x = 3',
          B: 'x = -3',
          C: 'y = 0',
          D: 'y = 3',
        },
        correct_answer: 'A',
        rationale: 'Vertical asymptote occurs where denominator is zero.',
      },
    ];

    const result = validateExamQuestions(inputQuestions, 2, slots);
    assert.equal(result.isValid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.missingItemNumbers.length, 0);
    assert.equal(result.repairedQuestions.length, 2);
    assert.equal(result.distributionMatchesTOS, true);
    assert.equal(result.repairedQuestions[0].question, inputQuestions[0].question);
  });

  await t.test('2. 48 of 50 items: validator flags the 2 missing numbers', () => {
    // Generate 48 items, missing items 25 and 50
    const rawQuestions: any[] = [];
    for (let i = 1; i <= 50; i++) {
      if (i === 25 || i === 50) continue;
      rawQuestions.push({
        item_number: i,
        competency_id: 'COMP-1',
        cognitive_level: 'remembering',
        question: `Question ${i}?`,
        options: { A: 'A', B: 'B', C: 'C', D: 'D' },
        correct_answer: 'A',
        rationale: `Explanation ${i}`,
      });
    }

    const result = validateExamQuestions(rawQuestions, 50);
    assert.equal(result.isValid, false);
    assert.deepEqual(result.missingItemNumbers, [25, 50]);
    assert.ok(result.errors.some((e) => e.includes('Missing items: 25, 50')));
    assert.equal(result.repairedQuestions.length, 48);
  });

  await t.test('3. Malformed options, missing correct_answer, invalid cognitive_level: validator catches and repairs/rejects', () => {
    const rawQuestions = [
      {
        // Malformed options (array format or missing D)
        item_number: 1,
        question: 'What is photosynthesis?',
        options: { A: 'Process of plants making food', B: 'Respiration', C: 'Digestion' }, // Missing D
        correct_answer: 'InvalidOption', // Invalid
        cognitive_level: 'super_high_thinking', // Invalid level
      },
    ];

    const result = validateExamQuestions(rawQuestions, 1);
    assert.equal(result.isValid, false);
    // Catches missing option D
    assert.ok(result.errors.some((e) => e.includes('options (A-D) are blank')));
    // Catches invalid correct answer
    assert.ok(result.errors.some((e) => e.includes('Invalid or missing correct answer')));
    // Repairs cognitive level to fallback
    assert.equal(result.repairedQuestions[0].cognitive_level, 'remembering');
  });

  await t.test('4. Cognitive levels match the TOS matrix exactly', () => {
    const slots: TosBlueprintSlot[] = [
      {
        item_number: 1,
        competency_id: 'COMP-1',
        competency_code: 'COMP-1',
        competency_description: 'Competency 1',
        cognitive_level: 'remembering',
      },
      {
        item_number: 2,
        competency_id: 'COMP-1',
        competency_code: 'COMP-1',
        competency_description: 'Competency 1',
        cognitive_level: 'evaluating',
      },
    ];

    const questionsMismatched: ExamQuestion[] = [
      {
        item_number: 1,
        competency_id: 'COMP-1',
        cognitive_level: 'remembering',
        question: 'Q1',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correct_answer: 'A',
        rationale: 'R1',
      },
      {
        item_number: 2,
        competency_id: 'COMP-1',
        cognitive_level: 'understanding', // Expected evaluating!
        question: 'Q2',
        options: { A: '1', B: '2', C: '3', D: '4' },
        correct_answer: 'B',
        rationale: 'R2',
      },
    ];

    const result = validateExamQuestions(questionsMismatched, 2, slots);
    assert.equal(result.distributionMatchesTOS, false);
  });

  await t.test('5. buildTosBlueprintSlots accurately expands Bloom domains into item slots', () => {
    const tosRows = [
      {
        id: 'c1',
        code: 'M11GM-Ia-1',
        description: 'Represents real-life situations using functions',
        domains: {
          remembering: 2,
          understanding: 1,
          applying: 1,
          analyzing: 0,
          evaluating: 0,
          creating: 0,
        },
      },
      {
        id: 'c2',
        code: 'M11GM-Ia-2',
        description: 'Evaluates functions',
        domains: {
          remembering: 1,
          understanding: 0,
          applying: 1,
          analyzing: 0,
          evaluating: 0,
          creating: 0,
        },
      },
    ];

    const slots = buildTosBlueprintSlots(tosRows, 6);
    assert.equal(slots.length, 6);
    assert.equal(slots[0].item_number, 1);
    assert.equal(slots[0].cognitive_level, 'remembering');
    assert.equal(slots[1].cognitive_level, 'remembering');
    assert.equal(slots[2].cognitive_level, 'understanding');
    assert.equal(slots[3].cognitive_level, 'applying');
    assert.equal(slots[4].cognitive_level, 'remembering');
    assert.equal(slots[5].cognitive_level, 'applying');
  });

  await t.test('6. Rejects questions with duplicate options', () => {
    const rawQuestions = [
      {
        item_number: 1,
        question: 'What is 2 + 2?',
        options: {
          A: '4',
          B: '4', // duplicate
          C: '5',
          D: '6',
        },
        correct_answer: 'A',
      },
    ];

    const result = validateExamQuestions(rawQuestions, 1);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('Duplicate options detected')));
  });

  await t.test('7. Detects duplicate question stems across the exam', () => {
    const rawQuestions = [
      {
        item_number: 1,
        question: 'What is the speed of light in vacuum?',
        options: { A: '3x10^8 m/s', B: '3x10^6 m/s', C: '3x10^4 m/s', D: '3x10^2 m/s' },
        correct_answer: 'A',
      },
      {
        item_number: 2,
        question: 'What is the speed of light in vacuum?', // duplicate stem
        options: { A: 'Approx 300,000 km/s', B: '150,000 km/s', C: '75,000 km/s', D: '1,000 km/s' },
        correct_answer: 'A',
      },
    ];

    const result = validateExamQuestions(rawQuestions, 2);
    assert.equal(result.isValid, false);
    assert.ok(result.errors.some((e) => e.includes('Duplicate question detected across exam')));
  });
});

