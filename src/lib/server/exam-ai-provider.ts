export interface QueueExamJobInput {
  tenantId: string;
  tosId: string;
  createdBy: string;
  payload: Record<string, unknown>;
  jobKind: 'full' | 'repair';
}

export interface ExamAiProvider {
  readonly id: 'helper_queue';
  enqueue(admin: any, input: QueueExamJobInput): Promise<{ id: string; createdAt: string }>;
}

/** Single current provider. The interface keeps queue creation independent of the screens. */
export class HelperQueueExamAiProvider implements ExamAiProvider {
  readonly id = 'helper_queue' as const;

  async enqueue(admin: any, input: QueueExamJobInput): Promise<{ id: string; createdAt: string }> {
    const { data, error } = await admin.from('exam_generation_jobs').insert({
      tenant_id: input.tenantId,
      tos_id: input.tosId,
      created_by: input.createdBy,
      payload: input.payload,
      provider: this.id,
      job_kind: input.jobKind,
    }).select('id,created_at').single();
    if (error || !data) throw new Error('Could not queue exam generation. Please try again.');
    return { id: data.id, createdAt: data.created_at };
  }
}

const helperQueueProvider: ExamAiProvider = new HelperQueueExamAiProvider();

export function getExamAiProvider(): ExamAiProvider {
  return helperQueueProvider;
}
