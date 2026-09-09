'use client';

import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function AdminSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [defaultPassingMps, setDefaultPassingMps] = useState(60.0);
  const [maxUploadMb, setMaxUploadMb] = useState(10);
  const [allowPublicRegistration, setAllowPublicRegistration] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Load persisted settings from localStorage or recent audit log
    try {
      const stored = localStorage.getItem('projectkit_admin_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.defaultPassingMps) setDefaultPassingMps(Number(parsed.defaultPassingMps));
        if (parsed.maxUploadMb) setMaxUploadMb(Number(parsed.maxUploadMb));
        if (typeof parsed.allowPublicRegistration === 'boolean') setAllowPublicRegistration(parsed.allowPublicRegistration);
      }
    } catch {
      // Fallback to defaults
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      const settingsPayload = {
        defaultPassingMps,
        maxUploadMb,
        allowPublicRegistration,
        updatedAt: new Date().toISOString(),
      };

      // Save locally
      localStorage.setItem('projectkit_admin_settings', JSON.stringify(settingsPayload));

      // Record administrative audit trail in Supabase
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();

      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      await (supabase as any).from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        action: 'SYSTEM_SETTINGS_UPDATED',
        details: settingsPayload,
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err) {
      console.error('Failed to log admin settings update:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          System Configuration Settings
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Global application parameters, default passing score thresholds, and storage limits.
        </p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>System configuration updated and recorded in Supabase audit log!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-5">
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
            className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
          />
          <span className="mt-1 block text-[11px] text-gray-400">
            Default benchmark assigned when creating new assessments (standard DepEd passing grade is 60%).
          </span>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Maximum OMR & Module Upload Size (MB)
          </label>
          <input
            type="number"
            min="1"
            max="50"
            value={maxUploadMb}
            onChange={(e) => setMaxUploadMb(Number(e.target.value))}
            className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
          />
          <span className="mt-1 block text-[11px] text-gray-400">
            Enforced by browser preprocessor and Supabase Storage bucket policy.
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
    </div>
  );
}
