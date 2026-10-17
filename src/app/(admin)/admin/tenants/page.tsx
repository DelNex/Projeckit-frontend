'use client';

import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { Building2, Edit2, Loader2, Plus, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface TenantRecord {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export default function TenantsPage() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Provision Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantCode, setTenantCode] = useState('');

  // Edit Modal State
  const [editingTenant, setEditingTenant] = useState<TenantRecord | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const supabase = createClient();

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_platform_admin')
          .eq('id', user.id)
          .maybeSingle();
        setIsPlatformAdmin(!!profile?.is_platform_admin);
      }

      const { data, error: err } = await supabase
        .from('tenants')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setTenants(data || []);
    } catch (err: any) {
      console.error('Failed to load tenants:', err);
      setError(friendlyError(err, 'Failed to load school tenants.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantName.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tenantName.trim(),
          code: tenantCode.trim() || undefined,
        }),
      });

      const resData = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403) {
          toast.error('Only the platform administrator can add schools.');
        } else {
          toast.error(resData.error || 'Could not create school tenant.');
        }
        return;
      }

      setIsModalOpen(false);
      setTenantName('');
      setTenantCode('');
      toast.success('School tenant provisioned successfully.');
      await fetchTenants();
    } catch (err: any) {
      console.error('Failed to create tenant:', err);
      toast.error(friendlyError(err, 'Could not create school tenant.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartEdit = (t: TenantRecord) => {
    setEditingTenant(t);
    setEditName(t.name);
    setEditCode(t.code || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTenant || !editName.trim()) return;

    setSavingEdit(true);
    try {
      const { error: updErr } = await supabase
        .from('tenants')
        .update({
          name: editName.trim(),
          code: editCode.trim() || null,
        })
        .eq('id', editingTenant.id);

      if (updErr) throw updErr;

      toast.success('School tenant updated successfully.');
      setEditingTenant(null);
      await fetchTenants();
    } catch (err: any) {
      console.error('Failed to update tenant:', err);
      toast.error(friendlyError(err, 'Could not update school tenant.'));
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            School Tenants
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Multi-school institutional partitions isolated via Row Level Security (RLS).
          </p>
        </div>

        {isPlatformAdmin && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Provision Tenant</span>
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={fetchTenants}
            className="inline-flex items-center gap-1 font-bold underline hover:text-red-900"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden paint-isolate min-w-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs">Loading school tenants from Supabase...</span>
          </div>
        ) : tenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Building2 className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No tenants found</p>
            <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
              {isPlatformAdmin 
                ? 'Provision your school tenant to partition user accounts and academic data.'
                : 'No school tenant is currently associated with your account.'}
            </p>
            {isPlatformAdmin && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                <span>Provision First Tenant</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs table-optimized min-w-[500px]">
              <thead className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
                <tr>
                  <th className="px-4 sm:px-6 py-4">School Organization</th>
                  <th className="px-4 sm:px-6 py-4">Tenant Code</th>
                  <th className="px-4 sm:px-6 py-4 text-center">Status</th>
                  <th className="px-4 sm:px-6 py-4 text-right">Provisioned</th>
                  <th className="px-4 sm:px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 sm:px-6 py-4 font-bold text-gray-900 dark:text-white">
                      {t.name}
                    </td>
                    <td className="px-4 sm:px-6 py-4 font-mono text-gray-600 dark:text-gray-300">
                      {t.code || '—'}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        {t.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right text-gray-400 text-[11px]">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <button
                        onClick={() => handleStartEdit(t)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provision Tenant Modal (Platform Admin Only) */}
      {isModalOpen && isPlatformAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Provision School Tenant
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  School Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rizal High School"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  School / DepEd Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. CSHS-001"
                  value={tenantCode}
                  onChange={(e) => setTenantCode(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{submitting ? 'Provisioning...' : 'Provision Tenant'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit School Tenant Modal (Platform Admin or School Admin of that Tenant) */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Edit School Details
              </h3>
              <button
                onClick={() => setEditingTenant(null)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  School Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rizal High School"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  School / DepEd Code
                </label>
                <input
                  type="text"
                  placeholder="e.g. CSHS-001"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{savingEdit ? 'Saving...' : 'Save Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
