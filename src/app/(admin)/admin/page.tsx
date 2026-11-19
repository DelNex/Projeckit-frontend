'use client';

import { createClient } from '@/lib/supabase/client';
import { Building2, FileText, Loader2, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface AdminStats {
  pendingTeachers: number;
  activeTenants: number;
  auditLogsCount: number;
  primaryTenantName: string;
}

interface AiOpsSummary {
  providersConfigured: string[];
  queue: {
    queued: number;
    running: number;
    needsAttention: number;
    failedLast24Hours: number;
    expiredLeases: number;
    oldestQueuedAgeSeconds: number | null;
  };
  checkedAt: string;
}

export default function AdminConsolePage() {
  const [stats, setStats] = useState<AdminStats>({
    pendingTeachers: 0,
    activeTenants: 0,
    auditLogsCount: 0,
    primaryTenantName: '',
  });
  const [loading, setLoading] = useState(true);
  const [aiOps, setAiOps] = useState<AiOpsSummary | null>(null);
  const [aiOpsError, setAiOpsError] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    async function loadAdminStats() {
      setLoading(true);
      try {
        // 1. Fetch count of pending teacher accounts
        const { count: pendingCount } = await (supabase as any)
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');

        // 2. Fetch active school tenants and get the primary tenant name
        const { data: tenantsData, count: tenantsCount } = await (supabase as any)
          .from('tenants')
          .select('name, is_active', { count: 'exact' })
          .eq('is_active', true)
          .limit(1);

        // 3. Fetch count of audit log records
        const { count: logsCount } = await (supabase as any)
          .from('audit_logs')
          .select('*', { count: 'exact', head: true });

        const firstTenant = tenantsData?.[0]?.name || 'School';
        const aiOpsResponse = await fetch('/api/admin/ai-health', { cache: 'no-store' });
        if (aiOpsResponse.ok) {
          setAiOps(await aiOpsResponse.json() as AiOpsSummary);
          setAiOpsError(false);
        } else {
          setAiOpsError(true);
        }

        setStats({
          pendingTeachers: pendingCount || 0,
          activeTenants: tenantsCount || 0,
          auditLogsCount: logsCount || 0,
          primaryTenantName: firstTenant,
        });
      } catch (err) {
        console.error('Failed to load admin stats:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAdminStats();
  }, [supabase]);

  const adminCards = [
    {
      title: 'Pending Faculty Approvals',
      value: loading ? '...' : stats.pendingTeachers.toString(),
      change: stats.pendingTeachers === 1 ? '1 teacher awaiting sign-off' : `${stats.pendingTeachers} teachers awaiting sign-off`,
      icon: UserCheck,
      href: '/admin/users/pending',
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',
    },
    {
      title: 'Active School Tenants',
      value: loading ? '...' : stats.activeTenants.toString(),
      change: stats.primaryTenantName,
      icon: Building2,
      href: '/admin/tenants',
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400',
    },
    {
      title: 'System Audit Logs',
      value: loading ? '...' : stats.auditLogsCount.toString(),
      change: stats.auditLogsCount > 0 ? `${stats.auditLogsCount} security events logged` : 'No security events logged yet',
      icon: FileText,
      href: '/admin/audit',
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          System Administrator Console
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Manage teacher accounts, tenant configurations, multi-school isolation, and institutional audit trails.
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span>Synchronizing live metrics with Supabase database...</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {adminCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              className="flex flex-col justify-between rounded-3xl border border-gray-200 bg-white p-6 shadow-xs transition hover:border-blue-300 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-900/60"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {card.title}
                </span>
                <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-3xl font-black text-gray-900 dark:text-white">
                  {card.value}
                </span>
                <p className="mt-1 text-xs text-gray-400">
                  {card.change}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <section className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-black text-gray-900 dark:text-white">AI generation operations</h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Queue and provider configuration diagnostics. Provider keys are never exposed.</p>
          </div>
          <span className="text-[10px] text-gray-400">
            {aiOps ? 'Checked ' + new Date(aiOps.checkedAt).toLocaleTimeString() : 'Diagnostics unavailable'}
          </span>
        </div>
        {aiOps ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              {(aiOps.providersConfigured || []).map((provider) => (
                <span key={provider} className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-bold uppercase text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
                  {provider} configured
                </span>
              ))}
              {!aiOps.providersConfigured.length && <span className="text-[11px] text-amber-700 dark:text-amber-300">No AI provider is configured.</span>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ['Queued', aiOps.queue.queued],
                ['Running', aiOps.queue.running],
                ['Needs attention', aiOps.queue.needsAttention],
                ['Failed · 24h', aiOps.queue.failedLast24Hours],
                ['Expired leases', aiOps.queue.expiredLeases],
                ['Oldest queued', aiOps.queue.oldestQueuedAgeSeconds === null ? '—' : Math.floor(aiOps.queue.oldestQueuedAgeSeconds / 60) + 'm'],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
                  <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">{label}</p>
                  <p className="mt-1 text-xl font-black tabular-nums text-gray-900 dark:text-white">{value}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            {aiOpsError ? 'The admin diagnostics endpoint could not be reached. Check the server and database connection.' : 'Loading AI queue diagnostics…'}
          </p>
        )}
      </section>
    </div>
  );
}
