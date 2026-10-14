import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type StatusAction = 'approve' | 'reject' | 'suspend' | 'reactivate';
type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

const ACTION_TO_STATUS: Record<StatusAction, UserStatus> = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  reactivate: 'approved',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetUserId } = await params;

    if (!targetUserId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

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
      .select('id, role, status, tenant_id, is_platform_admin')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return NextResponse.json(
        { error: 'Failed to verify caller authorization.' },
        { status: 403 }
      );
    }

    if (callerProfile.role !== 'admin' || callerProfile.status !== 'approved') {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can manage user account status.' },
        { status: 403 }
      );
    }

    // 3. Parse request payload (supports action or direct status)
    const body = await request.json();
    let targetStatus: UserStatus | null = null;

    if (body.action && body.action in ACTION_TO_STATUS) {
      targetStatus = ACTION_TO_STATUS[body.action as StatusAction];
    } else if (body.status && ['approved', 'rejected', 'suspended'].includes(body.status)) {
      targetStatus = body.status as UserStatus;
    }

    if (!targetStatus) {
      return NextResponse.json(
        { error: 'Invalid action or status. Allowed: approve, reject, suspend, reactivate.' },
        { status: 400 }
      );
    }

    // 4. Admins cannot change their own status
    if (caller.id === targetUserId) {
      return NextResponse.json(
        { error: 'You cannot modify your own administrative account status.' },
        { status: 400 }
      );
    }

    // 5. Fetch target user profile using service role
    const adminClient = createAdminClient();
    const { data: targetProfile, error: targetErr } = await adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return NextResponse.json(
        { error: 'User profile not found.' },
        { status: 404 }
      );
    }

    // 6. Tenant Scoping: only touch users in caller's school unless caller is a platform-level admin
    if (!callerProfile.is_platform_admin) {
      if (!callerProfile.tenant_id || targetProfile.tenant_id !== callerProfile.tenant_id) {
        return NextResponse.json(
          { error: 'Forbidden: You can only manage user accounts within your assigned school.' },
          { status: 403 }
        );
      }
    }

    // 7. Require School Assignment for Approval (D5)
    let effectiveTenantId = targetProfile.tenant_id;
    if (targetStatus === 'approved') {
      if (!effectiveTenantId && body.tenant_id && callerProfile.is_platform_admin) {
        effectiveTenantId = typeof body.tenant_id === 'string' ? body.tenant_id.trim() : null;
      }
      if (!effectiveTenantId) {
        return NextResponse.json(
          { error: 'Cannot approve: this teacher is not assigned to any school. Assign a school first.' },
          { status: 400 }
        );
      }
    }

    // 8. Last Admin Protection: Prevent suspending or rejecting the last remaining admin
    if (
      targetProfile.role === 'admin' &&
      targetProfile.status === 'approved' &&
      targetStatus !== 'approved' &&
      targetProfile.tenant_id
    ) {
      const { count: adminCount, error: countErr } = await adminClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', targetProfile.tenant_id)
        .eq('role', 'admin')
        .eq('status', 'approved');

      if (!countErr && adminCount !== null && adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot deactivate this account: Every school must have at least one active administrator.' },
          { status: 400 }
        );
      }
    }

    // 8. If Approving/Reactivating: Confirm the user's email via Supabase admin API
    if (targetStatus === 'approved') {
      try {
        const { error: confirmError } = await adminClient.auth.admin.updateUserById(
          targetUserId,
          { email_confirm: true }
        );
        if (confirmError) {
          console.error(`[Admin API] Failed to auto-confirm email for ${targetUserId}:`, confirmError);
        }
      } catch (authAdminErr) {
        console.error(`[Admin API] Unexpected error confirming email:`, authAdminErr);
      }
    }

    // 9. Update profile status in database
    const updatePayload: Record<string, any> = {
      status: targetStatus,
      updated_at: new Date().toISOString(),
    };
    if (effectiveTenantId && effectiveTenantId !== targetProfile.tenant_id) {
      updatePayload.tenant_id = effectiveTenantId;
    }

    const { error: updateErr } = await adminClient
      .from('profiles')
      .update(updatePayload)
      .eq('id', targetUserId);

    if (updateErr) {
      console.error('[Admin API] Failed to update profile status:', updateErr);
      return NextResponse.json(
        { error: 'Failed to update user status. Please try again.' },
        { status: 500 }
      );
    }

    // 10. Audit log entry
    try {
      await adminClient.from('audit_logs').insert({
        tenant_id: targetProfile.tenant_id || callerProfile.tenant_id || null,
        user_id: caller.id,
        action: `USER_STATUS_${targetStatus.toUpperCase()}`,
        details: {
          target_user_id: targetUserId,
          target_email: targetProfile.email,
          target_name: targetProfile.display_name,
          previous_status: targetProfile.status,
          new_status: targetStatus,
          requested_action: body.action || targetStatus,
        },
      });
    } catch (auditErr) {
      console.error('[Admin API] Failed to write audit log:', auditErr);
      // Non-fatal, do not fail the request
    }

    return NextResponse.json({
      success: true,
      user: {
        id: targetUserId,
        status: targetStatus,
      },
    });
  } catch (err: any) {
    console.error('[Admin API] Error in status update route:', err);
    return NextResponse.json(
      { error: 'Something went wrong while updating user status. Please try again.' },
      { status: 500 }
    );
  }
}

