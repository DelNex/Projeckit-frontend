'use client';

export interface ClientUploadLimits {
  maxModuleUploadMb: number;
  maxScanImageMb: number;
}

const FALLBACK: ClientUploadLimits = { maxModuleUploadMb: 60, maxScanImageMb: 15 };
let cached: { expiresAt: number; limits: ClientUploadLimits } | undefined;

export function invalidateClientUploadLimits() {
  cached = undefined;
}

export async function getClientUploadLimits(): Promise<ClientUploadLimits> {
  if (cached && cached.expiresAt > Date.now()) return cached.limits;
  try {
    const response = await fetch('/api/settings/limits', { cache: 'no-store' });
    if (!response.ok) return FALLBACK;
    const result = await response.json();
    const limits = {
      maxModuleUploadMb: Number(result.maxModuleUploadMb),
      maxScanImageMb: Number(result.maxScanImageMb),
    };
    if (!Number.isFinite(limits.maxModuleUploadMb) || !Number.isFinite(limits.maxScanImageMb)) return FALLBACK;
    cached = { limits, expiresAt: Date.now() + 60_000 };
    return limits;
  } catch {
    return FALLBACK;
  }
}
