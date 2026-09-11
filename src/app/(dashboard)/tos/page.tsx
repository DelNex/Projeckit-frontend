'use client';

import { TosEditor } from '@/components/assessment/TosEditor';
import { createClient } from '@/lib/supabase/client';
import { FileSpreadsheet, Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function TosStandalonePage() {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    async function loadAssessments() {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('assessments')
          .select(`
            id,
            title,
            term,
            school_year,
            target_items,
            status,
            subjects ( code, title ),
            sections ( name )
          `)
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          setAssessments(data);
          setSelectedAssessmentId(data[0].id);
        }
      } catch (e) {
        console.error('Failed to fetch assessments for TOS:', e);
      } finally {
        setLoading(false);
      }
    }
    loadAssessments();
  }, []);

  const activeAssessment = assessments.find((a) => a.id === selectedAssessmentId);

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Banner & Assessment Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-200" />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              Table of Specifications (TOS)
            </h1>
          </div>
          <p className="text-xs text-blue-100 max-w-xl">
            Design DepEd-standard competency allocation matrix with Hamilton Largest-Remainder item distribution and 6-level Bloom&apos;s Cognitive Taxonomy.
          </p>
        </div>

        {assessments.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-blue-100 whitespace-nowrap">Assessment:</span>
            <select
              value={selectedAssessmentId}
              onChange={(e) => setSelectedAssessmentId(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold outline-none focus:ring-2 focus:ring-white"
            >
              {assessments.map((a) => (
                <option key={a.id} value={a.id} className="text-gray-900">
                  {a.title} ({a.subjects?.code || 'GEN'} · {a.sections?.name || 'Class'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
          <span className="text-xs">Loading Table of Specifications workspace...</span>
        </div>
      ) : assessments.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl space-y-4">
          <FileSpreadsheet className="h-10 w-10 text-gray-400 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">No Assessments Found</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
              Create an assessment first to generate and manage its official Table of Specifications.
            </p>
          </div>
          <Link
            href="/assessments"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            <Plus className="h-4 w-4" />
            <span>Create Assessment</span>
          </Link>
        </div>
      ) : activeAssessment ? (
        <TosEditor
          key={activeAssessment.id}
          assessmentId={activeAssessment.id}
          initialSubject={activeAssessment.subjects?.title || activeAssessment.subjects?.code || ''}
          initialTerm={activeAssessment.term || ''}
          initialSchoolYear={activeAssessment.school_year || ''}
          initialSection={activeAssessment.sections?.name || ''}
          initialTargetItems={activeAssessment.target_items || 50}
          initialStatus={activeAssessment.status || 'DRAFT'}
        />
      ) : null}
    </div>
  );
}
