import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createExamFromTosRpc } from '../services/tos-exam-rpc';

describe('Project KIT — Save Examination create_exam_from_tos RPC Tests', () => {
  it('1. correctly invokes create_exam_from_tos RPC with verified payload', async () => {
    let calledRpcName = '';
    let calledPayload: any = null;

    const mockSupabase = {
      rpc: async (fnName: string, payload: any) => {
        calledRpcName = fnName;
        calledPayload = payload;
        return {
          data: ['assessment-uuid-1', 'assessment-uuid-2'],
          error: null,
        };
      },
    };

    const tosId = '00000000-0000-0000-0000-000000000001';
    const examDate = '2026-10-25';
    const sampleQuestions = [
      {
        item_number: 1,
        question: 'What is photosynthesis?',
        options: { A: 'Process', B: 'Animal', C: 'Mineral', D: 'Gas' },
        correct_answer: 'A',
      },
      {
        item_number: 2,
        question: 'Which organelle contains chlorophyll?',
        options: { A: 'Mitochondria', B: 'Chloroplast', C: 'Nucleus', D: 'Ribosome' },
        correct_answer: 'B',
      },
    ];

    const result = await createExamFromTosRpc(mockSupabase, {
      p_tos_id: tosId,
      p_exam_date: examDate,
      p_questions: sampleQuestions,
    });

    assert.strictEqual(calledRpcName, 'create_exam_from_tos');
    assert.deepStrictEqual(calledPayload, {
      p_tos_id: tosId,
      p_exam_date: examDate,
      p_questions: sampleQuestions,
    });
    assert.deepStrictEqual(result, ['assessment-uuid-1', 'assessment-uuid-2']);
  });

  it('2. converts empty examDate string to null in RPC payload', async () => {
    let capturedPayload: any = null;

    const mockSupabase = {
      rpc: async (_fnName: string, payload: any) => {
        capturedPayload = payload;
        return { data: ['uuid-1'], error: null };
      },
    };

    await createExamFromTosRpc(mockSupabase, {
      p_tos_id: 'tos-uuid',
      p_exam_date: '',
      p_questions: [{ item_number: 1, correct_answer: 'C' }],
    });

    assert.strictEqual(capturedPayload.p_exam_date, null);
  });

  it('3. rejects without calling RPC when questions array is empty', async () => {
    let rpcCalled = false;
    const mockSupabase = {
      rpc: async () => {
        rpcCalled = true;
        return { data: [], error: null };
      },
    };

    await assert.rejects(
      async () => {
        await createExamFromTosRpc(mockSupabase, {
          p_tos_id: 'tos-uuid',
          p_exam_date: '2026-10-25',
          p_questions: [],
        });
      },
      {
        name: 'Error',
        message: 'No questions to save. Please generate or enter questions first.',
      }
    );

    assert.strictEqual(rpcCalled, false);
  });

  it('4. throws when RPC returns database error with error details logged', async () => {
    const dbError = {
      code: 'P0001',
      message: 'TOS document must have at least one section assigned',
      details: 'Check sections jsonb array',
      hint: 'Assign at least 1 section',
    };

    const mockSupabase = {
      rpc: async () => {
        return { data: null, error: dbError };
      },
    };

    await assert.rejects(
      async () => {
        await createExamFromTosRpc(mockSupabase, {
          p_tos_id: 'tos-uuid',
          p_exam_date: '2026-10-25',
          p_questions: [{ item_number: 1, correct_answer: 'A' }],
        });
      },
      (err: any) => {
        assert.strictEqual(err.code, 'P0001');
        assert.strictEqual(err.message, 'TOS document must have at least one section assigned');
        return true;
      }
    );
  });
});

