export interface QueueExamJobInput {
  tenantId: string;
  tosId: string;
  createdBy: string;
  payload: Record<string, unknown>;
  jobKind: 'full' | 'repair';
}

export interface ExamAiProvider {
  readonly id: 'helper_queue';
  enqueue(admin: any, input: QueueExamJobInput): Promise<{ id: string; createdAt: string; status: string; reused: boolean }>;
}

/** Single current provider. The interface keeps queue creation independent of the screens. */
export class HelperQueueExamAiProvider implements ExamAiProvider {
  readonly id = 'helper_queue' as const;

  async enqueue(admin: any, input: QueueExamJobInput): Promise<{ id: string; createdAt: string; status: string; reused: boolean }> {
    const { data, error } = await admin.rpc('enqueue_exam_generation_job', {
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

const helperQueueProvider: ExamAiProvider = new HelperQueueExamAiProvider();

export function getExamAiProvider(): ExamAiProvider {
  return helperQueueProvider;
}
