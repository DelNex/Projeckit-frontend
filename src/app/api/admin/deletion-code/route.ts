import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getTenantDeletionCodeStatus,
  hashDeletionCode,
  verifyDeletionCode,
} from '@/lib/admin/deletion-code';

export async function GET(request: Request) {
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
      .select('id, role, status, tenant_id, is_platform_admin')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'approved') {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can access deletion code settings.' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const tenantParam = url.searchParams.get('tenantId');
    const targetTenantId = callerProfile.is_platform_admin && tenantParam
      ? tenantParam
      : callerProfile.tenant_id;

    if (!targetTenantId) {
      return NextResponse.json(
        { error: 'Your account is not linked to a school tenant.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const status = await getTenantDeletionCodeStatus(adminClient, targetTenantId);

    return NextResponse.json({
      success: true,
      ...status,
      isPlatformAdmin: Boolean(callerProfile.is_platform_admin),
    });
  } catch (err: any) {
    console.error('[GET /api/admin/deletion-code] Error:', err);
    return NextResponse.json(
      { error: 'Failed to retrieve deletion code status.' },
      { status: 500 }
    );
  }
}

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
      .select('id, role, status, tenant_id, is_platform_admin')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== 'admin' || callerProfile.status !== 'approved') {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can manage deletion codes.' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { currentCode, newCode, confirmNewCode, tenantId } = body;

    const targetTenantId = callerProfile.is_platform_admin && tenantId
      ? tenantId
      : callerProfile.tenant_id;

    if (!targetTenantId) {
      return NextResponse.json(
        { error: 'Your account is not linked to a school tenant.' },
        { status: 400 }
      );
    }

    if (!newCode || typeof newCode !== 'string' || newCode.length < 8) {
      return NextResponse.json(
        { error: 'New deletion code must be at least 8 characters in length.' },
        { status: 400 }
      );
    }

    if (newCode !== confirmNewCode) {
      return NextResponse.json(
        { error: 'The new deletion codes do not match.' },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Check if code is already set
    const { data: existingCode } = await adminClient
      .from('admin_delete_codes')
      .select('code_hash, locked_until')
      .eq('tenant_id', targetTenantId)
      .maybeSingle();

    const hasExistingCode = Boolean(existingCode?.code_hash);

    if (hasExistingCode) {
      // Current code is required unless caller is platform admin resetting
      if (!currentCode) {
        return NextResponse.json(
          { error: 'Current deletion code is required to change it.' },
          { status: 400 }
        );
      }

      const isValidCurrent = verifyDeletionCode(currentCode, existingCode!.code_hash);
      if (!isValidCurrent) {
        return NextResponse.json(
          { error: 'The current deletion code is incorrect.' },
          { status: 400 }
        );
      }
    }

    // Hash and store the new code
    const hashed = hashDeletionCode(newCode);

    const { error: upsertErr } = await adminClient
      .from('admin_delete_codes')
      .upsert({
        tenant_id: targetTenantId,
        code_hash: hashed,
        set_by: caller.id,
        failed_attempts: 0,
        locked_until: null,
        updated_at: new Date().toISOString(),
      });

    if (upsertErr) {
      console.error('[POST /api/admin/deletion-code] Upsert error:', upsertErr);
      return NextResponse.json(
        { error: 'Failed to update deletion code.' },
        { status: 500 }
      );
    }

    // Write audit log entry
    await adminClient.from('audit_logs').insert({
      tenant_id: targetTenantId,
      user_id: caller.id,
      action: hasExistingCode ? 'UPDATE_DELETION_CODE' : 'SET_DELETION_CODE',
      details: {
        set_by: caller.id,
        tenant_id: targetTenantId,
        timestamp: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      message: hasExistingCode
        ? 'Deletion code changed successfully.'
        : 'Deletion code created successfully.',
    });
  } catch (err: any) {
    console.error('[POST /api/admin/deletion-code] Error:', err);
    return NextResponse.json(
      { error: 'Failed to save deletion code.' },
      { status: 500 }
    );
  }
}

