import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 1. Authenticate user session
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized: You must be logged in to manage student records.' },
        { status: 401 }
      );
    }

    // 2. Verify approved profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, tenant_id, role, status')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.status !== 'approved' && profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden: Your account does not have active approval to manage records.' },
        { status: 403 }
      );
    }

    // 3. Parse and validate payload
    const body = await request.json();
    const { action, studentIds } = body as {
      action: 'archive' | 'restore' | 'delete';
      studentIds: string[];
    };

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: No student IDs provided.' },
        { status: 400 }
      );
    }

    if (!['archive', 'restore', 'delete'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action: Allowed actions are archive, restore, delete.' },
        { status: 400 }
      );
    }

    const tenantId = profile?.tenant_id;

    // 4. Execute operation
    if (action === 'archive') {
      let query = (supabase as any)
        .from('students')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user.id,
        })
        .in('id', studentIds);

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { error: updErr } = await query;
      if (updErr) {
        // Fallback if column not yet applied on older schema
        console.warn('Archive column notice:', updErr.message);
        return NextResponse.json(
          { error: `Database update error: ${updErr.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'archive',
        count: studentIds.length,
        message: `Successfully archived ${studentIds.length} learner(s).`,
      });
    }

    if (action === 'restore') {
      let query = (supabase as any)
        .from('students')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
        })
        .in('id', studentIds);

      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { error: resErr } = await query;
      if (resErr) {
        return NextResponse.json(
          { error: `Database restore error: ${resErr.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'restore',
        count: studentIds.length,
        message: `Successfully restored ${studentIds.length} learner(s) to active list.`,
      });
    }

    if (action === 'delete') {
      let query = supabase.from('students').delete().in('id', studentIds);
      if (tenantId) query = query.eq('tenant_id', tenantId);

      const { error: delErr } = await query;
      if (delErr) {
        return NextResponse.json(
          { error: `Failed to permanently delete records: ${delErr.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'delete',
        count: studentIds.length,
        message: `Permanently deleted ${studentIds.length} learner(s).`,
      });
    }

    return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
  } catch (err: any) {
    console.error('Server error in students bulk route:', err);
    return NextResponse.json(
      { error: err?.message || 'Server error processing student bulk action.' },
      { status: 500 }
    );
  }
}
