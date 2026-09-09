'use client';

import { createClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

type TabKey = 'overview' | 'item-analysis' | 'reports';

function AnalyticsContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const urlTab = searchParams?.get('tab') as TabKey | null;

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);

  // Assessments for selection
  const [assessmentsList, setAssessmentsList] = useState<{ id: string; title: string; target_items: number }[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');

  // Overview Data — start at 0, computed from real data
  const [overallMps, setOverallMps] = useState<number>(0);
  const [averageScore, setAverageScore] = useState<number>(0);
  const [totalStudents, setTotalStudents] = useState<number>(0);

  // Sync tab from URL
  useEffect(() => {
    if (urlTab === 'item-analysis' || urlTab === 'reports') {
      setActiveTab(urlTab);
    }
  }, [urlTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch assessments
      const { data: aList } = await (supabase as any)
        .from('assessments')
        .select('id, title, target_items, school_year, term');

      setAssessmentsList(aList || []);

      // Fetch student count
      const { count: studentCount } = await (supabase as any)
        .from('students')
        .select('*', { count: 'exact', head: true });

      setTotalStudents(studentCount || 0);
    } catch (err: any) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin mr-4" />Loading analytics data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab navigation */}
      <nav className="border-b border-gray-200 pb-4 dark:border-gray-800">
        <button
          className={`px-4 py-2 rounded-md font-medium ${
            activeTab === 'overview' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900'
          }`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`px-4 py-2 rounded-md font-medium ${
            activeTab === 'item-analysis' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900'
          }`}
          onClick={() => setActiveTab('item-analysis')}
        >
          Item Analysis
        </button>
        <button
          className={`px-4 py-2 rounded-md font-medium ${
            activeTab === 'reports' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900'
          }`}
          onClick={() => setActiveTab('reports')}
        >
          Reports
        </button>
      </nav>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="font-semibold text-gray-900 dark:text-white">Overall Performance</h3>
            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{overallMps.toFixed(1)} MPS</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Mean Performance Score</p>
          </div>
          <div className="rounded-xl border p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="font-semibold text-gray-900 dark:text-white">Average Score</h3>
            <p className="text-3xl font-bold text-green-600 dark:text-green-400">{averageScore.toFixed(1)}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Class average</p>
          </div>
          <div className="rounded-xl border p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="font-semibold text-gray-900 dark:text-white">Total Students</h3>
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{totalStudents}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Number of students</p>
          </div>
        </div>
      )}

      {/* Item Analysis Tab */}
      {activeTab === 'item-analysis' && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Item Analysis</h2>
          {assessmentsList.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No assessments found. Create an assessment first.</p>
          ) : (
            <div className="space-y-2">
              {assessmentsList.map((assessment) => (
                <div
                  key={assessment.id}
                  className={`p-3 rounded border cursor-pointer transition-colors ${
                    selectedAssessmentId === assessment.id
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900'
                  }`}
                  onClick={() => setSelectedAssessmentId(assessment.id)}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {assessment.title}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {assessment.target_items} items
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {selectedAssessmentId && (
            <p className="mt-4 text-xs text-gray-400">
              Item analysis computation will use scanned OMR response data for the selected assessment.
            </p>
          )}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Consolidated Reports</h2>
          <p className="text-gray-500 dark:text-gray-400">
            Quarterly consolidated reports will be generated from scanned OMR response data.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="h-96 flex items-center justify-center">Loading analytics...</div>}>
      <AnalyticsContent />
    </Suspense>
  );
}