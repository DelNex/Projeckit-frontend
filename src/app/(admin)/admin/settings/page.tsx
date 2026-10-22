'use client';

import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { invalidateClientQueryCache } from '@/lib/supabase/client';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export default function AdminSettingsPage() {
  const { toast } = useToast();

  // General settings state
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaultPassingMps, setDefaultPassingMps] = useState(60.0);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(true);
  const [maxModuleUploadMb, setMaxModuleUploadMb] = useState(60);
  const [maxScanImageMb, setMaxScanImageMb] = useState(15);
  const [platformCaps, setPlatformCaps] = useState({ module: 60, scan: 30 });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [canEditSettings, setCanEditSettings] = useState(false);
  const [savedSettingsJson, setSavedSettingsJson] = useState('');

  const currentSettingsJson = JSON.stringify({ defaultPassingMps, allowPublicRegistration, maxModuleUploadMb, maxScanImageMb });
  const hasUnsavedSettings = Boolean(savedSettingsJson) && currentSettingsJson !== savedSettingsJson;

  // Deletion code state
  const [codeLoading, setCodeLoading] = useState(true);
  const [hasDeletionCode, setHasDeletionCode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [minutesRemaining, setMinutesRemaining] = useState<number | undefined>(undefined);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [deletionCodeTenantId, setDeletionCodeTenantId] = useState('');
  const [deletionCodeTenants, setDeletionCodeTenants] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  const [deletionCodeStatusError, setDeletionCodeStatusError] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState(false);

  // Deletion code form state
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [confirmNewCode, setConfirmNewCode] = useState('');
  const [codeSuccessMsg, setCodeSuccessMsg] = useState<string | null>(null);

  // Platform admin reset confirmation modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingCode, setResettingCode] = useState(false);

  const fetchDeletionCodeStatus = async (tenantId = deletionCodeTenantId) => {
    setCodeLoading(true);
    setDeletionCodeStatusError(null);
    try {
      const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
      const res = await fetch(`/api/admin/deletion-code${query}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to check deletion code status.');
      setHasDeletionCode(Boolean(data.hasCode));
      setIsLocked(Boolean(data.isLocked));
      setMinutesRemaining(data.minutesRemaining);
      setIsPlatformAdmin(Boolean(data.isPlatformAdmin));
      setDeletionCodeTenants(data.tenants || []);
      setDeletionCodeTenantId(data.tenantId || '');
      return data as { hasCode: boolean };
    } catch (err) {
      console.error('Failed to load deletion code status:', err);
      setHasDeletionCode(false);
      setDeletionCodeStatusError(err instanceof Error ? err.message : 'Failed to check deletion code status.');
      return null;
    } finally {
      setCodeLoading(false);
    }
  };

  const loadSchoolSettings = async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load school settings.');
      const settings = result.settings;
      setDefaultPassingMps(Number(settings.default_passing_mps));
      setAllowPublicRegistration(Boolean(settings.allow_public_registration));
      setMaxModuleUploadMb(Number(settings.max_module_upload_mb));
      setMaxScanImageMb(Number(settings.max_scan_image_mb));
      setPlatformCaps({
        module: Number(result.caps.max_module_upload_cap_mb),
        scan: Number(result.caps.max_scan_image_cap_mb),
      });
      setCanEditSettings(Boolean(result.canEdit));
      setSavedSettingsJson(JSON.stringify({
        defaultPassingMps: Number(settings.default_passing_mps),
        allowPublicRegistration: Boolean(settings.allow_public_registration),
        maxModuleUploadMb: Number(settings.max_module_upload_mb),
        maxScanImageMb: Number(settings.max_scan_image_mb),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load school settings.';
      setSettingsError(message);
    } finally {
      setSettingsLoading(false);
    }
  };

  useEffect(() => {
    void loadSchoolSettings();
    fetchDeletionCodeStatus();
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedSettings) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedSettings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          default_passing_mps: defaultPassingMps,
          allow_public_registration: allowPublicRegistration,
          max_module_upload_mb: maxModuleUploadMb,
          max_scan_image_mb: maxScanImageMb,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to save school settings.');
      invalidateClientQueryCache();
      await loadSchoolSettings();

      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      console.error('Failed to save admin settings:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDeletionCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || newCode.length < 8) {
      toast.error('New deletion code must be at least 8 characters long.');
      return;
    }

    if (newCode !== confirmNewCode) {
      toast.error('The new deletion codes do not match.');
      return;
    }

    if (hasDeletionCode && !currentCode) {
      toast.error('Please enter the current deletion code.');
      return;
    }

    setSavingCode(true);
    setCodeSuccessMsg(null);

    try {
      const res = await fetch('/api/admin/deletion-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentCode: currentCode || undefined,
          newCode,
          confirmNewCode,
          tenantId: isPlatformAdmin ? deletionCodeTenantId : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to save deletion code.');
        return;
      }

      const verifiedStatus = await fetchDeletionCodeStatus(deletionCodeTenantId);
      if (!verifiedStatus?.hasCode) {
        throw new Error('The server did not confirm that the deletion code is active for this school.');
      }
      toast.success(data.message || 'Deletion code updated successfully.');
      setCurrentCode('');
      setNewCode('');
      setConfirmNewCode('');
      setCodeSuccessMsg('Deletion code saved and verified for this school. It is never displayed afterward.');
    } catch (err: any) {
      toast.error(friendlyError(err, 'Failed to update deletion code.'));
    } finally {
      setSavingCode(false);
    }
  };

  const handleResetLostCode = async () => {
    setResettingCode(true);
    try {
      const res = await fetch('/api/admin/deletion-code/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId: deletionCodeTenantId || undefined }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to reset deletion code.');
        return;
      }

      toast.success('Deletion code has been reset. You can now configure a new code.');
      setResetModalOpen(false);
      setHasDeletionCode(false);
      await fetchDeletionCodeStatus(deletionCodeTenantId);
    } catch (err: any) {
      toast.error(friendlyError(err, 'Failed to reset deletion code.'));
    } finally {
      setResettingCode(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          System Configuration Settings
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Global application parameters, default passing score thresholds, and administrative security codes.
        </p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>System configuration updated and recorded in Supabase audit log!</span>
        </div>
      )}

      {settingsLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading school settings…
        </div>
      ) : settingsError ? (
        <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {settingsError} <button type="button" onClick={() => void loadSchoolSettings()} className="ml-2 underline">Try again</button>
        </div>
      ) : null}

      {/* General Settings Card */}
      <form onSubmit={handleSave} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span>Application Parameters</span>
        </h2>

        <fieldset disabled={settingsLoading || !canEditSettings} className="space-y-5 disabled:opacity-70">
        {!canEditSettings && !settingsLoading && <p className="text-xs text-amber-700 dark:text-amber-300">Only an approved school administrator can change these settings.</p>}
        {hasUnsavedSettings && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">You have unsaved changes.</p>}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Default Minimum Passing Score (MPS %)
          </label>
          <input
            type="number"
            step="0.5"
            min="40"
            max="100"
            value={defaultPassingMps}
            onChange={(e) => setDefaultPassingMps(Number(e.target.value))}
            className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
          />
          <span className="mt-1 block text-[11px] text-gray-400">
            Default benchmark assigned when creating new assessments (standard DepEd passing grade is 60%).
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Maximum module upload size (MB)
          </label>
          <input
            type="number"
            min="1"
            max={platformCaps.module}
            value={maxModuleUploadMb}
            onChange={(e) => setMaxModuleUploadMb(Number(e.target.value))}
            required
            className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
          />
          <span className="mt-1 block text-[11px] text-gray-400">
            Allowed range: 1–{platformCaps.module} MB. Platform cap: {platformCaps.module} MB. Larger files also depend on your Supabase plan and hosting limits.
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Maximum scan photo size (MB)</label>
          <input type="number" min="1" max={platformCaps.scan} value={maxScanImageMb} onChange={(e) => setMaxScanImageMb(Number(e.target.value))} required className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800" />
          <span className="mt-1 block text-[11px] text-gray-400">Allowed range: 1–{platformCaps.scan} MB. Platform cap: {platformCaps.scan} MB. Larger files also depend on your Supabase plan and hosting limits.</span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-gray-100 p-3.5 dark:border-gray-800">
          <div>
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              Allow Teacher Self-Registration
            </span>
            <p className="text-[11px] text-gray-400">
              Permit teachers to register via public form (accounts still require admin verification).
            </p>
          </div>
          <input
            type="checkbox"
            checked={allowPublicRegistration}
            onChange={(e) => setAllowPublicRegistration(e.target.checked)}
            className="h-4 w-4 rounded-sm border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading || settingsLoading || !canEditSettings || !hasUnsavedSettings}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Save System Settings</span>
          </button>
        </div>
        </fieldset>
      </form>

      {/* Security: Deletion Code Card */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-500" />
              <span>Permanent Deletion Code</span>
            </h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Required by administrators to permanently delete archived accounts and associated data.
            </p>
          </div>

          <div className="shrink-0">
            {codeLoading ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-medium text-gray-500 dark:bg-gray-800">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking...
              </span>
            ) : deletionCodeStatusError ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400">
                <ShieldAlert className="h-3.5 w-3.5" />
                Unable to Verify
              </span>
            ) : hasDeletionCode ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                Code Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <ShieldAlert className="h-3.5 w-3.5" />
                Not Configured
              </span>
            )}
          </div>
        </div>

        {isPlatformAdmin && deletionCodeTenants.length > 0 && (
          <div>
            <label htmlFor="deletion-code-tenant" className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              School this deletion code applies to
            </label>
            <select
              id="deletion-code-tenant"
              value={deletionCodeTenantId}
              disabled={codeLoading || savingCode || resettingCode}
              onChange={(event) => {
                const tenantId = event.target.value;
                setDeletionCodeTenantId(tenantId);
                setCodeSuccessMsg(null);
                setCurrentCode('');
                setNewCode('');
                setConfirmNewCode('');
                void fetchDeletionCodeStatus(tenantId);
              }}
              className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none focus:border-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-white"
            >
              {deletionCodeTenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.name}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              Deletion codes are stored separately for each school. Choose the school whose archived accounts you need to delete.
            </p>
          </div>
        )}

        {deletionCodeStatusError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
            Could not verify this school&apos;s deletion code: {deletionCodeStatusError}
          </div>
        )}

        {isLocked && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
            <Lock className="h-4 w-4 shrink-0 text-rose-500" />
            <span>
              Deletion action is temporarily locked due to 5 failed attempts. Please wait {minutesRemaining || 15} minutes before trying again.
            </span>
          </div>
        )}

        {codeSuccessMsg && (
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{codeSuccessMsg}</span>
          </div>
        )}

        {!hasDeletionCode && !codeLoading && !deletionCodeStatusError && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            Permanent account deletion is currently disabled. Configure a deletion code below to enable this feature.
          </div>
        )}

        <form onSubmit={handleSaveDeletionCode} className="space-y-4 pt-2">
          {hasDeletionCode && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Current Deletion Code
              </label>
              <input
                type="password"
                value={currentCode}
                onChange={(e) => setCurrentCode(e.target.value)}
                placeholder="Enter current code to authorize change"
                autoComplete="current-password"
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                {hasDeletionCode ? 'New Deletion Code' : 'Set Deletion Code'}
              </label>
              <input
                type="password"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Minimum 8 characters"
                minLength={8}
                required
                autoComplete="new-password"
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Confirm {hasDeletionCode ? 'New Code' : 'Code'}
              </label>
              <input
                type="password"
                value={confirmNewCode}
                onChange={(e) => setConfirmNewCode(e.target.value)}
                placeholder="Re-enter to confirm"
                minLength={8}
                required
                autoComplete="new-password"
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              {isPlatformAdmin && hasDeletionCode && (
                <button
                  type="button"
                  onClick={() => setResetModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset lost code (Platform Admin)</span>
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={savingCode || (hasDeletionCode && !currentCode) || !newCode || newCode.length < 8}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-black transition disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            >
              {savingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              <span>{hasDeletionCode ? 'Update Deletion Code' : 'Save Deletion Code'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Platform Admin Reset Code Modal */}
      <ConfirmationModal
        isOpen={resetModalOpen}
        title="Reset Deletion Code?"
        description="Are you sure you want to reset this school's deletion code? This action is restricted to platform administrators and will be logged in the audit trail. Permanent account deletions will be disabled until a new code is configured."
        confirmLabel={resettingCode ? 'Resetting...' : 'Yes, Reset Code'}
        cancelLabel="Cancel"
        actionType="delete"
        isLoading={resettingCode}
        onConfirm={handleResetLostCode}
        onClose={() => setResetModalOpen(false)}
      />
    </div>
  );
}
