import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TosDocument } from '@/types/tos';
import {
  createMostLeastLearnedDocx,
  createTermResultsDocx,
  createTosDocx,
  getExportableTosRows,
  type LearnedItemRow,
  type SchoolReportHeader,
} from '@/lib/server/academic-docx-exports';
import {
  calculateSectionTermMetrics,
  deduplicateScoredResponses,
  readSelectedOption,
  type SavedAssessmentResponse,
} from '@/lib/server/term-report-metrics';

export const runtime = 'nodejs';

type ReportType = 'tos' | 'test-results' | 'most-least-learned';

function getRelatedName(value: unknown): string {
  if (Array.isArray(value)) return String((value[0] as any)?.name || (value[0] as any)?.title || '');
  if (value && typeof value === 'object') return String((value as any).name || (value as any).title || '');
  return '';
}

function responseHeaders(fileName: string): HeadersInit {
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Cache-Control': 'private, no-store, max-age=0',
  };
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Sign in to export reports.', code: 'UNAUTHORIZED' }, { status: 401 });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, tenant_id, role, status, is_platform_admin, archived_at, display_name')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError || !profile || profile.status !== 'approved' || profile.archived_at) {
      return NextResponse.json({ error: 'Approved school access is required to export reports.', code: 'FORBIDDEN' }, { status: 403 });
    }

    const url = new URL(request.url);
    const type = url.searchParams.get('type') as ReportType | null;
    const tosId = url.searchParams.get('tosId');
    const requestedTenantId = url.searchParams.get('tenantId');
    const tenantId = profile.is_platform_admin && requestedTenantId ? requestedTenantId : profile.tenant_id;
    if (!tenantId) return NextResponse.json({ error: 'Select a school before exporting.', code: 'TENANT_REQUIRED' }, { status: 400 });
    if (!type || !['tos', 'test-results', 'most-least-learned'].includes(type)) {
      return NextResponse.json({ error: 'Choose a supported DOCX report type.', code: 'INVALID_REPORT_TYPE' }, { status: 400 });
    }
    if (!tosId) return NextResponse.json({ error: 'A TOS is required to build this report.', code: 'TOS_REQUIRED' }, { status: 400 });

    const admin = createAdminClient();
    const [{ data: school, error: schoolError }, { data: tosRow, error: tosError }] = await Promise.all([
      admin.from('tenants').select('id, name, region, division').eq('id', tenantId).maybeSingle(),
      admin.from('tos_documents').select('*').eq('id', tosId).eq('tenant_id', tenantId).maybeSingle(),
    ]);
    if (schoolError || !school) return NextResponse.json({ error: 'School was not found.', code: 'SCHOOL_NOT_FOUND' }, { status: 404 });
    if (tosError || !tosRow) return NextResponse.json({ error: 'TOS was not found in this school.', code: 'TOS_NOT_FOUND' }, { status: 404 });

    const tos = tosRow as unknown as TosDocument;
    const schoolHeader = {
      name: school.name || '',
      region: school.region || '',
      division: school.division || '',
    };
    const baseName = `${school.name || 'School'}_${tos.term}_${tos.subject}_${tos.school_year}`
      .normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');

    if (type === 'tos') {
      const buffer = await createTosDocx(tos, schoolHeader);
      return new NextResponse(new Uint8Array(buffer), { headers: responseHeaders(`TOS_${baseName}.docx`) });
    }

    const assessmentQuery = admin.from('assessments')
      .select('id, title, tos_id, term, school_year, target_items, section_id, subject_id, sections(name), subjects(title, code)')
      .eq('tenant_id', tenantId);
    const { data: allAssessments, error: assessmentsError } = await assessmentQuery;
    if (assessmentsError) throw new Error(`Could not load linked examinations: ${assessmentsError.message}`);
    let linkedAssessments = (allAssessments || []).filter((row: any) => row.tos_id === tosId);
    if (!linkedAssessments.length && tos.assessment_id) {
      linkedAssessments = (allAssessments || []).filter((row: any) => row.id === tos.assessment_id);
    }
    if (!linkedAssessments.length) {
      return NextResponse.json({ error: 'No examination is linked to this TOS yet.', code: 'NO_LINKED_ASSESSMENTS' }, { status: 422 });
    }

    const itemCounts = Array.from(new Set(linkedAssessments.map((row: any) => Number(row.target_items || tos.target_items))));
    if (itemCounts.length !== 1 || itemCounts[0] !== Number(tos.target_items)) {
      return NextResponse.json({ error: 'Linked examinations do not share the TOS item count. Fix the links before exporting.', code: 'ITEM_COUNT_MISMATCH' }, { status: 422 });
    }

    const assessmentIds = linkedAssessments.map((row: any) => row.id);
    const [{ data: responseRows, error: responsesError }, { data: keyRows, error: keysError }] = await Promise.all([
      admin.from('responses')
        .select('id, assessment_id, student_id, student_lrn, section_name, score, status, scanned_at, raw_response')
        .eq('tenant_id', tenantId).in('assessment_id', assessmentIds),
      admin.from('answer_keys').select('assessment_id, answers').eq('tenant_id', tenantId).in('assessment_id', assessmentIds),
    ]);
    if (responsesError) throw new Error(`Could not load saved responses: ${responsesError.message}`);
    if (keysError) throw new Error(`Could not load answer keys: ${keysError.message}`);

    const responses = deduplicateScoredResponses((responseRows || []) as SavedAssessmentResponse[]);
    const answersByAssessment = new Map<string, Record<string, string>>();
    for (const key of keyRows || []) {
      if (key.answers && typeof key.answers === 'object' && !Array.isArray(key.answers)) {
        answersByAssessment.set(key.assessment_id, key.answers as Record<string, string>);
      }
    }
    if (type === 'most-least-learned' && linkedAssessments.some((row: any) => !answersByAssessment.has(row.id))) {
      return NextResponse.json({ error: 'Every linked examination needs a saved answer key before skills can be ranked.', code: 'ANSWER_KEY_REQUIRED' }, { status: 422 });
    }

    const header: SchoolReportHeader = {
      schoolName: school.name || '',
      region: school.region || '',
      division: school.division || '',
      subject: tos.subject || '',
      term: tos.term || '',
      schoolYear: tos.school_year || '',
      assessmentTitle: tos.exam_type || 'Term Examination',
      preparedBy: tos.teacher_name || profile.display_name || '',
    };

    if (type === 'test-results') {
      const metrics = linkedAssessments.map((assessment: any) => {
        const assessmentResponses = responses.filter((row) => row.assessment_id === assessment.id);
        const sectionName = getRelatedName(assessment.sections) || assessmentResponses.find((row) => row.section_name)?.section_name || tos.section || 'Section';
        return calculateSectionTermMetrics(sectionName, assessmentResponses, Number(assessment.target_items || tos.target_items));
      });
      const buffer = await createTermResultsDocx(header, metrics);
      return new NextResponse(new Uint8Array(buffer), { headers: responseHeaders(`Test_Results_${baseName}.docx`) });
    }

    if (!responses.length) {
      return NextResponse.json({ error: 'There are no scored, identified learner responses to analyze.', code: 'NO_SCORED_CASES' }, { status: 422 });
    }
    let calculatedRows;
    try {
      calculatedRows = getExportableTosRows(tos);
    } catch (allocationError) {
      return NextResponse.json({ error: allocationError instanceof Error ? allocationError.message : 'The TOS item mapping is invalid.', code: 'INVALID_TOS' }, { status: 422 });
    }

    const competencyByItem = new Map<number, string>();
    for (const row of calculatedRows) {
      for (const levelItems of Object.values(row.domainItemNumbers)) {
        for (const itemNumber of levelItems) competencyByItem.set(itemNumber, row.description);
      }
    }
    const ranked: LearnedItemRow[] = Array.from({ length: Number(tos.target_items) }, (_, offset) => {
      const itemNumber = offset + 1;
      let correct = 0;
      for (const response of responses) {
        const key = answersByAssessment.get(response.assessment_id)?.[String(itemNumber)]?.toUpperCase();
        const selected = readSelectedOption(response.raw_response, itemNumber);
        if (key && selected && key === selected) correct++;
      }
      return {
        itemNumber,
        competency: competencyByItem.get(itemNumber) || 'Unmapped TOS item',
        correct,
        cases: responses.length,
        masteryPct: responses.length ? (correct / responses.length) * 100 : 0,
      };
    });
    const buffer = await createMostLeastLearnedDocx(header, ranked);
    return new NextResponse(new Uint8Array(buffer), { headers: responseHeaders(`Most_Least_Learned_${baseName}.docx`) });
  } catch (error) {
    console.error('[GET /api/reports/docx] Export failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not generate the Word report.', code: 'DOCX_EXPORT_FAILED' }, { status: 500 });
  }
}
