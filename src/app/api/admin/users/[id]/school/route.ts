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

    // 1. Authenticate caller session
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to assign schools.' },
        { status: 401 }
      );
    }

    // 2. Verify caller is approved platform admin
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, role, status, is_platform_admin')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return NextResponse.json(
        { error: 'Failed to verify caller authorization.' },
        { status: 403 }
      );
    }

    if (
      callerProfile.role !== 'admin' ||
      callerProfile.status !== 'approved' ||
      !callerProfile.is_platform_admin
    ) {
      return NextResponse.json(
        { error: 'Forbidden: Only the platform administrator can assign or change schools.' },
        { status: 403 }
      );
    }

    // 3. Parse request payload
    const body = await request.json();
    const rawTenantId = body.tenant_id;
    const cleanTenantId = typeof rawTenantId === 'string' && rawTenantId.trim() ? rawTenantId.trim() : null;

    const adminClient = createAdminClient();

    // 4. Validate tenant exists if provided
    let schoolName: string | null = null;
    if (cleanTenantId) {
      const { data: tenant, error: tenantErr } = await adminClient
        .from('tenants')
        .select('id, name')
        .eq('id', cleanTenantId)
        .maybeSingle();

      if (tenantErr || !tenant) {
        return NextResponse.json(
          { error: 'The selected school organization was not found.' },
          { status: 400 }
        );
      }
      schoolName = tenant.name;
    }

    // 5. Fetch target user profile
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

    // 6. Update user's tenant_id
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({
        tenant_id: cleanTenantId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId);

    if (updateErr) {
      console.error('[Admin API] Failed to update user school:', updateErr);
      return NextResponse.json(
        { error: 'Failed to update user school. Please try again.' },
        { status: 500 }
      );
    }

    // 7. Write audit log entry
    try {
      await adminClient.from('audit_logs').insert({
        tenant_id: cleanTenantId || targetProfile.tenant_id || null,
        user_id: caller.id,
        action: 'USER_SCHOOL_CHANGED',
        details: {
          target_user_id: targetUserId,
          target_email: targetProfile.email,
          target_name: targetProfile.display_name,
          previous_tenant_id: targetProfile.tenant_id,
          new_tenant_id: cleanTenantId,
          school_name: schoolName,
          changed_by: caller.id,
        },
      });
    } catch (auditErr) {
      console.error('[Admin API] Failed to write audit log for school change:', auditErr);
    }

    return NextResponse.json({
      success: true,
      user: {
        id: targetUserId,
        tenant_id: cleanTenantId,
      },
    });
  } catch (err: any) {
    console.error('[Admin API] Error in school assignment route:', err);
    return NextResponse.json(
      { error: 'Something went wrong while assigning the school. Please try again.' },
      { status: 500 }
    );
  }
}

