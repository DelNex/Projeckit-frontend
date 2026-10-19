export interface UploadLimits {
  maxModuleUploadMb: number;
  maxScanImageMb: number;
}

const DEFAULT_LIMITS: UploadLimits = { maxModuleUploadMb: 60, maxScanImageMb: 15 };
const cache = new Map<string, { expiresAt: number; limits: UploadLimits }>();
const CACHE_MS = 60_000;

export function clearUploadLimitsCache(tenantId?: string) {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

export function normalizeUploadLimits(
  settings: Record<string, unknown> | null | undefined,
  platform: Record<string, unknown> | null | undefined,
): UploadLimits {
  const moduleCap = Number(platform?.max_module_upload_cap_mb ?? DEFAULT_LIMITS.maxModuleUploadMb);
  const scanCap = Number(platform?.max_scan_image_cap_mb ?? 30);
  const validCap = (value: number, fallback: number) => Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
  const capModule = validCap(moduleCap, DEFAULT_LIMITS.maxModuleUploadMb);
  const capScan = validCap(scanCap, 30);
  const valueModule = Number(settings?.max_module_upload_mb ?? DEFAULT_LIMITS.maxModuleUploadMb);
  const valueScan = Number(settings?.max_scan_image_mb ?? DEFAULT_LIMITS.maxScanImageMb);
  return {
    maxModuleUploadMb: Math.max(1, Math.min(Number.isFinite(valueModule) ? Math.floor(valueModule) : DEFAULT_LIMITS.maxModuleUploadMb, capModule)),
    maxScanImageMb: Math.max(1, Math.min(Number.isFinite(valueScan) ? Math.floor(valueScan) : DEFAULT_LIMITS.maxScanImageMb, capScan)),
  };
}

export async function getUploadLimits(admin: any, tenantId: string, now = Date.now()): Promise<UploadLimits> {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > now) return cached.limits;
  const [{ data: settings, error: settingsError }, { data: platform, error: platformError }] = await Promise.all([
    admin.from('school_settings').select('max_module_upload_mb, max_scan_image_mb').eq('tenant_id', tenantId).maybeSingle(),
    admin.from('platform_settings').select('max_module_upload_cap_mb, max_scan_image_cap_mb').eq('id', 1).maybeSingle(),
  ]);
  if (settingsError || platformError) throw new Error('Could not load school upload limits.');
  const limits = normalizeUploadLimits(settings, platform);
  cache.set(tenantId, { expiresAt: now + CACHE_MS, limits });
  return limits;
}

export function formatUploadLimitError(sizeBytes: number, schoolLimitMb: number): string {
  const fileSizeMb = Math.ceil(sizeBytes / (1024 * 1024));
  return `This file is ${fileSizeMb} MB. The limit for your school is ${schoolLimitMb} MB.`;
}

export function isUploadWithinLimit(sizeBytes: number, limitMb: number): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes >= 0 && sizeBytes <= limitMb * 1024 * 1024;
}
