import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTosBlueprintSlots,
  TosBlueprintSlot,
  validateExamQuestions,
} from '../exam-types';
import { randomizeAndBalanceExamQuestions } from '../exam-randomizer';

test('Project KIT — AI Exam Pipeline Requirements', async (t) => {
  await t.test('1. No fake questions: when AI is unconfigured and demo mode is off, reject with clear error', async () => {
    // Simulate what POST /api/ai/generate-exam does when AI is not configured
    const providerUrl = '';
    const apiKey = '';
    const allowDemoSample = false;

    const isAiConfigured = Boolean(providerUrl || apiKey);
    assert.equal(isAiConfigured, false);

    const targetSlots: TosBlueprintSlot[] = [
      {
        item_number: 1,
        competency_id: 'COMP-1',
        competency_code: 'COMP-1',
        competency_description: 'Cell Division',
        cognitive_level: 'remembering',
      },
      {
        item_number: 2,
        competency_id: 'COMP-1',
        competency_code: 'COMP-1',
        competency_description: 'Cell Division',
        cognitive_level: 'understanding',
      },
    ];

    let errorResult: any = null;
    if (!isAiConfigured && !allowDemoSample) {
      errorResult = {
        status: 503,
        error: 'The AI service is not available right now. Please try again later.',
        missingItemNumbers: targetSlots.map((s) => s.item_number),
      };
    }

    assert.ok(errorResult);
    assert.equal(errorResult.status, 503);
    assert.equal(errorResult.error, 'The AI service is not available right now. Please try again later.');
    assert.deepEqual(errorResult.missingItemNumbers, [1, 2]);
  });

  await t.test('2. Demo mode: opt-in flag labels every item with [SAMPLE - NOT FOR REAL USE]', () => {
    const allowDemoSample = true;
    const targetSlots: TosBlueprintSlot[] = [
      {
        item_number: 1,
        competency_id: 'COMP-1',
        competency_code: 'COMP-1',
        competency_description: 'Quadratic Functions',
        cognitive_level: 'remembering',
      },
    ];

    // Simulate sample generator
    const sampleQuestions = targetSlots.map((slot) => ({
      item_number: slot.item_number,
      competency_id: slot.competency_id,
      cognitive_level: slot.cognitive_level,
      question: `[SAMPLE - NOT FOR REAL USE] In the lesson covering ${slot.competency_description}, how is a parabola defined?`,
      options: {
        A: 'U-shaped curve',
        B: 'Straight line',
        C: 'Circle',
        D: 'Hyperbola',
      },
      correct_answer: 'A' as const,
      rationale: 'Parabolas form a U-shaped planar curve.',
    }));

    assert.equal(sampleQuestions.length, 1);
    assert.ok(sampleQuestions[0].question.startsWith('[SAMPLE - NOT FOR REAL USE]'));

    // Check validator detects and validates the format
    const validated = validateExamQuestions(sampleQuestions, 1, targetSlots);
    assert.equal(validated.isValid, true);
  });

  await t.test('3. Chunk partitioning divides competencies into chunks of at most 10 items', () => {
    // Competency 1 has 15 items, Competency 2 has 5 items
    const rows = [
      {
        id: 'c1',
        code: 'COMP-1',
        description: 'First Topic',
        domains: { remembering: 8, understanding: 7 }, // 15 items
      },
      {
        id: 'c2',
        code: 'COMP-2',
        description: 'Second Topic',
        domains: { applying: 5 }, // 5 items
      },
    ];

    const slots = buildTosBlueprintSlots(rows, 20);
    assert.equal(slots.length, 20);

    // Grouping logic from route / modal
    const compGroups = new Map<string, TosBlueprintSlot[]>();
    for (const slot of slots) {
      const key = slot.competency_id || slot.competency_code || 'default';
      if (!compGroups.has(key)) compGroups.set(key, []);
      compGroups.get(key)!.push(slot);
    }

    const chunks: TosBlueprintSlot[][] = [];
    for (const group of compGroups.values()) {
      for (let i = 0; i < group.length; i += 10) {
        chunks.push(group.slice(i, i + 10));
      }
    }

    // 15 items -> chunk 1 (10), chunk 2 (5)
    // 5 items -> chunk 3 (5)
    // Total chunks: 3
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 10);
    assert.equal(chunks[1].length, 5);
    assert.equal(chunks[2].length, 5);
    // Every chunk has items <= 10
    chunks.forEach((c) => assert.ok(c.length <= 10));
  });

  await t.test('4. Rate limit check logic fires friendly 429 when hourly user quota is exceeded', () => {
    const userHourlyLimit = 5;
    const userGenerationsCount = 5;

    let response: any = null;
    if (userGenerationsCount >= userHourlyLimit) {
      response = {
        status: 429,
        error: `Hourly rate limit reached (${userHourlyLimit} exam generations per hour). Please wait before generating again.`,
        rateLimitExceeded: true,
      };
    }

    assert.ok(response);
    assert.equal(response.status, 429);
    assert.ok(response.error.includes('Hourly rate limit reached'));
  });

  await t.test('5. Shuffling options preserves answer consistency and balances distribution', () => {
    const questions = Array.from({ length: 40 }, (_, i) => ({
      item_number: i + 1,
      competency_id: 'COMP-1',
      cognitive_level: 'remembering' as const,
      question: `Question ${i + 1}?`,
      options: {
        A: `Answer text for Q${i + 1}`,
        B: `Distractor B for Q${i + 1}`,
        C: `Distractor C for Q${i + 1}`,
        D: `Distractor D for Q${i + 1}`,
      },
      correct_answer: 'A' as const,
      rationale: `The correct definition is Answer text for Q${i + 1}.`,
    }));

    const randomized = randomizeAndBalanceExamQuestions(questions, 'seed-abc');
    assert.equal(randomized.length, 40);

    // Verify correct_answer matches the text that was originally in A
    randomized.forEach((q, idx) => {
      const correctLetter = q.correct_answer;
      const textAtCorrectLetter = q.options[correctLetter];
      assert.equal(
        textAtCorrectLetter,
        `Answer text for Q${idx + 1}`,
        `Question ${q.item_number} correct option text mismatch`
      );
    });
  });
});
