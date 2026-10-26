import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = await createClient();

    // 1. Authenticate caller session
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !caller) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in as an administrator.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    // 2. Admin verification
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('role, status, archived_at')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileErr || !callerProfile) {
      return NextResponse.json(
        { error: 'Failed to verify administrator privileges.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    if (callerProfile.role !== 'admin' || callerProfile.status !== 'approved' || callerProfile.archived_at) {
      return NextResponse.json(
        { error: 'Forbidden: Only approved administrators can access system health.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // 3. Health checks
    let serviceKeyPresent = false;
    let profilesQueryOk = false;
    let authAdminOk = false;
    let migrationColumnsPresent = false;

    // Check 1: service key present
    try {
      const adminClient = createAdminClient();
      serviceKeyPresent = true;

      // Check 2: profiles query works
      try {
        const { error: pErr } = await adminClient
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .limit(1);
        profilesQueryOk = !pErr;
      } catch {
        profilesQueryOk = false;
      }

      // Check 3: auth admin call works
      try {
        const { error: aErr } = await adminClient.auth.admin.getUserById(caller.id);
        authAdminOk = !aErr;
      } catch {
        authAdminOk = false;
      }

      // Check 4: migration columns present (e.g. is_platform_admin)
      try {
        const { error: mErr } = await adminClient
          .from('profiles')
          .select('id, is_platform_admin', { count: 'exact', head: true })
          .limit(1);
        migrationColumnsPresent = !mErr;
      } catch {
        migrationColumnsPresent = false;
      }
    } catch (keyErr) {
      serviceKeyPresent = false;
    }

    const allOk = serviceKeyPresent && profilesQueryOk && authAdminOk && migrationColumnsPresent;

    return NextResponse.json({
      ok: allOk,
      checks: {
        service_key_present: serviceKeyPresent,
        profiles_query_ok: profilesQueryOk,
        auth_admin_ok: authAdminOk,
        migration_columns_present: migrationColumnsPresent,
      },
    });
  } catch (err: any) {
    console.error('[admin/health GET] Unexpected error:', err);
    return NextResponse.json(
      {
        ok: false,
        checks: {
          service_key_present: false,
          profiles_query_ok: false,
          auth_admin_ok: false,
          migration_columns_present: false,
        },
      },
      { status: 500 }
    );
  }
}
