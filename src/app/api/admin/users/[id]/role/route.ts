import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    // 1. Authenticate caller
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

    // 2. Verify caller is approved admin
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, status, tenant_id, archived_at')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return NextResponse.json(
        { error: 'Failed to verify administrator privileges.' },
        { status: 403 }
      );
    }

    if (callerProfile.role !== 'admin' || callerProfile.status !== 'approved' || callerProfile.archived_at) {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can modify user roles.' },
        { status: 403 }
      );
    }

    // 3. Self-protection: Admins cannot change/demote their own account role
    if (caller.id === targetUserId) {
      return NextResponse.json(
        { error: 'You cannot change or demote your own administrator role.' },
        { status: 400 }
      );
    }

    // 4. Parse payload
    const body = await request.json();
    const newRole = body.role as 'admin' | 'teacher';

    if (!newRole || !['admin', 'teacher'].includes(newRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Role must be "admin" or "teacher".' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // 5. Fetch target profile
    const { data: targetProfile, error: targetErr } = await adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id')
      .eq('id', targetUserId)
      .maybeSingle();

    if (targetErr || !targetProfile) {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }

    // 6. Tenant Scoping
    if (callerProfile.tenant_id && targetProfile.tenant_id !== callerProfile.tenant_id) {
      return NextResponse.json(
        { error: 'Forbidden: You can only modify user roles within your assigned school.' },
        { status: 403 }
      );
    }

    // 7. Last Admin Protection
    if (
      targetProfile.role === 'admin' &&
      newRole === 'teacher' &&
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
          { error: 'Cannot demote this user: Every school must maintain at least one active administrator.' },
          { status: 400 }
        );
      }
    }

    // 8. Update profile role
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId);

    if (updateErr) {
      console.error('[Admin API] Failed to update role:', updateErr);
      return NextResponse.json(
        { error: 'Failed to update user role. Please try again.' },
        { status: 500 }
      );
    }

    // 9. Write audit log
    try {
      await adminClient.from('audit_logs').insert({
        tenant_id: targetProfile.tenant_id || callerProfile.tenant_id || null,
        user_id: caller.id,
        action: `USER_ROLE_CHANGED`,
        details: {
          target_user_id: targetUserId,
          target_email: targetProfile.email,
          target_name: targetProfile.display_name,
          previous_role: targetProfile.role,
          new_role: newRole,
        },
      });
    } catch (auditErr) {
      console.error('[Admin API] Failed to write audit log:', auditErr);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: targetUserId,
        role: newRole,
      },
    });
  } catch (err: any) {
    console.error('[Admin API] Error in role update route:', err);
    return NextResponse.json(
      { error: 'Something went wrong while updating user role. Please try again.' },
      { status: 500 }
    );
  }
}
