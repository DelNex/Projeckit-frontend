'use client';

import { ColumnDef, DataTable } from '@/components/ui/data-table';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowUpRight,
    CheckCircle2,
    ExternalLink,
    FileSpreadsheet,
    Filter,
    Link2,
    Loader2,
    Plus,
    RefreshCw,
    Trash2,
    X
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getPhilippineSchoolYear } from '@/lib/academic-calendar';
import React, { Suspense, useEffect, useMemo, useState } from 'react';

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
  tos_id?: string | null;
  subjects?: { id: string; code: string; title: string } | null;
  sections?: { id: string; name: string; grade: string } | null;
}

interface TosOptionItem {
  id: string;
  subject: string;
  term: string;
  school_year: string;
  target_items: number;
  status: string;
  grade?: string;
  strand?: string;
  section?: string;
  assessment_id?: string | null;
  sections?: Array<{ id: string; name: string; track?: string }> | null;
}

interface OptionItem {
  id: string;
  name: string;
}

function AssessmentsContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [assessments, setAssessments] = useState<AssessmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subjectsList, setSubjectsList] = useState<OptionItem[]>([]);
  const [sectionsList, setSectionsList] = useState<OptionItem[]>([]);
  const [availableTosList, setAvailableTosList] = useState<TosOptionItem[]>([]);
  const [selectedTosId, setSelectedTosId] = useState<string>('');

  // Link TOS Modal State for legacy assessments
  const [linkTosModal, setLinkTosModal] = useState<{
    isOpen: boolean;
    assessment: AssessmentRecord | null;
    selectedTosId: string;
    saving: boolean;
  }>({
    isOpen: false,
    assessment: null,
    selectedTosId: '',
    saving: false,
  });

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newSubjectId, setNewSubjectId] = useState('');
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [newTargetItems, setNewTargetItems] = useState(50);
  const [newClassSize, setNewClassSize] = useState(50);
  const [newTerm, setNewTerm] = useState('1st Term');
  const [newSchoolYear, setNewSchoolYear] = useState(() => getPhilippineSchoolYear());
  const [newPassingMps, setNewPassingMps] = useState(60.0);
  const [gradingPeriodsList, setGradingPeriodsList] = useState<
    Array<{ id: string; name: string; code: string; is_current: boolean }>
  >([]);

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
          tos_id,
          subjects ( id, code, title ),
          sections ( id, name, grade )
        `)
        .order('created_at', { ascending: false });

      if (err) {
        console.warn('Assessments query with tos_id/class_size failed, retrying fallback:', err);
        // Fallback without tos_id in case migration 14 hasn't run yet
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('assessments')
          .select(`
            id,
            title,
            subject_id,
            section_id,
            term,
            school_year,
            target_items,
            passing_mps,
            status,
            created_at,
            subjects ( id, code, title ),
            sections ( id, name, grade )
          `)
          .order('created_at', { ascending: false });

        if (fallbackErr) {
          console.warn('Fallback query with joins failed, selecting base columns:', fallbackErr);
          const { data: baseData, error: baseErr } = await supabase
            .from('assessments')
            .select('*')
            .order('created_at', { ascending: false });
          if (baseErr) throw baseErr;
          setAssessments((baseData as unknown as AssessmentRecord[]) || []);
          return;
        }

        setAssessments((fallbackData as unknown as AssessmentRecord[]) || []);
        return;
      }
      setAssessments((data as unknown as AssessmentRecord[]) || []);
    } catch (err: any) {
      console.error('Failed to fetch assessments:', err);
      setError(err?.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTos = (tosId: string, currentSubjects = subjectsList, currentTosList = availableTosList) => {
    setSelectedTosId(tosId);
    const found = currentTosList.find((t) => t.id === tosId);
    if (found) {
      const sectionIds = (found.sections || []).map((section) => section.id);
      setSelectedSectionIds(sectionIds);
      setNewTitle(`${found.subject} Examination`);
      setNewTerm(found.term);
      setNewSchoolYear(found.school_year);
      setNewTargetItems(found.target_items);
      const matchedSubj = currentSubjects.find(
        (s) =>
          s.name.toLowerCase().includes(found.subject.toLowerCase()) ||
          found.subject.toLowerCase().includes(s.name.toLowerCase())
      );
      if (matchedSubj) {
        setNewSubjectId(matchedSubj.id);
      }
    }
  };

  const fetchDropdownOptions = async () => {
    try {
      const [subjRes, secRes, gpRes, tosRes] = await Promise.all([
        supabase.from('subjects').select('id, code, title'),
        supabase.from('sections').select('id, name'),
        supabase
          .from('grading_periods')
          .select('id, name, code, is_current')
          .eq('is_archived', false)
          .order('position', { ascending: true }),
        supabase
          .from('tos_documents')
          .select('id, subject, term, school_year, target_items, status, grade, strand, section, sections, assessment_id')
          .order('created_at', { ascending: false }),
      ]);

      let formattedSubjects: OptionItem[] = [];
      if (subjRes.data) {
        formattedSubjects = subjRes.data.map((s) => ({
          id: s.id,
          name: `${s.code} - ${s.title}`,
        }));
        setSubjectsList(formattedSubjects);
        if (formattedSubjects.length > 0 && !newSubjectId) {
          setNewSubjectId(formattedSubjects[0].id);
        }
      }

      if (secRes.data) {
        setSectionsList(secRes.data.map((s) => ({ id: s.id, name: s.name })));
      }

      if (gpRes?.data && gpRes.data.length > 0) {
        setGradingPeriodsList(gpRes.data);
        const currentPeriod = gpRes.data.find((g: any) => g.is_current);
        if (currentPeriod) {
          setNewTerm(currentPeriod.name);
        } else {
          setNewTerm(gpRes.data[0].name);
        }
      }

      const fetchedTos = (tosRes?.data as TosOptionItem[]) || [];
      setAvailableTosList(fetchedTos);

      // Handle query param tos_id if present
      const initialTosId = searchParams.get('tos_id');
      if (initialTosId && fetchedTos.some((t) => t.id === initialTosId)) {
        handleSelectTos(initialTosId, formattedSubjects, fetchedTos);
      } else if (fetchedTos.length > 0 && !selectedTosId) {
        handleSelectTos(fetchedTos[0].id, formattedSubjects, fetchedTos);
      }
    } catch (e) {
      console.warn('Error fetching dropdown options:', e);
    }
  };

  useEffect(() => {
    fetchAssessments();
    fetchDropdownOptions();
    fetch('/api/admin/settings', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        const mps = Number(result.settings?.default_passing_mps);
        if (Number.isFinite(mps) && mps >= 40 && mps <= 100) setNewPassingMps(mps);
      })
      .catch((error) => console.warn('Could not load the school passing-score default:', error));
  }, []);

  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setIsCreateModalOpen(true);
      const tosParam = searchParams.get('tos_id');
      if (tosParam) {
        handleSelectTos(tosParam);
      }
    }
  }, [searchParams, availableTosList]);

  const handleConfirmLinkTos = async () => {
    if (!linkTosModal.assessment || !linkTosModal.selectedTosId) return;
    setLinkTosModal((prev) => ({ ...prev, saving: true }));
    try {
      const { error: updErr } = await supabase
        .from('assessments')
        .update({ tos_id: linkTosModal.selectedTosId })
        .eq('id', linkTosModal.assessment.id);

      if (updErr) throw updErr;

      toast.success('Table of Specifications linked successfully!');
      setLinkTosModal({ isOpen: false, assessment: null, selectedTosId: '', saving: false });
      await fetchAssessments();
    } catch (e: any) {
      console.error('Failed to link TOS:', e);
      toast.error(friendlyError(e, 'Failed to link Table of Specifications.'));
      setLinkTosModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleCreateAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    if (availableTosList.length === 0) {
      toast.error('A Table of Specifications is required before creating an assessment.');
      return;
    }

    if (!selectedTosId) {
      toast.error('Please select a Table of Specifications blueprint.');
      return;
    }
    if (selectedSectionIds.length === 0) {
      toast.error('Select at least one section included in this TOS.');
      return;
    }

    if (gradingPeriodsList.length === 0) {
      toast.error('No active terms configured. Please configure grading periods in School Settings first.');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();

      if (!profile?.tenant_id) {
        throw new Error('Your account is not linked to a school tenant.');
      }
      const tenantId = profile.tenant_id;

      const { data: config } = await supabase
        .from('academic_configs')
        .select('id')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!config?.id) {
        throw new Error('No active academic configuration found for this school.');
      }
      const configId = config.id;

      const existing = await supabase
        .from('assessments')
        .select('section_id')
        .eq('tos_id', selectedTosId)
        .in('section_id', selectedSectionIds);
      if (existing.error) throw existing.error;
      const existingSections = new Set((existing.data || []).map((row) => row.section_id));
      const duplicateNames = sectionsList.filter((section) => existingSections.has(section.id)).map((section) => section.name);
      if (duplicateNames.length) throw new Error(`An assessment already exists for: ${duplicateNames.join(', ')}. Open the existing assessment instead.`);

      const { data: createdRows, error: insertError } = await supabase
        .from('assessments')
        .insert(selectedSectionIds.map((sectionId) => ({
          tenant_id: tenantId,
          config_id: configId,
          tos_id: selectedTosId || null,
          title: newTitle.trim(),
          subject_id: newSubjectId,
          section_id: sectionId,
          term: newTerm,
          school_year: newSchoolYear,
          target_items: Number(newTargetItems),
          class_size: Number(newClassSize),
          passing_mps: Number(newPassingMps),
          status: 'DRAFT',
          created_by: user?.id,
        })))
        .select()
        ;

      if (insertError) throw insertError;

      if (!createdRows?.length) throw new Error('No assessment was created for the selected sections.');
      const { error: answerKeyError } = await supabase.from('answer_keys').insert(createdRows.map((created) => ({
          assessment_id: created.id,
          tenant_id: tenantId,
          answers: {},
      })));
      if (answerKeyError) {
        await supabase.from('assessments').delete().in('id', createdRows.map((created) => created.id));
        throw answerKeyError;
      }

      toast.success(`${createdRows.length} section assessment${createdRows.length === 1 ? '' : 's'} created and linked to the TOS.`);
      setIsCreateModalOpen(false);
      setNewTitle('');
      await fetchAssessments();
    } catch (err: any) {
      console.error('Failed to create assessment:', err);
      toast.error(friendlyError(err, 'Failed to create assessment.'));
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Confirmation Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    assessment: AssessmentRecord | null;
    impactTitle?: string;
    impactText?: string;
    confirmTextMatch?: string;
    isLoading: boolean;
  }>({
    isOpen: false,
    assessment: null,
    isLoading: false,
  });

  const handleDeleteClick = async (assessment: AssessmentRecord) => {
    try {
      // Query response / scan count for this assessment
      const [scanRes, respRes] = await Promise.all([
        supabase
          .from('scan_results')
          .select('*', { count: 'exact', head: true })
          .eq('assessment_id', assessment.id),
        supabase
          .from('responses')
          .select('*', { count: 'exact', head: true })
          .eq('assessment_id', assessment.id),
      ]);

      const count = Math.max(scanRes.count || 0, respRes.count || 0);

      if (count > 0) {
        setDeleteModal({
          isOpen: true,
          assessment,
          impactTitle: 'Student work will be lost',
          impactText: `This assessment has ${count} scanned response${count > 1 ? 's' : ''} that will be permanently deleted.`,
          confirmTextMatch: assessment.title,
          isLoading: false,
        });
      } else {
        setDeleteModal({
          isOpen: true,
          assessment,
          impactTitle: undefined,
          impactText: undefined,
          confirmTextMatch: undefined,
          isLoading: false,
        });
      }
    } catch (e) {
      console.warn('Could not query assessment response count:', e);
      setDeleteModal({
        isOpen: true,
        assessment,
        impactTitle: undefined,
        impactText: undefined,
        confirmTextMatch: undefined,
        isLoading: false,
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.assessment) return;
    const { id } = deleteModal.assessment;

    setDeleteModal((prev) => ({ ...prev, isLoading: true }));
    try {
      const { error: delErr } = await supabase
        .from('assessments')
        .delete()
        .eq('id', id);

      if (delErr) throw delErr;
      setAssessments((prev) => prev.filter((a) => a.id !== id));
      setDeleteModal({ isOpen: false, assessment: null, isLoading: false });
    } catch (err: any) {
      console.error('Failed to delete assessment:', err);
      toast.error(friendlyError(err, 'Could not delete assessment.'));
      setDeleteModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const filteredAssessments = useMemo(() => {
    if (statusFilter === 'ALL') return assessments;
    return assessments.filter((a) => a.status === statusFilter);
  }, [assessments, statusFilter]);

  const columns = useMemo<ColumnDef<AssessmentRecord>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Assessment Title',
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Link
                  href={`/assessments/${a.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-bold text-gray-900 hover:text-blue-600 dark:text-white dark:hover:text-blue-400 transition"
                >
                  {a.title}
                </Link>
                {a.tos_id ? (
                  <Link
                    href="/tos"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition"
                    title="Anchored on Table of Specifications"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>TOS Linked</span>
                  </Link>
                ) : (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      No TOS linked
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLinkTosModal({
                          isOpen: true,
                          assessment: a,
                          selectedTosId: availableTosList.length > 0 ? availableTosList[0].id : '',
                          saving: false,
                        });
                      }}
                      className="text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Link TOS
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-400 font-mono mt-0.5">
                {a.school_year} • {a.term}
              </p>
            </div>
          );
        },
      },
      {
        id: 'subjectSection',
        header: 'Subject & Section',
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                {a.subjects?.code || 'GEN'}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {a.sections?.name || 'Class'}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'target_items',
        header: 'Items / Roll',
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="text-center">
              <span className="font-semibold text-gray-900 dark:text-white">
                {a.target_items} items
              </span>
              <div className="text-[10px] text-gray-400">
                max {a.class_size || 70} roll
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'passing_mps',
        header: 'Passing score (%)',
        cell: ({ row }) => (
          <span className="font-semibold text-blue-600 dark:text-blue-400 font-mono">
            {row.original.passing_mps}%
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status;
          let badgeClass = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
          if (status === 'READY') {
            badgeClass = 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300';
          } else if (status === 'EVALUATED') {
            badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300';
          } else if (status === 'ADMINISTERED') {
            badgeClass = 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300';
          }

          return (
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badgeClass}`}>
              {status}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="flex items-center justify-end gap-2">
              <Link
                href={`/assessments/${a.id}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 transition"
              >
                <span>Open</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick(a);
                }}
                className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition"
                title="Delete Assessment"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        },
      },
    ],
    [availableTosList]
  );

  const selectedTos = availableTosList.find((t) => t.id === selectedTosId);

  return (
    <div className="space-y-6 min-w-0">
      {/* Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            Item Analysis
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Scan answer sheets, verify learner matches, and review item analysis. Print and download by section from Print &amp; Reports.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
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

      {/* Unified DataTable Component */}
      <DataTable
        tableLabel="Item Analysis Assessments"
        columns={columns}
        data={filteredAssessments}
        searchKey="title"
        searchPlaceholder="Search by assessment title..."
        loading={loading}
        emptyTitle="No matching assessments found"
        emptyDescription="Create your first assessment to begin configuring TOS documents and printing test papers."
        onRowClick={(assessment) => {
          window.location.href = `/assessments/${assessment.id}`;
        }}
        renderCustomFilter={
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none transition focus:border-blue-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="ALL">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="READY">Ready</option>
              <option value="ADMINISTERED">Administered</option>
              <option value="EVALUATED">Evaluated</option>
            </select>
          </div>
        }
      />

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

            {availableTosList.length === 0 ? (
              <div className="text-center py-6 space-y-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <FileSpreadsheet className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                    Table of Specifications (TOS) Required
                  </h4>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">
                    Every assessment requires a finished Table of Specifications first. Please define competencies and test blueprint in the TOS workspace before creating an assessment.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href="/tos"
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create a Table of Specifications first</span>
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateAssessment} className="space-y-4 pt-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-gray-700 dark:text-gray-300">
                      Select Table of Specifications (TOS) <span className="text-red-500">*</span>
                    </label>
                    <Link
                      href="/tos"
                      className="text-[11px] font-semibold text-blue-600 hover:underline inline-flex items-center gap-0.5 dark:text-blue-400"
                    >
                      <span>TOS Workspace</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <select
                    required
                    value={selectedTosId}
                    onChange={(e) => handleSelectTos(e.target.value)}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">-- Choose an existing TOS blueprint --</option>
                    {availableTosList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.subject} ({t.term} · {t.school_year} · {t.target_items} items)
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTos && (
                  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/80 p-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span>
                        Linked to TOS: <strong className="font-semibold">{selectedTos.subject}</strong>
                      </span>
                    </div>
                    <Link
                      href="/tos"
                      target="_blank"
                      className="font-bold underline text-blue-600 hover:text-blue-800 dark:text-blue-400 inline-flex items-center gap-1"
                    >
                      <span>View TOS</span>
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Assessment Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Midterm Examination in General Mathematics"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Subject (Inherited from TOS)
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={selectedTos ? selectedTos.subject : (subjectsList.find((s) => s.id === newSubjectId)?.name || 'Select TOS first')}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-600 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Sections in this TOS <span className="text-red-500">*</span>
                    </label>
                    <div className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800">
                      {(selectedTos?.sections || []).map((section) => (
                        <label key={section.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-white dark:text-gray-200 dark:hover:bg-gray-700">
                          <input type="checkbox" checked={selectedSectionIds.includes(section.id)} onChange={() => {
                            setSelectedSectionIds((current) => current.includes(section.id) ? current.filter((id) => id !== section.id) : [...current, section.id]);
                          }} />
                          <span>{section.name}</span>
                        </label>
                      ))}
                      {!selectedTos?.sections?.length && <p className="px-2 py-1 text-[11px] text-amber-700">This TOS has no saved sections. Edit the TOS and select its sections before creating an assessment.</p>}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">One linked assessment will be created for each selected section.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Target Items (Inherited from TOS)
                    </label>
                    <input
                      type="number"
                      readOnly
                      disabled
                      value={newTargetItems}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-600 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400 font-mono"
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
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Term (Inherited from TOS)
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={newTerm}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-600 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                      School Year (Inherited from TOS)
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={newSchoolYear}
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-100 px-3 text-xs text-gray-600 cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400 font-mono"
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
                      className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white font-mono"
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
                    disabled={submitting || !selectedTosId}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{submitting ? 'Creating...' : 'Save Assessment'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Link TOS Modal Dialog for unlinked assessments */}
      {linkTosModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Link2 className="h-5 w-5 text-blue-600" />
                Link Table of Specifications
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Attach a finished Table of Specifications to &quot;{linkTosModal.assessment?.title}&quot;.
              </p>
            </div>

            {availableTosList.length === 0 ? (
              <div className="text-center py-4 space-y-3">
                <p className="text-xs text-gray-500">No available Table of Specifications documents found.</p>
                <Link
                  href="/tos"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create a TOS First</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                    Select TOS Document
                  </label>
                  <select
                    value={linkTosModal.selectedTosId}
                    onChange={(e) => setLinkTosModal((prev) => ({ ...prev, selectedTosId: e.target.value }))}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                  >
                    {availableTosList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.subject} ({t.term} · {t.school_year} · {t.target_items} items)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => setLinkTosModal({ isOpen: false, assessment: null, selectedTosId: '', saving: false })}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={linkTosModal.saving || !linkTosModal.selectedTosId}
                    onClick={handleConfirmLinkTos}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {linkTosModal.saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    <span>{linkTosModal.saving ? 'Linking...' : 'Link TOS'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Assessment Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmDelete}
        title={deleteModal.assessment ? `Delete "${deleteModal.assessment.title}"?` : 'Delete Assessment?'}
        description="This action permanently removes the assessment and cannot be undone."
        actionType="delete"
        entityName="assessment"
        affectedCount={1}
        impactTitle={deleteModal.impactTitle}
        impactText={deleteModal.impactText}
        confirmTextMatch={deleteModal.confirmTextMatch}
        isLoading={deleteModal.isLoading}
      />
    </div>
  );
}

export default function AssessmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
          <span className="text-xs">Loading assessments workspace...</span>
        </div>
      }
    >
      <AssessmentsContent />
    </Suspense>
  );
}
