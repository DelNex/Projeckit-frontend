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
        { error: 'Forbidden: Only approved administrators can restore user accounts.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const rawUserIds = body.userIds;

    if (!Array.isArray(rawUserIds) || rawUserIds.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one account to restore.' },
        { status: 400 }
      );
    }

    const userIds = Array.from(new Set(rawUserIds.map((id: any) => String(id))));
    const isPlatformAdmin = Boolean(callerProfile.is_platform_admin);
    const adminClient = createAdminClient();

    // Fetch target profiles
    const { data: targetProfiles, error: fetchErr } = await adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id, archived_at, previous_status')
      .in('id', userIds);

    if (fetchErr || !targetProfiles) {
      return NextResponse.json(
        { error: 'Failed to fetch user accounts for restoration.' },
        { status: 500 }
      );
    }

    const profileMap = new Map(targetProfiles.map((p) => [p.id, p]));
    const results: Array<{ id: string; name: string; success: boolean; reason?: string }> = [];
    const restoredIds: string[] = [];
    const nowIso = new Date().toISOString();

    for (const uid of userIds) {
      const target = profileMap.get(uid);

      if (!target) {
        results.push({ id: uid, name: 'Unknown User', success: false, reason: 'Account not found.' });
        continue;
      }

      // Safeguard: School scoping
      if (!isPlatformAdmin && target.tenant_id !== callerProfile.tenant_id) {
        results.push({
          id: uid,
          name: target.display_name || target.email || uid,
          success: false,
          reason: 'You cannot restore users from another school.',
        });
        continue;
      }

      // Safeguard: Must be archived to restore
      if (!target.archived_at) {
        results.push({
          id: uid,
          name: target.display_name || target.email || uid,
          success: false,
          reason: 'Account is not archived.',
        });
        continue;
      }

      // Determine restored status:
      // Return the account to the status it had before archiving (default 'approved' if empty,
      // but NEVER 'approved' for an account that was pending).
      let restoredStatus: 'pending' | 'approved' | 'rejected' | 'suspended' = 'approved';
      if (target.previous_status === 'pending') {
        restoredStatus = 'pending';
      } else if (target.previous_status === 'rejected') {
        restoredStatus = 'rejected';
      } else if (target.previous_status === 'approved') {
        restoredStatus = 'approved';
      } else if (target.previous_status === 'suspended') {
        restoredStatus = 'suspended';
      }

      // Perform restore on profile
      const { error: updateErr } = await adminClient
        .from('profiles')
        .update({
          status: restoredStatus,
          previous_status: null,
          archived_at: null,
          archived_by: null,
          updated_at: nowIso,
        })
        .eq('id', uid);

      if (updateErr) {
        results.push({
          id: uid,
          name: target.display_name || target.email || uid,
          success: false,
          reason: 'Failed to restore account record.',
        });
        continue;
      }

      // Lift auth ban and ensure email is confirmed
      try {
        await adminClient.auth.admin.updateUserById(uid, {
          ban_duration: 'none',
          email_confirm: true,
        });
      } catch (authUnbanErr) {
        console.warn(`[POST /api/admin/users/restore] Warning lifting auth ban for ${uid}:`, authUnbanErr);
      }

      // Write audit log entry
      try {
        await adminClient.from('audit_logs').insert({
          tenant_id: target.tenant_id || callerProfile.tenant_id,
          user_id: caller.id,
          action: 'RESTORE_USER',
          details: {
            target_user_id: uid,
            target_name: target.display_name,
            target_email: target.email,
            target_role: target.role,
            restored_status: restoredStatus,
            restored_by: caller.id,
            timestamp: nowIso,
          },
        });
      } catch (auditErr) {
        console.warn(`[POST /api/admin/users/restore] Warning writing audit log for ${uid}:`, auditErr);
      }

      restoredIds.push(uid);
      results.push({
        id: uid,
        name: target.display_name || target.email || uid,
        success: true,
      });
    }

    return NextResponse.json({
      success: restoredIds.length > 0,
      restoredCount: restoredIds.length,
      restoredIds,
      results,
    });
  } catch (err: any) {
    console.error('[POST /api/admin/users/restore] Unexpected error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while restoring accounts.' },
      { status: 500 }
    );
  }
}

