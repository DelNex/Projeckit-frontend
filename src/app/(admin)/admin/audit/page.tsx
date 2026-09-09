'use client';

import { createClient } from '@/lib/supabase/client';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

interface AuditLogRecord {
  id: string;
  action: string;
  ip: string | null;
  device: string | null;
  details: Record<string, any> | null;
  created_at: string;
  profiles?: { display_name: string | null; email: string | null } | null;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await (supabase as any)
        .from('audit_logs')
        .select(`
          id,
          action,
          ip,
          device,
          details,
          created_at,
          profiles ( display_name, email )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (err) throw err;
      setLogs(data || []);
    } catch (err: any) {
      console.error('Failed to fetch audit logs:', err);
      setError(err?.message || 'Failed to load audit logs from database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [supabase]);

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">
            System Audit Logs
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Immutable audit trail of authentication events, assessment modifications, and administrative actions.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-3xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs table-optimized">
            <thead className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
              <tr>
                <th className="px-6 py-4">Action Type</th>
                <th className="px-6 py-4">Actor</th>
                <th className="px-6 py-4">IP Address</th>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                      <span>Loading audit records from Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ShieldCheck className="h-8 w-8 text-emerald-500/80" />
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        Audit Log is Clean
                      </p>
                      <p className="text-[11px] text-gray-400 max-w-sm">
                        No security alerts or audit events recorded yet. Authentication, tenant changes, and user sign-offs will be tracked here in real-time.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-gray-900 dark:text-white">
                      {log.action}
                    </td>
                    <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                      {log.profiles?.email || log.profiles?.display_name || 'System / Service'}
                    </td>
                    <td className="px-6 py-4 font-mono text-gray-400">
                      {log.ip || '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-400">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-[10px] text-gray-400">
                      {log.details ? JSON.stringify(log.details) : 'SUCCESS'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
