'use client';

import { createClient } from '@/lib/supabase/client';
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Calendar,
  ChevronRight,
  GraduationCap,
  Loader2,
  Plus,
  RefreshCw,
  TrendingUp,
  Users
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface AssessmentItem {
  id: string;
  title: string;
  subjectTitle: string;
  subjectCode: string;
  sectionName: string;
  targetItems: number;
  passingMps: number;
  status: string;
  createdAt: string;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalAssessments: 0,
    activeLearners: 0,
    meanMps: 0,
    pendingVerifications: 0,
  });
  const [recentAssessments, setRecentAssessments] = useState<AssessmentItem[]>([]);
  const supabase = createClient();

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch assessments
      const { data: assessmentsData, error: assessErr } = await supabase
        .from('assessments')
        .select(`
          id,
          title,
          target_items,
          passing_mps,
          status,
          created_at,
          subjects ( code, title ),
          sections ( name )
        `)
        .order('created_at', { ascending: false });

      if (assessErr) throw assessErr;

      // 2. Fetch total students
      const { count: studentCount, error: studentErr } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      if (studentErr) throw studentErr;

      // 3. Fetch pending OMR verifications
      const { count: pendingCount, error: pendingErr } = await supabase
        .from('scan_results')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'VERIFICATION_REQUIRED');

      // (scan_results count might be null if 0, treat gracefully)
      const pendingVerifications = pendingCount || 0;

      // Format assessments
      const formattedAssessments: AssessmentItem[] = (assessmentsData || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        subjectTitle: a.subjects?.title || 'General Subject',
        subjectCode: a.subjects?.code || 'GEN',
        sectionName: a.sections?.name || 'All Sections',
        targetItems: a.target_items || 50,
        passingMps: a.passing_mps || 60,
        status: a.status || 'DRAFT',
        createdAt: a.created_at,
      }));

      // Calculate mean passing benchmark
      const totalPassingMps = formattedAssessments.reduce((acc, curr) => acc + curr.passingMps, 0);
      const calculatedMps = formattedAssessments.length > 0 
        ? Math.round((totalPassingMps / formattedAssessments.length) * 10) / 10 
        : 75.0;

      setStats({
        totalAssessments: formattedAssessments.length,
        activeLearners: studentCount || 0,
        meanMps: calculatedMps,
        pendingVerifications,
      });

      setRecentAssessments(formattedAssessments.slice(0, 5));
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err?.message || 'Failed to connect to database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const statCards = [
    {
      title: 'Total Assessments',
      value: loading ? '...' : stats.totalAssessments.toString(),
      subtext: `${stats.totalAssessments} configured tests`,
      icon: BookOpen,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400',
    },
    {
      title: 'Enrolled Learners',
      value: loading ? '...' : stats.activeLearners.toString(),
      subtext: 'DepEd Senior High roster',
      icon: Users,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    {
      title: 'Target Benchmark MPS',
      value: loading ? '...' : `${stats.meanMps}%`,
      subtext: 'Passing threshold',
      icon: TrendingUp,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/30 dark:text-purple-400',
    },
    {
      title: 'Pending Verifications',
      value: loading ? '...' : stats.pendingVerifications.toString(),
      subtext: stats.pendingVerifications > 0 ? 'Requires attention' : 'All clear',
      icon: AlertCircle,
      color: stats.pendingVerifications > 0 
        ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400'
        : 'text-gray-600 bg-gray-50 dark:bg-gray-800 dark:text-gray-400',
    },
  ];

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 sm:p-8 text-white shadow-lg paint-isolate">
        <div className="relative z-10 max-w-2xl space-y-2 sm:space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-xs">
            <Calendar className="h-3.5 w-3.5" />
            <span>Academic SY 2025–2026 • Live Supabase Environment</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black tracking-tight leading-tight">
            Academic Assessment Operations
          </h1>
          <p className="text-xs sm:text-sm text-blue-100 leading-relaxed">
            Monitor curriculum performance, Table of Specifications alignment, and dynamic OMR optical analysis for Capas Senior High School.
          </p>
          <div className="pt-2 flex flex-wrap gap-2.5 sm:gap-3">
            <Link
              href="/assessments"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-blue-600 shadow-sm transition hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" />
              <span>Create Assessment</span>
            </Link>
            <Link
              href="/students"
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur-xs transition hover:bg-white/20"
            >
              <Users className="h-4 w-4" />
              <span>Manage Learners</span>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={loadDashboardData}
            className="inline-flex items-center gap-1 font-bold underline hover:text-red-900"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className="flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xs dark:border-gray-800 dark:bg-gray-900 paint-isolate"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {card.title}
                </span>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${card.color}`}>
                  <Icon className="h-4 w-4 sm:h-5 sm:s-5" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                  {card.value}
                </span>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  {card.subtext}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Assessments Section */}
      <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-2xs dark:border-gray-800 dark:bg-gray-900 paint-isolate min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
              Active Assessments
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Synchronized directly with the authoritative PostgreSQL database
            </p>
          </div>
          <Link
            href="/assessments"
            className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <span>View All</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs">Loading assessments from Supabase...</span>
          </div>
        ) : recentAssessments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No assessments created yet</p>
            <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
              Get started by creating an assessment with customizable question counts and dynamic OMR answer sheets.
            </p>
            <Link
              href="/assessments"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Assessment</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-left text-xs table-optimized min-w-[550px]">
              <thead className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
                <tr>
                  <th className="px-4 sm:px-6 py-3.5">Assessment Title</th>
                  <th className="px-4 sm:px-6 py-3.5">Subject &amp; Section</th>
                  <th className="px-4 sm:px-6 py-3.5 text-center">Items</th>
                  <th className="px-4 sm:px-6 py-3.5 text-center">Passing MPS</th>
                  <th className="px-4 sm:px-6 py-3.5 text-center">Status</th>
                  <th className="px-4 sm:px-6 py-3.5 text-right">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recentAssessments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 sm:px-6 py-4 font-bold text-gray-900 dark:text-white max-w-xs truncate">
                      {a.title}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 dark:text-gray-300">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">{a.subjectCode}</span> • {a.sectionName}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center font-semibold text-gray-700 dark:text-gray-300">
                      {a.targetItems} items
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center font-semibold text-blue-600 dark:text-blue-400">
                      {a.passingMps}%
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <Link
                        href={`/assessments/${a.id}`}
                        className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        <span>Open</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
