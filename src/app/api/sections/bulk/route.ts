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
        { error: 'Unauthorized: You must be logged in to manage sections.' },
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
        { error: 'Forbidden: Your account does not have active approval to manage sections.' },
        { status: 403 }
      );
    }

    // 3. Parse and validate payload
    const body = await request.json();
    const { action, sectionIds } = body as {
      action: 'archive' | 'restore' | 'delete';
      sectionIds: string[];
    };

    if (!Array.isArray(sectionIds) || sectionIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request: No section IDs provided.' },
        { status: 400 }
      );
    }

    if (!['archive', 'restore', 'delete'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action: Allowed actions are archive, restore, delete.' },
        { status: 400 }
      );
    }

    // 4. Execute operation
    if (action === 'archive') {
      const { error: updErr } = await (supabase as any)
        .from('sections')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user.id,
        })
        .in('id', sectionIds);

      if (updErr) {
        return NextResponse.json(
          { error: `Database update error: ${updErr.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'archive',
        count: sectionIds.length,
        message: `Successfully archived ${sectionIds.length} section(s).`,
      });
    }

    if (action === 'restore') {
      const { error: resErr } = await (supabase as any)
        .from('sections')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
        })
        .in('id', sectionIds);

      if (resErr) {
        return NextResponse.json(
          { error: `Database restore error: ${resErr.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'restore',
        count: sectionIds.length,
        message: `Successfully restored ${sectionIds.length} section(s).`,
      });
    }

    if (action === 'delete') {
      const { error: delErr } = await (supabase as any)
        .from('sections')
        .delete()
        .in('id', sectionIds);

      if (delErr) {
        return NextResponse.json(
          { error: `Failed to permanently delete section(s): ${delErr.message}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'delete',
        count: sectionIds.length,
        message: `Permanently deleted ${sectionIds.length} section(s).`,
      });
    }

    return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
  } catch (err: any) {
    console.error('Server error in sections bulk route:', err);
    return NextResponse.json(
      { error: err?.message || 'Server error processing section bulk action.' },
      { status: 500 }
    );
  }
}
