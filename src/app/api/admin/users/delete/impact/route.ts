import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate caller session
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to perform this action.' },
        { status: 401 }
      );
    }

    // 2. Verify caller is an approved admin
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, status, tenant_id, is_platform_admin, archived_at')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return NextResponse.json(
        { error: 'Failed to verify administrator privileges.' },
        { status: 403 }
      );
    }

    if (
      callerProfile.role !== 'admin' ||
      callerProfile.status !== 'approved' ||
      callerProfile.archived_at
    ) {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can check account impact.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawUserIds = body.userIds;

    if (!Array.isArray(rawUserIds) || rawUserIds.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one account.' },
        { status: 400 }
      );
    }

    const userIds = Array.from(new Set(rawUserIds.map((id: any) => String(id))));
    const adminClient = createAdminClient();
    const isPlatformAdmin = Boolean(callerProfile.is_platform_admin);

    // Verify all target accounts exist and are archived
    const { data: targetProfiles, error: fetchErr } = await adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id, archived_at')
      .in('id', userIds);

    if (fetchErr || !targetProfiles) {
      return NextResponse.json(
        { error: 'Failed to retrieve accounts.' },
        { status: 500 }
      );
    }

    // Check scope and archived status
    for (const p of targetProfiles) {
      if (!isPlatformAdmin && p.tenant_id !== callerProfile.tenant_id) {
        return NextResponse.json(
          { error: 'You cannot delete accounts from other schools.' },
          { status: 403 }
        );
      }
      if (!p.archived_at) {
        return NextResponse.json(
          { error: `Account ${p.display_name || p.email} is not archived. Only archived accounts can be deleted.` },
          { status: 400 }
        );
      }
    }

    // Fetch impact counts
    // 1. Assessments created by target users
    const { data: assessments } = await adminClient
      .from('assessments')
      .select('id, created_by, section_id')
      .in('created_by', userIds);

    const assessmentIds = assessments?.map((a) => a.id) || [];
    const sectionIds = Array.from(
      new Set(assessments?.map((a) => a.section_id).filter((s): s is string => Boolean(s)) || [])
    );

    // 2. Answer keys linked to these assessments
    let totalAnswerKeys = 0;
    const assessmentToAnswerKey = new Set<string>();
    if (assessmentIds.length > 0) {
      const { data: answerKeys } = await adminClient
        .from('answer_keys')
        .select('id, assessment_id')
        .in('assessment_id', assessmentIds);

      if (answerKeys) {
        totalAnswerKeys = answerKeys.length;
        for (const ak of answerKeys) {
          if (ak.assessment_id) assessmentToAnswerKey.add(ak.assessment_id);
        }
      }
    }

    // 3. Scan results linked to these assessments
    let totalScanResults = 0;
    const assessmentToScanResults = new Map<string, number>();
    if (assessmentIds.length > 0) {
      const { data: scanResults } = await adminClient
        .from('scan_results')
        .select('id, assessment_id')
        .in('assessment_id', assessmentIds);

      if (scanResults) {
        totalScanResults = scanResults.length;
        for (const sr of scanResults) {
          assessmentToScanResults.set(
            sr.assessment_id,
            (assessmentToScanResults.get(sr.assessment_id) || 0) + 1
          );
        }
      }
    }

    // 4. Learners associated through sections or archived students
    let totalLearners = 0;
    if (sectionIds.length > 0) {
      const { data: sections } = await adminClient
        .from('sections')
        .select('name')
        .in('id', sectionIds);

      const sectionNames = sections?.map((s) => s.name) || [];
      if (sectionNames.length > 0) {
        const { count: learnersCount } = await adminClient
          .from('students')
          .select('id', { count: 'exact', head: true })
          .in('section_name', sectionNames)
          .eq('is_archived', false);

        totalLearners = learnersCount || 0;
      }
    }

    // Per-user breakdown
    const perUser = targetProfiles.map((p) => {
      const userAssessments = assessments?.filter((a) => a.created_by === p.id) || [];
      const userAssIds = new Set(userAssessments.map((a) => a.id));

      let userAkCount = 0;
      let userSrCount = 0;
      for (const assId of userAssIds) {
        if (assessmentToAnswerKey.has(assId)) userAkCount++;
        userSrCount += assessmentToScanResults.get(assId) || 0;
      }

      return {
        id: p.id,
        name: p.display_name || 'Unnamed Faculty',
        email: p.email || 'No email',
        assessments: userAssessments.length,
        answerKeys: userAkCount,
        scanResults: userSrCount,
        learners: totalLearners, // associated cohort
      };
    });

    // Also fetch eligible teachers for reassignment (approved, non-archived in the same school)
    // If targets belong to caller's tenant, fetch faculty from that tenant
    const targetTenantId = targetProfiles[0]?.tenant_id || callerProfile.tenant_id;
    let eligibleTeachers: Array<{ id: string; display_name: string; email: string; role: string }> = [];

    if (targetTenantId) {
      const { data: faculty } = await adminClient
        .from('profiles')
        .select('id, display_name, email, role')
        .eq('tenant_id', targetTenantId)
        .eq('status', 'approved')
        .is('archived_at', null)
        .not('id', 'in', `(${userIds.join(',')})`)
        .order('display_name');

      eligibleTeachers = faculty || [];
    }

    return NextResponse.json({
      success: true,
      summary: {
        accountsCount: targetProfiles.length,
        totalAssessments: assessments?.length || 0,
        totalAnswerKeys,
        totalScanResults,
        totalLearners,
      },
      perUser,
      eligibleTeachers,
    });
  } catch (err: any) {
    console.error('[POST /api/admin/users/delete/impact] Unexpected error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while calculating deletion impact.' },
      { status: 500 }
    );
  }
}

