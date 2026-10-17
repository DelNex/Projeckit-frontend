import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPhilippineSchoolYear, isValidSchoolYear } from '@/lib/academic-calendar';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate caller
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to provision school tenants.' },
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
        { error: 'Failed to verify administrator privileges.' },
        { status: 403 }
      );
    }

    if (
      callerProfile.role !== 'admin' ||
      callerProfile.status !== 'approved' ||
      !callerProfile.is_platform_admin
    ) {
      return NextResponse.json(
        { error: 'Forbidden: Only the platform administrator can add schools.' },
        { status: 403 }
      );
    }

    // 3. Parse and validate body
    const body = await request.json();
    const cleanName = (body.name || '').trim();
    const cleanCode = (body.code || '').trim() || null;
    const cleanSchoolYear = (body.schoolYear || getPhilippineSchoolYear()).trim();

    if (!isValidSchoolYear(cleanSchoolYear)) {
      return NextResponse.json(
        { error: 'School year must be in format YYYY-YYYY with consecutive years.' },
        { status: 400 }
      );
    }

    if (!cleanName) {
      return NextResponse.json(
        { error: 'School organization name is required.' },
        { status: 400 }
      );
    }

    if (cleanName.length > 255) {
      return NextResponse.json(
        { error: 'School name cannot exceed 255 characters.' },
        { status: 400 }
      );
    }

    if (cleanCode && cleanCode.length > 100) {
      return NextResponse.json(
        { error: 'DepEd school code cannot exceed 100 characters.' },
        { status: 400 }
      );
    }

    // 4. Provision tenant atomically via RPC with service role
    const adminClient = createAdminClient();
    const { data: tenantData, error: rpcErr } = await (adminClient as any).rpc(
      'provision_tenant',
      {
        p_name: cleanName,
        p_code: cleanCode,
        p_school_year: cleanSchoolYear,
      }
    );

    if (rpcErr) {
      console.error('[Admin API] Error in provision_tenant RPC:', rpcErr);

      // Check for Postgres 23505 unique constraint violation
      const isUniqueViolation =
        rpcErr.code === '23505' ||
        rpcErr.message?.includes('23505') ||
        rpcErr.message?.includes('unique') ||
        rpcErr.message?.includes('duplicate key');

      if (isUniqueViolation) {
        const isCode =
          rpcErr.message?.toLowerCase().includes('code') ||
          rpcErr.details?.toLowerCase().includes('code');

        return NextResponse.json(
          {
            error: isCode
              ? 'A school organization with this DepEd code already exists.'
              : 'A school organization with this name already exists.',
          },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to provision school organization. Please try again.' },
        { status: 500 }
      );
    }

    // 5. Write audit log entry
    try {
      await adminClient.from('audit_logs').insert({
        tenant_id: tenantData?.id || null,
        user_id: caller.id,
        action: 'TENANT_PROVISIONED',
        details: {
          tenant_id: tenantData?.id,
          name: cleanName,
          code: cleanCode,
          school_year: cleanSchoolYear,
          provisioned_by: caller.id,
        },
      });
    } catch (auditErr) {
      console.error('[Admin API] Failed to write audit log for tenant provisioning:', auditErr);
    }

    return NextResponse.json({
      success: true,
      tenant: tenantData,
    });
  } catch (err: any) {
    console.error('[Admin API] Error in POST /api/admin/tenants:', err);
    return NextResponse.json(
      { error: 'Something went wrong while provisioning school tenant. Please try again.' },
      { status: 500 }
    );
  }
}

