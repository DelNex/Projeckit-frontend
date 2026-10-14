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
        { error: 'Forbidden: Only approved administrators can archive user accounts.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawUserIds = body.userIds;

    if (!Array.isArray(rawUserIds) || rawUserIds.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one account to archive.' },
        { status: 400 }
      );
    }

    const userIds = Array.from(new Set(rawUserIds.map((id: any) => String(id))));
    const isPlatformAdmin = Boolean(callerProfile.is_platform_admin);
    const adminClient = createAdminClient();

    // Fetch target profiles
    const { data: targetProfiles, error: fetchErr } = await adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id, archived_at')
      .in('id', userIds);

    if (fetchErr || !targetProfiles) {
      return NextResponse.json(
        { error: 'Failed to fetch user accounts for archiving.' },
        { status: 500 }
      );
    }

    // Map profiles by ID
    const profileMap = new Map(targetProfiles.map((p) => [p.id, p]));

    // Check school admins count for school of targets to prevent leaving a school with 0 active admins
    // Group target users by tenant_id
    const tenantTargetMap = new Map<string, string[]>();
    for (const p of targetProfiles) {
      if (p.tenant_id) {
        const list = tenantTargetMap.get(p.tenant_id) || [];
        list.push(p.id);
        tenantTargetMap.set(p.tenant_id, list);
      }
    }

    // For each affected school, check total active approved admins
    const schoolAdminsMap = new Map<string, number>();
    for (const tenantId of tenantTargetMap.keys()) {
      const { count } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('role', 'admin')
        .eq('status', 'approved')
        .is('archived_at', null);

      schoolAdminsMap.set(tenantId, count || 0);
    }

    const results: Array<{ id: string; name: string; success: boolean; reason?: string }> = [];
    const archivedIds: string[] = [];
    const nowIso = new Date().toISOString();

    for (const uid of userIds) {
      const target = profileMap.get(uid);

      if (!target) {
        results.push({ id: uid, name: 'Unknown User', success: false, reason: 'Account not found.' });
        continue;
      }

      // Safeguard: Cannot archive self
      if (uid === caller.id) {
        results.push({
          id: uid,
          name: target.display_name || target.email || uid,
          success: false,
          reason: 'You cannot archive your own administrator account.',
        });
        continue;
      }

      // Safeguard: School scoping
      if (!isPlatformAdmin && target.tenant_id !== callerProfile.tenant_id) {
        results.push({
          id: uid,
          name: target.display_name || target.email || uid,
          success: false,
          reason: 'You cannot archive users from another school.',
        });
        continue;
      }

      // Safeguard: Already archived
      if (target.archived_at) {
        results.push({
          id: uid,
          name: target.display_name || target.email || uid,
          success: false,
          reason: 'Account is already archived.',
        });
        continue;
      }

      // Safeguard: Cannot leave school with zero active approved admins
      if (target.role === 'admin' && target.status === 'approved' && target.tenant_id) {
        const totalSchoolAdmins = schoolAdminsMap.get(target.tenant_id) || 1;
        // Count how many admins from this tenant are being archived in this batch so far
        const alreadyArchivedInBatch = results.filter((r) => {
          const p = profileMap.get(r.id);
          return r.success && p?.tenant_id === target.tenant_id && p?.role === 'admin';
        }).length;

        if (totalSchoolAdmins - alreadyArchivedInBatch <= 1) {
          results.push({
            id: uid,
            name: target.display_name || target.email || uid,
            success: false,
            reason: 'Cannot archive the only active administrator for this school.',
          });
          continue;
        }
      }

      // Perform archive on profile
      const previousStatus = target.status;
      const { error: updateErr } = await adminClient
        .from('profiles')
        .update({
          status: 'suspended',
          previous_status: previousStatus,
          archived_at: nowIso,
          archived_by: caller.id,
          updated_at: nowIso,
        })
        .eq('id', uid);

      if (updateErr) {
        results.push({
          id: uid,
          name: target.display_name || target.email || uid,
          success: false,
          reason: 'Failed to update account record.',
        });
        continue;
      }

      // Auth ban: ban duration 100 years + sign out so session immediately invalidates
      try {
        await adminClient.auth.admin.updateUserById(uid, {
          ban_duration: '876000h',
        });
      } catch (authBanErr) {
        console.warn(`[POST /api/admin/users/archive] Warning updating auth ban for ${uid}:`, authBanErr);
      }

      // Write audit log entry
      try {
        await adminClient.from('audit_logs').insert({
          tenant_id: target.tenant_id || callerProfile.tenant_id,
          user_id: caller.id,
          action: 'ARCHIVE_USER',
          details: {
            target_user_id: uid,
            target_name: target.display_name,
            target_email: target.email,
            target_role: target.role,
            previous_status: previousStatus,
            archived_by: caller.id,
            timestamp: nowIso,
          },
        });
      } catch (auditErr) {
        console.warn(`[POST /api/admin/users/archive] Warning writing audit log for ${uid}:`, auditErr);
      }

      archivedIds.push(uid);
      results.push({
        id: uid,
        name: target.display_name || target.email || uid,
        success: true,
      });
    }

    return NextResponse.json({
      success: archivedIds.length > 0,
      archivedCount: archivedIds.length,
      archivedIds,
      results,
    });
  } catch (err: any) {
    console.error('[POST /api/admin/users/archive] Unexpected error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while archiving accounts.' },
      { status: 500 }
    );
  }
}

