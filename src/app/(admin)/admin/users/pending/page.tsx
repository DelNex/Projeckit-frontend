'use client';

import { createClient } from '@/lib/supabase/client';
import { Check, Loader2, RefreshCw, UserCheck, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PendingUserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  role: string;
  status: string;
  created_at: string;
}

export default function PendingUsersPage() {
  const [pendingUsers, setPendingUsers] = useState<PendingUserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const supabase = createClient();

  const fetchPendingUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, email, display_name, role, status, created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setPendingUsers(data || []);
    } catch (err: any) {
      console.error('Failed to load pending users:', err);
      setError(err?.message || 'Failed to load pending users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: 'approved' | 'rejected') => {
    setProcessingId(id);
    try {
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (updErr) throw updErr;

      setPendingUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err: any) {
      console.error(`Failed to ${newStatus} user:`, err);
      alert(`Action failed: ${err.message || err}`);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
          Pending Faculty Approvals
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Review and approve newly registered teacher accounts before granting access to student data.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={fetchPendingUsers}
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
            <span className="text-xs">Loading pending approvals from Supabase...</span>
          </div>
        ) : pendingUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <UserCheck className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No pending faculty approvals</p>
            <p className="text-xs text-gray-400 max-w-sm mt-1">
              All registered faculty members have been verified and approved.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs table-optimized min-w-[550px]">
              <thead className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
                <tr>
                  <th className="px-4 sm:px-6 py-4">Applicant Name</th>
                  <th className="px-4 sm:px-6 py-4">Email Address</th>
                  <th className="px-4 sm:px-6 py-4 text-center">Assigned Role</th>
                  <th className="px-4 sm:px-6 py-4">Registered Date</th>
                  <th className="px-4 sm:px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pendingUsers.map((u) => {
                  const isBusy = processingId === u.id;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 sm:px-6 py-4 font-semibold text-gray-900 dark:text-white">
                        {u.display_name || 'Faculty Member'}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-gray-500 dark:text-gray-400">
                        {u.email}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-center">
                        <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-mono text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 uppercase">
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-gray-400">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            disabled={isBusy}
                            onClick={() => handleUpdateStatus(u.id, 'approved')}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => handleUpdateStatus(u.id, 'rejected')}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30 disabled:opacity-50 transition"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
