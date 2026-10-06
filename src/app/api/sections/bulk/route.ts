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
        { error: 'Unauthorized: You must be logged in to manage sections.' },
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
        { error: 'Forbidden: Your account does not have active approval to manage sections.' },
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

    if (sectionIds.length > 500) {
      return NextResponse.json(
        { error: 'Batch limit exceeded: Maximum 500 IDs per operation.' },
        { status: 400 }
      );
    }

    const allValidUuids = sectionIds.every((id) => typeof id === 'string' && UUID_REGEX.test(id));
    if (!allValidUuids) {
      return NextResponse.json(
        { error: 'Invalid ID format: All section IDs must be valid UUIDs.' },
        { status: 400 }
      );
    }

    if (!['archive', 'restore', 'delete'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action: Allowed actions are archive, restore, delete.' },
        { status: 400 }
      );
    }

    // 4. Resolve configs belonging to this tenant for scoping
    const { data: configs, error: configErr } = await (supabase as any)
      .from('academic_configs')
      .select('id')
      .eq('tenant_id', tenantId);

    if (configErr || !configs || configs.length === 0) {
      return NextResponse.json(
        { error: 'No academic configuration found for your tenant.' },
        { status: 403 }
      );
    }

    const configIds = configs.map((c: any) => c.id);

    // 5. Execute operation strictly scoped to tenant configs
    if (action === 'archive') {
      const { error: updErr } = await (supabase as any)
        .from('sections')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: user.id,
        })
        .in('id', sectionIds)
        .in('config_id', configIds);

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
        .in('id', sectionIds)
        .in('config_id', configIds);

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
        .in('id', sectionIds)
        .in('config_id', configIds);

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
