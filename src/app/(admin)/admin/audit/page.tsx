'use client';

import { ColumnDef, DataTable } from '@/components/ui/data-table';
import { createClient } from '@/lib/supabase/client';
import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

interface SystemLogRecord {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  action: string;
  device: string | null;
  details: Record<string, any> | null;
  created_at: string;
}

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
  const [systemLogs, setSystemLogs] = useState<SystemLogRecord[]>([]);
  const [systemLogsLoading, setSystemLogsLoading] = useState(true);
  const [systemLogsError, setSystemLogsError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const fetchLogs = async () => {
    setLoading(true);
    setSystemLogsLoading(true);
    setError(null);
    setSystemLogsError(null);

    try {
      const { data, error: auditError } = await (supabase as any)
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
        .limit(100);
      if (auditError) throw auditError;
      setLogs(data || []);
    } catch (cause: any) {
      console.error('Failed to fetch audit logs:', cause);
      setError(cause?.message || 'Failed to load audit logs from database');
    } finally {
      setLoading(false);
    }

    try {
      const response = await fetch('/api/admin/system-logs?limit=100', { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to load system events.');
      setSystemLogs(Array.isArray(result.events) ? result.events : []);
    } catch (cause) {
      setSystemLogsError(cause instanceof Error ? cause.message : 'Failed to load system events.');
    } finally {
      setSystemLogsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

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

  const columns = useMemo<ColumnDef<AuditLogRecord>[]>(
    () => [
      {
        accessorKey: 'action',
        header: 'Action Type',
        cell: ({ row }) => (
          <span className="font-mono font-bold text-gray-900 dark:text-white">
            {row.getValue('action')}
          </span>
        ),
      },
      {
        id: 'actor',
        header: 'Actor',
        cell: ({ row }) => {
          const log = row.original;
          return (
            <span className="text-gray-700 dark:text-gray-300">
              {log.profiles?.email || log.profiles?.display_name || 'System / Service'}
            </span>
          );
        },
      },
      {
        accessorKey: 'ip',
        header: 'IP Address',
        cell: ({ row }) => (
          <span className="font-mono text-gray-400">
            {row.getValue('ip') || '—'}
          </span>
        ),
      },
      {
        accessorKey: 'created_at',
        header: 'Timestamp',
        cell: ({ row }) => (
          <span className="text-gray-500 dark:text-gray-400">
            {formatDate(row.getValue('created_at'))}
          </span>
        ),
      },
      {
        accessorKey: 'details',
        header: 'Details',
        cell: ({ row }) => {
          const det = row.getValue('details');
          return (
            <div className="max-w-xs truncate font-mono text-[10px] text-gray-400" title={det ? JSON.stringify(det) : 'SUCCESS'}>
              {det ? JSON.stringify(det) : 'SUCCESS'}
            </div>
          );
        },
      },
    ],
    []
  );

  const systemColumns = useMemo<ColumnDef<SystemLogRecord>[]>(
    () => [
      {
        accessorKey: 'action',
        header: 'Event',
        cell: ({ row }) => (
          <span className="font-mono font-bold text-gray-900 dark:text-white">
            {row.original.details?.severity?.toUpperCase() || row.original.action}
          </span>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        cell: ({ row }) => (
          <span className="text-gray-700 dark:text-gray-300">
            {row.original.details?.source || 'Application'}
          </span>
        ),
      },
      {
        id: 'message',
        header: 'Failure / Details',
        cell: ({ row }) => {
          const details = row.original.details || {};
          return (
            <div className="max-w-xl truncate text-xs text-gray-600 dark:text-gray-300" title={details.message || ''}>
              {details.message || 'No message recorded'}
              {details.route ? <span className="ml-2 font-mono text-[10px] text-gray-400">{details.method || 'GET'} {details.route}</span> : null}
            </div>
          );
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Timestamp',
        cell: ({ row }) => (
          <span className="text-gray-500 dark:text-gray-400">{formatDate(row.getValue('created_at'))}</span>
        ),
      },
    ],
    []
  );

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
          disabled={loading || systemLogsLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 transition"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading || systemLogsLoading ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">System failures & service events</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Unhandled server errors and operational events captured by the application. Secrets and request payloads are not stored.</p>
        </div>
        {systemLogsError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
            {systemLogsError}
          </div>
        )}
        <DataTable
          tableLabel="System failures and service events"
          columns={systemColumns}
          data={systemLogs}
          searchKey="action"
          searchPlaceholder="Search system events..."
          loading={systemLogsLoading}
          emptyTitle="No system failures recorded"
          emptyDescription="Unhandled server errors and recorded service events will appear here."
        />
      </section>

      {/* User and administrative audit trail */}
      <DataTable
        tableLabel="Audit activity"
        columns={columns}
        data={logs}
        searchKey="action"
        searchPlaceholder="Search audit action..."
        loading={loading}
        emptyTitle="Audit Log is Clean"
        emptyDescription="No security alerts or audit events recorded yet. Authentication, tenant changes, and user sign-offs will be tracked here in real-time."
      />
    </div>
  );
}
