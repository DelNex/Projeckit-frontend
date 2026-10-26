export interface ScanReviewDecision {
  reviewedItems?: unknown;
  assignedStudentId?: string | null;
  hasIdentityConflict: boolean;
  scanStatus: string;
  overallConfidence: number;
}

/** The staged scanner requires a teacher to confirm the learner and every item before saving. */
export function shouldRequireVerification(decision: ScanReviewDecision): boolean {
  const explicitTeacherReview = Boolean(decision.reviewedItems && decision.assignedStudentId);
  if (explicitTeacherReview) return false;
  return decision.hasIdentityConflict || decision.scanStatus !== 'PROCESSED' || decision.overallConfidence < 0.75;
}
