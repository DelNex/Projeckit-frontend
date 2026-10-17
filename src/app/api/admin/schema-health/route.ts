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
    const supabase = createAdminClient();

    // Try RPC first if available
    const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('check_tos_schema_health');
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

