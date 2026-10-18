/**
 * Service to execute the atomic create_exam_from_tos Supabase RPC
 */

export interface CreateExamRpcParams {
  p_tos_id: string;
  p_exam_date: string | null;
  p_questions: unknown[];
}

export async function createExamFromTosRpc(
  supabase: any,
  params: CreateExamRpcParams
): Promise<string[]> {
  if (!params.p_questions || params.p_questions.length === 0) {
    throw new Error('No questions to save. Please generate or enter questions first.');
  }

  const { data, error } = await supabase.rpc('create_exam_from_tos', {
    p_tos_id: params.p_tos_id,
    p_exam_date: params.p_exam_date || null,
    p_questions: params.p_questions,
  });

  if (error) {
    console.error('Failed to save examination (full error):', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw error;
  }

  return (data || []) as string[];
}

