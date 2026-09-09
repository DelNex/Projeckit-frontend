'use client';

import { createClient } from '@/lib/supabase/client';
import {
  ArrowUpRight,
  BookOpen,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface AssessmentRecord {
  id: string;
  title: string;
  subject_id: string;
  section_id: string;
  term: string;
  school_year: string;
  target_items: number;
  class_size: number;
  passing_mps: number;
  status: string;
  created_at: string;
  subjects?: { id: string; code: string; title: string } | null;
  sections?: { id: string; name: string; grade: string } | null;
}

interface OptionItem {
  id: string;
  name: string;
}

export default function AssessmentsPage() {
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subjectsList, setSubjectsList] = useState<OptionItem[]>([]);
  const [sectionsList, setSectionsList] = useState<OptionItem[]>([]);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newSubjectId, setNewSubjectId] = useState('');
  const [newSectionId, setNewSectionId] = useState('');
  const [newTargetItems, setNewTargetItems] = useState(50);
  const [newClassSize, setNewClassSize] = useState(50);
  const [newTerm, setNewTerm] = useState('1st Quarter');
  const [newSchoolYear, setNewSchoolYear] = useState('2025-2026');
  const [newPassingMps, setNewPassingMps] = useState(60.0);

  const supabase = createClient();

  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('assessments')
        .select(`
          id,
          title,
          subject_id,
          section_id,
          term,
          school_year,
          target_items,
          class_size,
          passing_mps,
          status,
          created_at,
          subjects ( id, code, title ),
          sections ( id, name, grade )
        `)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setAssessments((data as unknown as AssessmentRecord[]) || []);
    } catch (err: any) {
      console.error('Failed to fetch assessments:', err);
      setError(err?.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdownOptions = async () => {
    try {
      const [subjRes, secRes] = await Promise.all([
        supabase.from('subjects').select('id, code, title'),
        supabase.from('sections').select('id, name, grade'),
      ]);

      if (subjRes.data) {
        setSubjectsList(subjRes.data.map((s) => ({ id: s.id, name: `${s.code} – ${s.title}` })));
        if (subjRes.data.length > 0 && !newSubjectId) {
          setNewSubjectId(subjRes.data[0].id);
        }
      }
      if (secRes.data) {
        setSectionsList(secRes.data.map((s) => ({ id: s.id, name: s.name })));
        if (secRes.data.length > 0 && !newSectionId) {
          setNewSectionId(secRes.data[0].id);
        }
      }
    } catch (e) {
      console.warn('Could not load dropdown options:', e);
    }
  };

  useEffect(() => {
    fetchAssessments();
    fetchDropdownOptions();
  }, []);

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newSubjectId || !newSectionId) return;

    setSubmitting(true);
    try {
      // Get current user and tenant
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();

      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      // Get academic config
      const { data: config } = await supabase
        .from('academic_configs')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();

      const configId = config?.id || 'c0000000-0000-0000-0000-000000000001';

      const { data: createdAssessment, error: createErr } = await supabase
        .from('assessments')
        .insert({
          tenant_id: tenantId,
          config_id: configId,
          title: newTitle.trim(),
          subject_id: newSubjectId,
          section_id: newSectionId,
          term: newTerm,
          school_year: newSchoolYear,
          target_items: Number(newTargetItems),
          class_size: Number(newClassSize),
          passing_mps: Number(newPassingMps),
          status: 'DRAFT',
          created_by: user?.id,
        })
        .select()
        .single();

      if (createErr) throw createErr;

      // Seed corresponding answer key record
      if (createdAssessment) {
        await supabase.from('answer_keys').insert({
          assessment_id: createdAssessment.id,
          tenant_id: tenantId,
          title: `${createdAssessment.title} – Master Key`,
          answers: {},
        });

        // Seed corresponding TOS document record
        const selectedSubject = subjectsList.find((s) => s.id === newSubjectId)?.name || 'Subject';
        const selectedSection = sectionsList.find((s) => s.id === newSectionId)?.name || 'Section';
        await supabase.from('tos_documents').insert({
          assessment_id: createdAssessment.id,
          tenant_id: tenantId,
          subject: selectedSubject,
          term: newTerm,
          school_year: newSchoolYear,
          section: selectedSection,
          target_items: Number(newTargetItems),
          target_hours: 40,
          status: 'Draft',
          rows: [],
          created_by: user?.id,
        });
      }

      setIsCreateModalOpen(false);
      setNewTitle('');
      await fetchAssessments();
    } catch (err: any) {
      console.error('Error creating assessment:', err);
      alert(`Failed to create assessment: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAssessment = async (id: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"? All associated answer keys, TOS items, and OMR scans will be permanently removed.`)) {
      return;
    }

    try {
      const { error: delErr } = await supabase
        .from('assessments')
        .delete()
        .eq('id', id);

      if (delErr) throw delErr;
      setAssessments((prev) => prev.filter((a) => a.id !== id));
    } catch (err: any) {
      console.error('Failed to delete assessment:', err);
      alert(`Could not delete assessment: ${err.message || err}`);
    }
  };

  const filteredAssessments = assessments.filter((a) => {
    const subjCode = a.subjects?.code || '';
    const subjTitle = a.subjects?.title || '';
    const secName = a.sections?.name || '';
    const matchesSearch =
      a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subjCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subjTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      secName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 min-w-0">
      {/* Header with Title & Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            Assessments Workspace
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Create, configure Table of Specifications, manage answer keys, and evaluate exam results.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          <span>New Assessment</span>
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={fetchAssessments}
            className="inline-flex items-center gap-1 font-bold underline hover:text-red-900"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3.5 sm:p-4 shadow-2xs dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between paint-isolate min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, subject, or section..."
            className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50/60 pl-10 pr-4 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white dark:focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-gray-50/60 px-3 text-xs font-medium text-gray-700 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-300"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="READY">Ready</option>
            <option value="ADMINISTERED">Administered</option>
            <option value="EVALUATED">Evaluated</option>
          </select>
        </div>
      </div>

      {/* Assessments Data Table */}
      <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-2xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden paint-isolate min-w-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs">Loading assessments from database...</span>
          </div>
        ) : filteredAssessments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No matching assessments found</p>
            <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
              {searchQuery ? 'Try clearing the search query or status filter.' : 'Click "New Assessment" to create your first exam.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                <span>Create Assessment</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs table-optimized min-w-[620px]">
              <thead className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
                <tr>
                  <th className="px-4 sm:px-6 py-4">Assessment Title</th>
                  <th className="px-4 sm:px-6 py-4">Subject &amp; Section</th>
                  <th className="px-4 sm:px-6 py-4 text-center">Items / Roll</th>
                  <th className="px-4 sm:px-6 py-4 text-center">Passing MPS</th>
                  <th className="px-4 sm:px-6 py-4 text-center">Status</th>
                  <th className="px-4 sm:px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredAssessments.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 sm:px-6 py-4">
                      <Link
                        href={`/assessments/${a.id}`}
                        className="font-bold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 transition"
                      >
                        {a.title}
                      </Link>
                      <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                        {a.school_year} • {a.term}
                      </p>
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="font-semibold text-gray-800 dark:text-gray-200">
                        {a.subjects?.code || 'GEN'}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        {a.sections?.name || 'Class'}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {a.target_items} items
                      </span>
                      <div className="text-[10px] text-gray-400">
                        max {a.class_size || 70} roll
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center font-semibold text-blue-600 dark:text-blue-400">
                      {a.passing_mps}%
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/assessments/${a.id}`}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 transition"
                        >
                          <span>Open</span>
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          onClick={() => handleDeleteAssessment(a.id, a.title)}
                          className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition"
                          title="Delete Assessment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Assessment Modal Dialog */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Create New Assessment
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssessment} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Assessment Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Midterm Examination in General Mathematics"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Subject
                  </label>
                  <select
                    required
                    value={newSubjectId}
                    onChange={(e) => setNewSubjectId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  >
                    {subjectsList.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Section
                  </label>
                  <select
                    required
                    value={newSectionId}
                    onChange={(e) => setNewSectionId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  >
                    {sectionsList.map((sec) => (
                      <option key={sec.id} value={sec.id}>{sec.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Target Items (10–90)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={90}
                    required
                    value={newTargetItems}
                    onChange={(e) => setNewTargetItems(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Class Size / Roll (1–70)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={70}
                    required
                    value={newClassSize}
                    onChange={(e) => setNewClassSize(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Term
                  </label>
                  <select
                    value={newTerm}
                    onChange={(e) => setNewTerm(e.target.value)}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="1st Quarter">1st Quarter</option>
                    <option value="2nd Quarter">2nd Quarter</option>
                    <option value="3rd Quarter">3rd Quarter</option>
                    <option value="4th Quarter">4th Quarter</option>
                    <option value="Midterm">Midterm</option>
                    <option value="Finals">Finals</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    School Year
                  </label>
                  <input
                    type="text"
                    required
                    value={newSchoolYear}
                    onChange={(e) => setNewSchoolYear(e.target.value)}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Passing MPS (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    required
                    value={newPassingMps}
                    onChange={(e) => setNewPassingMps(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
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
                  <span>{submitting ? 'Creating...' : 'Save Assessment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
