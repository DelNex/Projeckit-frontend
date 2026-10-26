import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in.' },
        { status: 401 }
      );
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('id, role, status, tenant_id, is_platform_admin, archived_at')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'approved' || callerProfile.archived_at) {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can access this route.' },
        { status: 403 }
      );
    }

    if (!callerProfile.is_platform_admin) {
      return NextResponse.json(
        { error: 'Forbidden: Only platform administrators can reset a lost deletion code.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const targetTenantId = body.tenantId || callerProfile.tenant_id;

    if (!targetTenantId) {
      return NextResponse.json(
        { error: 'Target school tenant ID is required.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Delete existing code for this tenant
    const { error: delErr } = await adminClient
      .from('admin_delete_codes')
      .delete()
      .eq('tenant_id', targetTenantId);

    if (delErr) {
      console.error('[POST /api/admin/deletion-code/reset] Delete error:', delErr);
      return NextResponse.json(
        { error: 'Failed to reset deletion code.' },
        { status: 500 }
      );
    }

    // Write audit log entry
    await adminClient.from('audit_logs').insert({
      tenant_id: targetTenantId,
      user_id: caller.id,
      action: 'RESET_DELETION_CODE',
      details: {
        reset_by: caller.id,
        target_tenant_id: targetTenantId,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Deletion code has been reset. A new code can now be configured.',
    });
  } catch (err: any) {
    console.error('[POST /api/admin/deletion-code/reset] Error:', err);
    return NextResponse.json(
      { error: 'Failed to reset deletion code.' },
      { status: 500 }
    );
  }
}
