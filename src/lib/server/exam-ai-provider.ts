export interface QueueExamJobInput {
  tenantId: string;
  tosId: string;
  createdBy: string;
  payload: Record<string, unknown>;
  jobKind: 'full' | 'repair';
}

export interface ExamAiProvider {
  readonly id: 'groq_api';
  enqueue(admin: any, input: QueueExamJobInput): Promise<{ id: string; createdAt: string; status: string; reused: boolean }>;
}

/** Groq uses the existing durable database job table; generation runs on the hosted server, not a local browser helper. */
export class GroqExamJobProvider implements ExamAiProvider {
  readonly id = 'groq_api' as const;

  async enqueue(admin: any, input: QueueExamJobInput): Promise<{ id: string; createdAt: string; status: string; reused: boolean }> {
    const { data, error } = await admin.rpc('enqueue_groq_exam_generation_job', {
      p_tenant_id: input.tenantId,
      p_tos_id: input.tosId,
      p_created_by: input.createdBy,
      p_payload: input.payload,
      p_job_kind: input.jobKind,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) throw new Error('Could not queue exam generation. Please try again.');
    return { id: row.job_id, createdAt: row.created_at, status: row.status, reused: !row.created };
  }
}

const groqExamJobProvider: ExamAiProvider = new GroqExamJobProvider();

export function getExamAiProvider(): ExamAiProvider {
  return groqExamJobProvider;
}
