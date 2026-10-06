import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // 2. Verify approved profile & tenant linkage
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

    if (!profile?.tenant_id) {
      return NextResponse.json(
        { error: 'Forbidden: Your account is not linked to a school tenant.' },
        { status: 403 }
      );
    }

    const tenantId = profile.tenant_id;

    // 3. Parse and validate payload
    const body = await request.json();
    const { action, studentIds, targetSection } = body as {
      action: 'archive' | 'restore' | 'delete' | 'move';
      studentIds: string[];
      targetSection?: string;
    };

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: No student IDs provided.' },
        { status: 400 }
      );
    }

    if (studentIds.length > 500) {
      return NextResponse.json(
        { error: 'Batch limit exceeded: Maximum 500 IDs per operation.' },
        { status: 400 }
      );
    }

    const allValidUuids = studentIds.every((id) => typeof id === 'string' && UUID_REGEX.test(id));
    if (!allValidUuids) {
      return NextResponse.json(
        { error: 'Invalid ID format: All student IDs must be valid UUIDs.' },
        { status: 400 }
      );
    }

    if (!['archive', 'restore', 'delete', 'move'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action: Allowed actions are archive, restore, delete, move.' },
        { status: 400 }
      );
    }

    // 4. Execute operation strictly scoped to tenant_id
    if (action === 'archive') {
      const { error: updErr } = await (supabase as any)
        .from('students')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user.id,
        })
        .in('id', studentIds)
        .eq('tenant_id', tenantId);

      if (updErr) {
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
      const { error: resErr } = await (supabase as any)
        .from('students')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
        })
        .in('id', studentIds)
        .eq('tenant_id', tenantId);

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
      const { error: delErr } = await supabase
        .from('students')
        .delete()
        .in('id', studentIds)
        .eq('tenant_id', tenantId);

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

    if (action === 'move') {
      if (!targetSection || typeof targetSection !== 'string' || !targetSection.trim()) {
        return NextResponse.json(
          { error: 'Invalid request: Target section name is required for move action.' },
          { status: 400 }
        );
      }

      const { error: moveErr } = await supabase
        .from('students')
        .update({
          section_name: targetSection.trim(),
        })
        .in('id', studentIds)
        .eq('tenant_id', tenantId);

      if (moveErr) {
        return NextResponse.json(
          { error: `Failed to move learners: ${moveErr.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'move',
        count: studentIds.length,
        message: `Successfully moved ${studentIds.length} learner(s) to ${targetSection.trim()}.`,
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
