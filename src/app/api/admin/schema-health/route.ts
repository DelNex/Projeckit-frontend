import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REQUIRED_TOS_COLUMNS = [
  'teacher_name',
  'days_taught',
  'total_days',
  'exam_type',
  'description',
  'sections',
  'generated_at',
  'rows',
  'target_items',
  'status',
];

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: Session required to check schema health.' },
        { status: 401 }
      );
    }

    // 2. Verify caller is an approved admin
    const { data: callerProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('role, status, archived_at, is_platform_admin')
      .eq('id', user.id)
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
        { error: 'Forbidden: Only approved administrators can check schema health.' },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();

    // Try RPC first if available (service-role only)
    const { data: rpcData, error: rpcErr } = await (adminClient as any).rpc('check_tos_schema_health');
    if (!rpcErr && rpcData) {
      return NextResponse.json({
        healthy: rpcData.healthy,
        missingColumns: rpcData.missing_columns || [],
        requiredMigration: rpcData.healthy ? null : '20260908000020_tos_eclassroom_redesign.sql',
        checkedAt: rpcData.checked_at,
      });
    }

    // Direct fallback check if RPC is not yet created
    const { data, error } = await (supabase as any)
      .from('tos_documents')
      .select('id, teacher_name, days_taught, total_days, exam_type, description, sections, generated_at')
      .limit(1);

    if (error) {
      // Check if error is missing column error (PGRST204)
      const msg = error.message || '';
      const colMatch = msg.match(/Could not find the '([^']+)' column/i);
      const missing = colMatch ? [colMatch[1]] : ['schema_update_required'];
      return NextResponse.json({
        healthy: false,
        missingColumns: missing,
        requiredMigration: '20260908000020_tos_eclassroom_redesign.sql',
        error: error.message,
      });
    }

    return NextResponse.json({
      healthy: true,
      missingColumns: [],
      requiredMigration: null,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        healthy: false,
        missingColumns: ['connection_error'],
        requiredMigration: '20260908000020_tos_eclassroom_redesign.sql',
        error: err.message || 'Failed to check schema health',
      },
      { status: 500 }
    );
  }
}

