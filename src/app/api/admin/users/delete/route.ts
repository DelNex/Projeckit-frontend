import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkAndVerifyDeletionCode } from '@/lib/admin/deletion-code';

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
        { error: 'Forbidden: Only approved administrators can permanently delete accounts.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      userIds: rawUserIds,
      code,
      confirmationPhrase,
      choice,
      reassignToUserId,
    } = body;

    // Validate confirmation phrase
    if (confirmationPhrase !== 'DELETE') {
      return NextResponse.json(
        { error: 'You must type DELETE to confirm permanent deletion.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(rawUserIds) || rawUserIds.length === 0) {
      return NextResponse.json(
        { error: 'Please select at least one account to delete.' },
        { status: 400 }
      );
    }

    const userIds = Array.from(new Set(rawUserIds.map((id: any) => String(id))));

    // Safeguard: Admin cannot delete themselves
    if (userIds.includes(caller.id)) {
      return NextResponse.json(
        { error: 'You cannot delete your own administrator account.' },
        { status: 400 }
      );
    }

    // Validate choice
    if (choice !== 'reassign' && choice !== 'delete') {
      return NextResponse.json(
        { error: 'A content handling choice is required: either reassign or delete content.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const isPlatformAdmin = Boolean(callerProfile.is_platform_admin);

    // Fetch target profiles to verify they exist, belong to tenant, and are ARCHIVED
    const { data: targetProfiles, error: fetchErr } = await adminClient
      .from('profiles')
      .select('id, email, display_name, role, status, tenant_id, archived_at')
      .in('id', userIds);

    if (fetchErr || !targetProfiles || targetProfiles.length === 0) {
      return NextResponse.json(
        { error: 'Failed to find target accounts for deletion.' },
        { status: 404 }
      );
    }

    if (targetProfiles.length !== userIds.length) {
      return NextResponse.json(
        { error: 'Some selected accounts could not be found.' },
        { status: 404 }
      );
    }

    const targetTenantIds = new Set(targetProfiles.map((profile) => profile.tenant_id).filter(Boolean));
    if (targetTenantIds.size > 1) {
      return NextResponse.json(
        { error: 'Permanently delete accounts from one school at a time so the correct deletion code can be verified.' },
        { status: 400 }
      );
    }

    // Tenant check & Requirement 6e: A non-archived account can never be deleted
    const targetTenantId = targetProfiles[0].tenant_id || callerProfile.tenant_id;
    for (const p of targetProfiles) {
      if (!isPlatformAdmin && p.tenant_id !== callerProfile.tenant_id) {
        return NextResponse.json(
          { error: 'You cannot delete accounts belonging to another school.' },
          { status: 403 }
        );
      }

      if (!p.archived_at) {
        return NextResponse.json(
          {
            error: `Account ${p.display_name || p.email} is active. Only archived accounts can be permanently deleted. Archive the account first.`,
          },
          { status: 400 }
        );
      }
    }

    if (!targetTenantId) {
      return NextResponse.json(
        { error: 'Your account is not linked to a school tenant.' },
        { status: 400 }
      );
    }

    // Verify deletion code against tenant
    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'A deletion code is required.' },
        { status: 400 }
      );
    }

    const codeCheck = await checkAndVerifyDeletionCode(
      adminClient,
      targetTenantId,
      code,
      caller.id
    );

    if (!codeCheck.success) {
      return NextResponse.json(
        { error: codeCheck.error || 'Invalid deletion code.', isLocked: codeCheck.isLocked },
        { status: 400 }
      );
    }

    // Validate reassignment target if choice is 'reassign'
    if (choice === 'reassign') {
      if (!reassignToUserId || typeof reassignToUserId !== 'string') {
        return NextResponse.json(
          { error: 'Please select a teacher to reassign content to.' },
          { status: 400 }
        );
      }

      if (userIds.includes(reassignToUserId)) {
        return NextResponse.json(
          { error: 'Content cannot be reassigned to an account that is being deleted.' },
          { status: 400 }
        );
      }

      const { data: recipientProfile } = await adminClient
        .from('profiles')
        .select('id, tenant_id, status, role, archived_at')
        .eq('id', reassignToUserId)
        .maybeSingle();

      if (
        !recipientProfile ||
        recipientProfile.status !== 'approved' ||
        recipientProfile.archived_at ||
        (!isPlatformAdmin && recipientProfile.tenant_id !== targetTenantId)
      ) {
        return NextResponse.json(
          { error: 'The selected reassignment teacher must be an active, approved account in the same school.' },
          { status: 400 }
        );
      }
    }

    // Call atomic transactional RPC function to reassign/delete content and delete profile rows
    const { data: rpcResult, error: rpcErr } = await adminClient.rpc(
      'execute_permanent_account_deletion',
      {
        p_user_ids: userIds,
        p_choice: choice,
        p_reassign_to_id: choice === 'reassign' ? reassignToUserId : null,
        p_caller_id: caller.id,
      }
    );

    if (rpcErr) {
      console.error('[POST /api/admin/users/delete] RPC error:', rpcErr);
      return NextResponse.json(
        { error: `Failed to delete accounts: ${rpcErr.message}` },
        { status: 500 }
      );
    }

    // Delete the Supabase auth user records
    const authDeletionFailures: string[] = [];
    for (const uid of userIds) {
      try {
        const { error: authDelErr } = await adminClient.auth.admin.deleteUser(uid);
        if (authDelErr) {
          console.warn(`[POST /api/admin/users/delete] Warning deleting auth user ${uid}:`, authDelErr.message);
          authDeletionFailures.push(uid);
        }
      } catch (authEx) {
        console.warn(`[POST /api/admin/users/delete] Exception deleting auth user ${uid}:`, authEx);
        authDeletionFailures.push(uid);
      }
    }

    // Write audit log entry (Never log the code!)
    try {
      await adminClient.from('audit_logs').insert({
        tenant_id: targetTenantId,
        user_id: caller.id,
        action: 'PERMANENT_DELETE_USER',
        details: {
          deleted_by: caller.id,
          deleted_user_ids: userIds,
          deleted_users: targetProfiles.map((p) => ({
            id: p.id,
            email: p.email,
            display_name: p.display_name,
            role: p.role,
          })),
          choice,
          reassigned_to: choice === 'reassign' ? reassignToUserId : null,
          deleted_count: userIds.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn('[POST /api/admin/users/delete] Warning writing audit log:', auditErr);
    }

    return NextResponse.json({
      success: true,
      deletedCount: userIds.length,
      rpcResult,
      authDeletionFailures: authDeletionFailures.length > 0 ? authDeletionFailures : undefined,
    });
  } catch (err: any) {
    console.error('[POST /api/admin/users/delete] Unexpected error:', err);
    return NextResponse.json(
      { error: 'An unexpected error occurred while permanently deleting accounts.' },
      { status: 500 }
    );
  }
}
