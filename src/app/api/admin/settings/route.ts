import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { canEditSchoolSettings, saveSchoolSettings, validateSchoolSettings } from '@/lib/server/school-settings';
import { clearUploadLimitsCache } from '@/lib/server/upload-limits';

async function getCaller() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { response: NextResponse.json({ error: 'Sign in to view school settings.' }, { status: 401 }) };
  const { data: profile, error } = await supabase.from('profiles')
    .select('id, tenant_id, role, status, is_platform_admin, archived_at')
    .eq('id', user.id).maybeSingle();
  if (error || !profile || profile.status !== 'approved' || profile.archived_at || !profile.tenant_id) {
    return { response: NextResponse.json({ error: 'Your account does not have access to school settings.' }, { status: 403 }) };
  }
  return { caller: profile };
}

export async function GET() {
  try {
    const { caller, response } = await getCaller();
    if (response) return response;
    const admin = createAdminClient();
    const [{ data: settings, error: settingsError }, { data: platform, error: platformError }] = await Promise.all([
      admin.from('school_settings').select('*').eq('tenant_id', caller!.tenant_id).maybeSingle(),
      admin.from('platform_settings').select('max_module_upload_cap_mb, max_scan_image_cap_mb').eq('id', 1).maybeSingle(),
    ]);
    if (settingsError || platformError) {
      return NextResponse.json({ error: 'Could not load school settings. Apply the latest settings migration.' }, { status: 503 });
    }
    const caps = {
      max_module_upload_cap_mb: platform?.max_module_upload_cap_mb ?? 60,
      max_scan_image_cap_mb: platform?.max_scan_image_cap_mb ?? 30,
    };
    return NextResponse.json({
      settings: settings ?? {
        tenant_id: caller!.tenant_id,
        default_passing_mps: 60,
        allow_public_registration: true,
        max_module_upload_mb: Math.min(60, caps.max_module_upload_cap_mb),
        max_scan_image_mb: Math.min(15, caps.max_scan_image_cap_mb),
      },
      caps,
      canEdit: caller!.role === 'admin' || caller!.is_platform_admin === true,
    });
  } catch (error) {
    console.error('[admin/settings GET]', error);
    return NextResponse.json({ error: 'Could not load school settings.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { caller, response } = await getCaller();
    if (response) return response;
    if (!canEditSchoolSettings(caller!, caller!.tenant_id!)) {
      return NextResponse.json({ error: 'Only an approved school administrator can update these settings.' }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: platform, error: platformError } = await admin.from('platform_settings')
      .select('max_module_upload_cap_mb, max_scan_image_cap_mb').eq('id', 1).maybeSingle();
    if (platformError) return NextResponse.json({ error: 'Could not load platform upload limits.' }, { status: 503 });
    const caps = {
      module: platform?.max_module_upload_cap_mb ?? 60,
      scan: platform?.max_scan_image_cap_mb ?? 30,
    };
    const input = await request.json().catch(() => null);
    const validated = validateSchoolSettings(input, caps);
    if (validated.error || !validated.values) return NextResponse.json({ error: validated.error || 'Invalid settings.' }, { status: 400 });
    const result = await saveSchoolSettings(admin, caller!, validated.values);
    if (result.status < 300) clearUploadLimitsCache(caller!.tenant_id!);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[admin/settings PUT]', error);
    return NextResponse.json({ error: 'Could not save school settings.' }, { status: 500 });
  }
}
