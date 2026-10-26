import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';

const VALID_SORT_COLUMNS = ['created_at', 'display_name', 'email', 'role', 'status'] as const;
type ValidSortColumn = (typeof VALID_SORT_COLUMNS)[number];

const VALID_STATUSES = ['all', 'approved', 'pending', 'rejected', 'suspended'] as const;
const VALID_ROLES = ['all', 'admin', 'teacher'] as const;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate caller session
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to view user accounts.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 2. Admin guard: verify caller is an approved admin
    // Gracefully handle if is_platform_admin column has not been migrated yet
    let callerProfile: {
      id: string;
      role: string;
      status: string;
      tenant_id: string | null;
      is_platform_admin?: boolean;
      archived_at?: string | null;
    } | null = null;

    const { data: pWithPlatform, error: pErr1 } = await supabase
      .from('profiles')
      .select('id, role, status, tenant_id, is_platform_admin, archived_at')
      .eq('id', caller.id)
      .maybeSingle();

    if (pErr1) {
      console.warn(
        '[admin/users GET] is_platform_admin column query returned error, falling back to base columns:',
        pErr1.message
      );
      const { data: pBase, error: pErr2 } = await supabase
        .from('profiles')
        .select('id, role, status, tenant_id, archived_at')
        .eq('id', caller.id)
        .maybeSingle();

      if (pErr2 || !pBase) {
        console.error('[admin/users GET] Failed to verify administrator privileges:', pErr2);
        return NextResponse.json(
          { error: 'Failed to verify administrator privileges.', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      callerProfile = { ...pBase, is_platform_admin: false };
    } else {
      callerProfile = pWithPlatform;
    }

    if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'approved' || callerProfile.archived_at) {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can access user accounts.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // 3. Initialize Service-Role Client
    let adminClient: ReturnType<typeof createAdminClient>;
    try {
      adminClient = createAdminClient();
    } catch (err: any) {
      if (err instanceof MissingServiceKeyError || err?.code === 'MISSING_SERVICE_KEY') {
        console.error('[admin/users GET] Missing service role key:', err.message);
        return NextResponse.json(
          {
            error: 'The server is missing its admin key. Ask the site owner to configure it in the server environment.',
            code: 'MISSING_SERVICE_KEY',
          },
          { status: 500 }
        );
      }
      throw err;
    }

    // 4. Query parameters parsing & validation
    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim() || '';

    const rawStatus = url.searchParams.get('status')?.trim().toLowerCase() || 'all';
    const statusFilter = (VALID_STATUSES as readonly string[]).includes(rawStatus) ? rawStatus : 'all';

    const rawRole = url.searchParams.get('role')?.trim().toLowerCase() || 'all';
    const roleFilter = (VALID_ROLES as readonly string[]).includes(rawRole) ? rawRole : 'all';

    const rawTab = url.searchParams.get('tab')?.trim().toLowerCase() || 'active';
    const tab: 'active' | 'archived' = rawTab === 'archived' ? 'archived' : 'active';
    const idsOnly = url.searchParams.get('idsOnly') === 'true';

    const schoolFilter = url.searchParams.get('school')?.trim() || 'all';

    const rawPage = url.searchParams.get('page');
    const parsedPage = rawPage ? parseInt(rawPage, 10) : 1;
    const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

    const rawPageSize = url.searchParams.get('pageSize');
    const parsedPageSize = rawPageSize ? parseInt(rawPageSize, 10) : 25;
    const pageSize = Number.isNaN(parsedPageSize) ? 25 : Math.max(1, Math.min(100, parsedPageSize));

    const rawSortBy = url.searchParams.get('sortBy')?.trim();
    const sortBy: ValidSortColumn = (VALID_SORT_COLUMNS as readonly string[]).includes(rawSortBy || '')
      ? (rawSortBy as ValidSortColumn)
      : 'created_at';

    const rawSortOrder = url.searchParams.get('sortOrder')?.trim().toLowerCase();
    const sortOrder: 'asc' | 'desc' = rawSortOrder === 'asc' ? 'asc' : 'desc';

    // Tenant Scoping:
    // If platform admin: can view across all schools or filter by school
    // If regular admin: strictly scoped to callerProfile.tenant_id
    const isPlatformAdmin = Boolean(callerProfile.is_platform_admin);
    const effectiveTenantId = isPlatformAdmin
      ? schoolFilter !== 'all'
        ? schoolFilter
        : null
      : callerProfile.tenant_id;

    // Handle idsOnly: return all matching IDs up to 500, excluding caller's own ID
    if (idsOnly) {
      let idsQuery = adminClient
        .from('profiles')
        .select('id', { count: 'exact' });

      if (effectiveTenantId) {
        idsQuery = idsQuery.eq('tenant_id', effectiveTenantId);
      }

      if (tab === 'archived') {
        idsQuery = idsQuery.not('archived_at', 'is', null);
      } else {
        idsQuery = idsQuery.is('archived_at', null);
      }

      if (statusFilter !== 'all') {
        idsQuery = idsQuery.eq('status', statusFilter);
      }

      if (roleFilter !== 'all') {
        idsQuery = idsQuery.eq('role', roleFilter);
      }

      if (search) {
        const safeSearch = search.replace(/,/g, '');
        idsQuery = idsQuery.or(`display_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
      }

      // Admin's own row is not selectable
      idsQuery = idsQuery.neq('id', caller.id);
      idsQuery = idsQuery.limit(500);

      const { data: matchedIds, count: matchedCount, error: idsErr } = await idsQuery;
      if (idsErr) {
        console.error('[admin/users GET idsOnly] Error:', idsErr);
        return NextResponse.json({ error: 'Failed to resolve matching account IDs.' }, { status: 500 });
      }

      const ids = (matchedIds || []).map((row) => row.id);
      return NextResponse.json({
        ids,
        totalMatching: matchedCount ?? ids.length,
        capped: ids.length === 500,
      });
    }

    // 5. Compute KPI Summary Stats within caller scope
    let totalCount = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    let rejectedSuspendedCount = 0;
    let activeCount = 0;
    let archivedCount = 0;

    try {
      let statsQuery = adminClient.from('profiles').select('status, archived_at');
      if (effectiveTenantId) {
        statsQuery = statsQuery.eq('tenant_id', effectiveTenantId);
      }
      const { data: scopedProfiles, error: statsErr } = await statsQuery;
      if (statsErr) {
        console.warn('[admin/users GET] Warning calculating stats:', statsErr.message);
      } else if (scopedProfiles) {
        totalCount = scopedProfiles.length;
        for (const p of scopedProfiles) {
          if (p.archived_at) {
            archivedCount++;
          } else {
            activeCount++;
            if (p.status === 'approved') approvedCount++;
            else if (p.status === 'pending') pendingCount++;
            else if (p.status === 'rejected' || p.status === 'suspended') rejectedSuspendedCount++;
          }
        }
      }
    } catch (statsEx) {
      console.warn('[admin/users GET] Exception during stats calculation:', statsEx);
    }

    // 6. Build Paginated Profiles Query
    let query = adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id, created_at, archived_at, archived_by, previous_status', {
        count: 'exact',
      });

    if (effectiveTenantId) {
      query = query.eq('tenant_id', effectiveTenantId);
    }

    if (tab === 'archived') {
      query = query.not('archived_at', 'is', null);
    } else {
      query = query.is('archived_at', null);
    }

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    if (roleFilter !== 'all') {
      query = query.eq('role', roleFilter);
    }

    if (search) {
      // Escape commas to prevent PostgREST parsing corruption
      const safeSearch = search.replace(/,/g, '');
      query = query.or(`display_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`);
    }

    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    const fromIndex = (page - 1) * pageSize;
    const toIndex = fromIndex + pageSize - 1;
    query = query.range(fromIndex, toIndex);

    const { data: profiles, count: filteredCount, error: fetchErr } = await query;

    if (fetchErr) {
      console.error('[admin/users GET] Database query failed for profiles:', fetchErr);
      return NextResponse.json(
        { error: 'Failed to retrieve accounts from database.', code: 'DB_QUERY_FAILED' },
        { status: 500 }
      );
    }

    const safeProfiles = profiles || [];
    const pageUserIds = safeProfiles.map((p) => p.id);

    // 7. Resolve School Tenants for these profiles safely
    const tenantIdsOnPage = Array.from(
      new Set(safeProfiles.map((p) => p.tenant_id).filter((tid): tid is string => Boolean(tid)))
    );

    const tenantsMap = new Map<string, { id: string; name: string; code: string | null }>();
    if (tenantIdsOnPage.length > 0) {
      try {
        const { data: tenantsData, error: tenantsErr } = await adminClient
          .from('tenants')
          .select('id, name, code')
          .in('id', tenantIdsOnPage);

        if (tenantsErr) {
          console.warn('[admin/users GET] Failed to resolve tenant records:', tenantsErr.message);
        } else if (tenantsData) {
          for (const t of tenantsData) {
            tenantsMap.set(t.id, t);
          }
        }
      } catch (tErr) {
        console.warn('[admin/users GET] Exception resolving tenants:', tErr);
      }
    }

    // 8. Fetch Auth Data by user ID for current page users only (Requirement 4)
    const authMap = new Map<string, { last_sign_in_at: string | null; is_email_confirmed: boolean }>();
    let authWarning = false;

    if (pageUserIds.length > 0) {
      await Promise.all(
        pageUserIds.map(async (uid) => {
          try {
            const { data: uData, error: uErr } = await adminClient.auth.admin.getUserById(uid);
            if (uErr) {
              console.warn(`[admin/users GET] Failed to fetch auth info for user ${uid}:`, uErr.message);
              authWarning = true;
              return;
            }
            if (uData?.user) {
              authMap.set(uid, {
                last_sign_in_at: uData.user.last_sign_in_at || null,
                is_email_confirmed: !!uData.user.email_confirmed_at,
              });
            }
          } catch (userAuthErr) {
            console.warn(`[admin/users GET] Unexpected error fetching auth for user ${uid}:`, userAuthErr);
            authWarning = true;
          }
        })
      );
    }

    // 9. Fetch Assessment & Learner Metrics for current page users
    const metricsMap = new Map<string, { assessmentCount: number; learnerCount: number }>();
    if (pageUserIds.length > 0) {
      try {
        const { data: assessmentsData } = await adminClient
          .from('assessments')
          .select('id, created_by, section_id')
          .in('created_by', pageUserIds);

        if (assessmentsData) {
          const userAssessments = new Map<string, typeof assessmentsData>();
          for (const a of assessmentsData) {
            if (!a.created_by) continue;
            const existing = userAssessments.get(a.created_by) || [];
            existing.push(a);
            userAssessments.set(a.created_by, existing);
          }

          for (const uid of pageUserIds) {
            const userA = userAssessments.get(uid) || [];
            const assessmentCount = userA.length;
            const sectionIds = Array.from(new Set(userA.map((a) => a.section_id).filter(Boolean)));

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
        console.warn('[admin/users GET] Warning fetching user metrics:', metricsErr);
      }
    }

    // 10. Fetch available tenants list for filter dropdown if platform admin
    let availableTenants: Array<{ id: string; name: string; code: string | null }> = [];
    if (isPlatformAdmin) {
      try {
        const { data: allTenants } = await adminClient
          .from('tenants')
          .select('id, name, code')
          .order('name');
        availableTenants = allTenants || [];
      } catch (tListErr) {
        console.warn('[admin/users GET] Warning fetching tenants list:', tListErr);
      }
    }

    // 10b. Resolve archivers display names for archived users
    const archiverIds = Array.from(
      new Set(
        safeProfiles
          .map((p) => p.archived_by)
          .filter((id): id is string => Boolean(id))
      )
    );
    const archiversMap = new Map<string, { id: string; display_name: string | null; email: string | null }>();
    if (archiverIds.length > 0) {
      try {
        const { data: archiversData } = await adminClient
          .from('profiles')
          .select('id, display_name, email')
          .in('id', archiverIds);

        if (archiversData) {
          for (const a of archiversData) {
            archiversMap.set(a.id, a);
          }
        }
      } catch (archErr) {
        console.warn('[admin/users GET] Warning resolving archivers:', archErr);
      }
    }

    // 11. Assemble Result
    const resultUsers = safeProfiles.map((p) => {
      const authInfo = authMap.get(p.id);
      const metrics = metricsMap.get(p.id) || { assessmentCount: 0, learnerCount: 0 };
      const tenantRecord = p.tenant_id ? tenantsMap.get(p.tenant_id) || null : null;
      const archiver = p.archived_by ? archiversMap.get(p.archived_by) : null;

      return {
        id: p.id,
        display_name: p.display_name || 'Unnamed Faculty',
        email: p.email || 'No email registered',
        role: p.role,
        status: p.status,
        tenant_id: p.tenant_id,
        school: tenantRecord?.name || tenantRecord?.code || 'Unassigned School',
        created_at: p.created_at,
        archived_at: p.archived_at || null,
        archived_by: p.archived_by || null,
        archived_by_name: archiver ? (archiver.display_name || archiver.email || 'Administrator') : null,
        previous_status: p.previous_status || null,
        last_sign_in_at: authInfo ? authInfo.last_sign_in_at : null,
        is_email_confirmed: authInfo ? authInfo.is_email_confirmed : false,
        assessment_count: metrics.assessmentCount,
        learner_count: metrics.learnerCount,
      };
    });

    const totalFiltered = filteredCount ?? safeProfiles.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));

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
        active: activeCount,
        archived: archivedCount,
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
      auth_data_warning: authWarning,
    });
  } catch (err: any) {
    console.error('[admin/users GET] Unexpected error:', err);

    if (err instanceof MissingServiceKeyError || err?.code === 'MISSING_SERVICE_KEY') {
      return NextResponse.json(
        {
          error: 'The server is missing its admin key. Ask the site owner to configure it in the server environment.',
          code: 'MISSING_SERVICE_KEY',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Something went wrong fetching accounts. Please try again.', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
