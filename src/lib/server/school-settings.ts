export interface SchoolSettingsValues {
  default_passing_mps: number;
  allow_public_registration: boolean;
  max_module_upload_mb: number;
  max_scan_image_mb: number;
}

export interface SettingsCaller {
  id: string;
  tenant_id: string | null;
  role: string;
  status: string;
  is_platform_admin?: boolean;
  archived_at?: string | null;
}

export function validateSchoolSettings(
  value: unknown,
  caps: { module: number; scan: number },
): { values?: SchoolSettingsValues; error?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Settings must be an object.' };
  const input = value as Record<string, unknown>;
  const mps = input.default_passing_mps;
  const registration = input.allow_public_registration;
  const moduleMb = input.max_module_upload_mb;
  const scanMb = input.max_scan_image_mb;
  if (typeof mps !== 'number' || !Number.isFinite(mps) || mps < 40 || mps > 100) {
    return { error: 'Default passing score must be between 40 and 100.' };
  }
  if (typeof registration !== 'boolean') return { error: 'Public registration must be true or false.' };
  if (!Number.isInteger(moduleMb) || Number(moduleMb) < 1 || Number(moduleMb) > caps.module) {
    return { error: `Module upload size must be a whole number from 1 to ${caps.module} MB.` };
  }
  if (!Number.isInteger(scanMb) || Number(scanMb) < 1 || Number(scanMb) > caps.scan) {
    return { error: `Scan photo size must be a whole number from 1 to ${caps.scan} MB.` };
  }
  return {
    values: {
      default_passing_mps: mps,
      allow_public_registration: registration,
      max_module_upload_mb: Number(moduleMb),
      max_scan_image_mb: Number(scanMb),
    },
  };
}

export function canEditSchoolSettings(caller: SettingsCaller, tenantId: string): boolean {
  return caller.status === 'approved'
    && !caller.archived_at
    && (caller.is_platform_admin === true
      || (caller.role === 'admin' && caller.tenant_id === tenantId));
}

export function isPublicRegistrationAllowed(setting: unknown): boolean {
  return setting !== false;
}

/** All writes are scoped to the authenticated profile tenant, never a request-supplied ID. */
export async function saveSchoolSettings(
  admin: any,
  caller: SettingsCaller,
  values: SchoolSettingsValues,
): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!caller.tenant_id) return { status: 400, body: { error: 'Your account is not linked to a school.' } };
  if (!canEditSchoolSettings(caller, caller.tenant_id)) {
    return { status: 403, body: { error: 'Only an approved school administrator can update these settings.' } };
  }

  const tenantId = caller.tenant_id;
  const { data: oldValues, error: readError } = await admin
    .from('school_settings').select('*').eq('tenant_id', tenantId).maybeSingle();
  if (readError) return { status: 500, body: { error: 'Could not load the current school settings.' } };

  const updatedAt = new Date().toISOString();
  const { data: saved, error: saveError } = await admin
    .from('school_settings')
    .upsert({ ...values, tenant_id: tenantId, updated_by: caller.id, updated_at: updatedAt }, { onConflict: 'tenant_id' })
    .select('*')
    .single();
  if (saveError || !saved) return { status: 500, body: { error: 'Could not save the school settings.' } };

  const { error: auditError } = await admin.from('audit_logs').insert({
    tenant_id: tenantId,
    user_id: caller.id,
    action: 'SCHOOL_SETTINGS_UPDATED',
    details: { old: oldValues, new: saved },
  });
  if (auditError) return { status: 500, body: { error: 'Settings were saved, but the audit record could not be written.' } };

  return { status: 200, body: { settings: saved } };
}
