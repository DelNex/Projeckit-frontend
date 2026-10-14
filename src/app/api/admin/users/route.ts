import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate caller
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to view user accounts.' },
        { status: 401 }
      );
    }

    // 2. Verify caller is an approved admin
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, status, tenant_id')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return NextResponse.json(
        { error: 'Failed to verify administrator privileges.' },
        { status: 403 }
      );
    }

    if (callerProfile.role !== 'admin' || callerProfile.status !== 'approved') {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can access user accounts.' },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();
    const url = new URL(request.url);

    // Query parameters
    const search = url.searchParams.get('search')?.trim() || '';
    const statusFilter = url.searchParams.get('status')?.trim() || 'all';
    const roleFilter = url.searchParams.get('role')?.trim() || 'all';
    const schoolFilter = url.searchParams.get('school')?.trim() || 'all';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(url.searchParams.get('pageSize') || '25', 10)));
    const sortBy = url.searchParams.get('sortBy')?.trim() || 'created_at';
    const sortOrder = url.searchParams.get('sortOrder')?.trim() === 'asc' ? 'asc' : 'desc';

    // Tenant Scoping:
    // If caller has a tenant_id, scope strictly to that school.
    // If caller has no tenant_id, they are platform admin and can view across schools or filter by school.
    const isPlatformAdmin = !callerProfile.tenant_id;
    const effectiveTenantId = isPlatformAdmin
      ? schoolFilter !== 'all'
        ? schoolFilter
        : null
      : callerProfile.tenant_id;

    // 3. Compute KPI summary stats in the admin's scope
    let baseStatsQuery = adminClient.from('profiles').select('status', { count: 'exact' });
    if (!isPlatformAdmin) {
      baseStatsQuery = baseStatsQuery.eq('tenant_id', callerProfile.tenant_id);
    } else if (schoolFilter !== 'all') {
      baseStatsQuery = baseStatsQuery.eq('tenant_id', schoolFilter);
    }

    const { data: allScopedProfiles } = await baseStatsQuery;

    let totalCount = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    let rejectedSuspendedCount = 0;

    if (allScopedProfiles) {
      totalCount = allScopedProfiles.length;
      for (const p of allScopedProfiles) {
        if (p.status === 'approved') approvedCount++;
        else if (p.status === 'pending') pendingCount++;
        else if (p.status === 'rejected' || p.status === 'suspended') rejectedSuspendedCount++;
      }
    }

    // 4. Build Paginated Profiles Query
    let query = adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id, created_at, tenants ( id, name, code )', {
        count: 'exact',
      });

    if (effectiveTenantId) {
      query = query.eq('tenant_id', effectiveTenantId);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (roleFilter !== 'all') {
      query = query.eq('role', roleFilter);
    }

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    // Sort column mapping (safeguard against injection)
    const validSortColumns = ['created_at', 'display_name', 'email', 'role', 'status'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    query = query.order(safeSortBy, { ascending: sortOrder === 'asc' });

    // Pagination
    const fromIndex = (page - 1) * pageSize;
    const toIndex = fromIndex + pageSize - 1;
    query = query.range(fromIndex, toIndex);

    const { data: profiles, count: filteredCount, error: fetchErr } = await query;

    if (fetchErr) {
      console.error('[Admin API] Error querying profiles:', fetchErr);
      return NextResponse.json(
        { error: 'Failed to retrieve accounts from database.' },
        { status: 500 }
      );
    }

    const safeProfiles = profiles || [];
    const pageUserIds = safeProfiles.map((p) => p.id);

    // 5. Fetch auth data for these users (email_confirmed_at, last_sign_in_at)
    const authMap = new Map<string, { last_sign_in_at: string | null; is_email_confirmed: boolean }>();
    try {
      const { data: authListData } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (authListData?.users) {
        for (const u of authListData.users) {
          authMap.set(u.id, {
            last_sign_in_at: u.last_sign_in_at || null,
            is_email_confirmed: !!u.email_confirmed_at,
          });
        }
      }
    } catch (authListErr) {
      // Fallback: query each user individually
      await Promise.all(
        pageUserIds.map(async (uid) => {
          try {
            const { data: uData } = await adminClient.auth.admin.getUserById(uid);
            if (uData?.user) {
              authMap.set(uid, {
                last_sign_in_at: uData.user.last_sign_in_at || null,
                is_email_confirmed: !!uData.user.email_confirmed_at,
              });
            }
          } catch (_) {}
        })
      );
    }

    // 6. Fetch assessment & learner metrics for users on this page (B5)
    const metricsMap = new Map<string, { assessmentCount: number; learnerCount: number }>();
    if (pageUserIds.length > 0) {
      try {
        const { data: assessmentsData } = await adminClient
          .from('assessments')
          .select('id, created_by, section_id')
          .in('created_by', pageUserIds);

        if (assessmentsData) {
          // Count assessments per user
          const userAssessments = new Map<string, typeof assessmentsData>();
          for (const a of assessmentsData) {
            if (!a.created_by) continue;
            const existing = userAssessments.get(a.created_by) || [];
            existing.push(a);
            userAssessments.set(a.created_by, existing);
          }

          // Compute metrics per user
          for (const uid of pageUserIds) {
            const userA = userAssessments.get(uid) || [];
            const assessmentCount = userA.length;

            const sectionIds = Array.from(
              new Set(userA.map((a) => a.section_id).filter(Boolean))
            );

            let learnerCount = 0;
            if (sectionIds.length > 0) {
              const { data: sectionsData } = await adminClient
                .from('sections')
                .select('name')
                .in('id', sectionIds);

              const sectionNames = sectionsData?.map((s) => s.name) || [];
              if (sectionNames.length > 0) {
                const { count: learners } = await adminClient
                  .from('students')
                  .select('id', { count: 'exact', head: true })
                  .in('section_name', sectionNames)
                  .eq('is_archived', false);

                learnerCount = learners || 0;
              }
            }

            metricsMap.set(uid, { assessmentCount, learnerCount });
          }
        }
      } catch (metricsErr) {
        console.error('[Admin API] Error fetching user metrics:', metricsErr);
      }
    }

    // 7. Fetch tenants list for filter dropdown if platform admin
    let availableTenants: Array<{ id: string; name: string; code: string | null }> = [];
    if (isPlatformAdmin) {
      const { data: tenantsData } = await adminClient
        .from('tenants')
        .select('id, name, code')
        .order('name');
      availableTenants = tenantsData || [];
    }

    // 8. Assemble result
    const resultUsers = safeProfiles.map((p) => {
      const authInfo = authMap.get(p.id);
      const metrics = metricsMap.get(p.id) || { assessmentCount: 0, learnerCount: 0 };
      const tenantRecord = (p.tenants as any) || null;

      return {
        id: p.id,
        display_name: p.display_name || 'Unnamed Faculty',
        email: p.email || 'No email registered',
        role: p.role,
        status: p.status,
        tenant_id: p.tenant_id,
        school: tenantRecord?.name || tenantRecord?.code || 'Unassigned School',
        created_at: p.created_at,
        last_sign_in_at: authInfo?.last_sign_in_at || null,
        is_email_confirmed: authInfo ? authInfo.is_email_confirmed : false,
        assessment_count: metrics.assessmentCount,
        learner_count: metrics.learnerCount,
      };
    });

    const totalFiltered = filteredCount || 0;
    const totalPages = Math.ceil(totalFiltered / pageSize) || 1;

    return NextResponse.json({
      users: resultUsers,
      pagination: {
        page,
        pageSize,
        totalCount: totalFiltered,
        totalPages,
      },
      stats: {
        total: totalCount,
        approved: approvedCount,
        pending: pendingCount,
        rejectedSuspended: rejectedSuspendedCount,
      },
      caller: {
        id: caller.id,
        isPlatformAdmin,
        tenant_id: callerProfile.tenant_id,
      },
      tenants: availableTenants,
    });
  } catch (err: any) {
    console.error('[Admin API] Error in GET /api/admin/users:', err);
    return NextResponse.json(
      { error: 'Something went wrong fetching accounts. Please try again.' },
      { status: 500 }
    );
  }
}
