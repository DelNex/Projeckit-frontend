'use client';

import { createClient } from '@/lib/supabase/client';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
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
  const supabase = createClient();

  // General settings state
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaultPassingMps, setDefaultPassingMps] = useState(60.0);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(true);

  // Deletion code state
  const [codeLoading, setCodeLoading] = useState(true);
  const [hasDeletionCode, setHasDeletionCode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [minutesRemaining, setMinutesRemaining] = useState<number | undefined>(undefined);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [savingCode, setSavingCode] = useState(false);

  // Deletion code form state
  const [currentCode, setCurrentCode] = useState('');
  const [newCode, setNewCode] = useState('');
  const [confirmNewCode, setConfirmNewCode] = useState('');
  const [codeSuccessMsg, setCodeSuccessMsg] = useState<string | null>(null);

  // Platform admin reset confirmation modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingCode, setResettingCode] = useState(false);

  const fetchDeletionCodeStatus = async () => {
    try {
      const res = await fetch('/api/admin/deletion-code');
      if (res.ok) {
        const data = await res.json();
        setHasDeletionCode(Boolean(data.hasCode));
        setIsLocked(Boolean(data.isLocked));
        setMinutesRemaining(data.minutesRemaining);
        setIsPlatformAdmin(Boolean(data.isPlatformAdmin));
      }
    } catch (err) {
      console.error('Failed to load deletion code status:', err);
    } finally {
      setCodeLoading(false);
    }
  };

  useEffect(() => {
    // Load persisted settings from localStorage or recent audit log
    try {
      const stored = localStorage.getItem('projectkit_admin_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.defaultPassingMps) setDefaultPassingMps(Number(parsed.defaultPassingMps));
        if (typeof parsed.allowPublicRegistration === 'boolean') setAllowPublicRegistration(parsed.allowPublicRegistration);
      }
    } catch {
      // Fallback to defaults
    }

    fetchDeletionCodeStatus();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      const settingsPayload = {
        defaultPassingMps,
        allowPublicRegistration,
        updatedAt: new Date().toISOString(),
      };

      // Record administrative audit trail in Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Your session has expired. Please sign in again before saving settings.');
        return;
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user?.id) {
        toast.error('Your session could not be verified. Please sign in again before saving settings.');
        return;
      }

      const { data: profile, error: profileError } = await (supabase as any)
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.tenant_id) {
        throw new Error('Your account is not linked to a school tenant.');
      }
      const tenantId = profile.tenant_id;

      const { error: auditError } = await (supabase as any).from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user.id,
        action: 'SYSTEM_SETTINGS_UPDATED',
        details: settingsPayload,
      });
      if (auditError) throw auditError;

      // Save locally only after the authenticated audit write succeeds.
      localStorage.setItem('projectkit_admin_settings', JSON.stringify(settingsPayload));

      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      console.error('Failed to log admin settings update:', err);
      toast.error('Failed to save settings.');
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
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to save deletion code.');
        return;
      }

      toast.success(data.message || 'Deletion code updated successfully.');
      setCodeSuccessMsg('Deletion code set successfully! It is never displayed afterward.');
      setCurrentCode('');
      setNewCode('');
      setConfirmNewCode('');
      setHasDeletionCode(true);
      fetchDeletionCodeStatus();
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
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'Failed to reset deletion code.');
        return;
      }

      toast.success('Deletion code has been reset. You can now configure a new code.');
      setResetModalOpen(false);
      setHasDeletionCode(false);
      fetchDeletionCodeStatus();
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

      {/* General Settings Card */}
      <form onSubmit={handleSave} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-5">
        <h2 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <span>Application Parameters</span>
        </h2>

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
            Maximum OMR &amp; Module Upload Size (MB)
          </label>
          <input
            type="number"
            min="60"
            max="60"
            value={60}
            readOnly
            className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
          />
          <span className="mt-1 block text-[11px] text-gray-400">
            Fixed at 60 MB per file by the upload services and storage bucket.
          </span>
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
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span>Save System Settings</span>
          </button>
        </div>
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

        {!hasDeletionCode && !codeLoading && (
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
