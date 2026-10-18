import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type SaveExamBody = {
  assessmentId?: string;
  tosId?: string;
  examDate?: string | null;
  questions?: unknown[];
  mode?: 'draft' | 'approve';
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Sign in before saving exam questions.' }, { status: 401 });

    const body = await request.json().catch(() => null) as SaveExamBody | null;
    if (!body || !Array.isArray(body.questions) || body.questions.length === 0) {
      return NextResponse.json({ error: 'There are no exam questions to save.' }, { status: 400 });
    }
    if (body.questions.length > 90) return NextResponse.json({ error: 'An exam cannot contain more than 90 questions.' }, { status: 400 });
    const mode = body.mode === 'approve' ? 'approve' : 'draft';
    if (!body.assessmentId && !body.tosId) return NextResponse.json({ error: 'A TOS or assessment is required to save these questions.' }, { status: 400 });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('tenant_id, status, archived_at')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) {
      return NextResponse.json({ error: 'Your account does not have active access to save exam questions.' }, { status: 403 });
    }

    const admin = createAdminClient();
    let assessmentIds: string[] = [];

    if (body.assessmentId) {
      const { data: assessment, error } = await admin
        .from('assessments')
        .select('id, tenant_id, tos_id')
        .eq('id', body.assessmentId)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle();
      if (error || !assessment) return NextResponse.json({ error: 'The assessment was not found in your school.' }, { status: 404 });
      if (body.tosId && assessment.tos_id !== body.tosId) {
        return NextResponse.json({ error: 'The assessment does not belong to the selected TOS.' }, { status: 400 });
      }
      assessmentIds = [assessment.id];
    } else if (body.tosId) {
      const { data: tos, error: tosError } = await admin
        .from('tos_documents')
        .select('id, tenant_id')
        .eq('id', body.tosId)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle();
      if (tosError || !tos) return NextResponse.json({ error: 'The Table of Specifications was not found in your school.' }, { status: 404 });

      // Use the signed-in user's JWT so the RPC applies its tenant checks.
      const { data, error } = await supabase.rpc('create_exam_from_tos', {
        p_tos_id: body.tosId,
        p_exam_date: body.examDate || null,
        p_questions: body.questions,
      });
      if (error) return NextResponse.json({ error: error.message || 'Could not create the linked assessment.' }, { status: 400 });
      assessmentIds = Array.isArray(data) ? data.filter((id): id is string => typeof id === 'string') : [];
    }

    if (assessmentIds.length === 0) {
      return NextResponse.json({ error: 'No linked assessment was created. Check that the TOS has at least one valid section.' }, { status: 400 });
    }

    const { data: updatedAssessments, error: updateError } = await admin
      .from('assessments')
      .update({ questions: body.questions, exam_status: mode === 'approve' ? 'APPROVED' : 'DRAFT', updated_at: new Date().toISOString() })
      .eq('tenant_id', profile.tenant_id)
      .in('id', assessmentIds)
      .select('id');
    if (updateError || !updatedAssessments?.length) {
      return NextResponse.json({ error: updateError?.message || 'The questions could not be saved to the assessment.' }, { status: 500 });
    }

    const answers: Record<string, string> = {};
    for (const [index, question] of body.questions.entries()) {
      if (!question || typeof question !== 'object') continue;
      const item = question as Record<string, unknown>;
      const itemNumber = item.item_number ?? item.question_number ?? index + 1;
      const answer = item.correct_answer ?? item.correctAnswer ?? item.answer;
      if (answer !== undefined && answer !== null) answers[String(itemNumber)] = String(answer);
    }
    const keyRows = updatedAssessments.map(({ id }) => ({
      assessment_id: id,
      tenant_id: profile.tenant_id,
      answers,
      updated_at: new Date().toISOString(),
    }));
    const { error: keyError } = await admin.from('answer_keys').upsert(keyRows, { onConflict: 'assessment_id' });
    if (keyError) return NextResponse.json({ error: `Questions saved, but the answer key could not be synchronized: ${keyError.message}` }, { status: 500 });

    if (body.tosId) {
      const { data: updatedTos, error: updateTosError } = await admin
        .from('tos_documents')
        .update({ questions: body.questions, exam_status: mode === 'approve' ? 'APPROVED' : 'DRAFT', updated_at: new Date().toISOString() })
        .eq('id', body.tosId)
        .eq('tenant_id', profile.tenant_id)
        .select('id')
        .maybeSingle();
      if (updateTosError || !updatedTos) return NextResponse.json({ error: `Questions saved, but the TOS could not be updated: ${updateTosError?.message || 'TOS not found in your school.'}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, assessmentIds, mode });
  } catch (error: any) {
    console.error('[SaveExam] Failed to persist exam questions:', error);
    return NextResponse.json({ error: error?.message || 'Failed to save exam questions.' }, { status: 500 });
  }
}
