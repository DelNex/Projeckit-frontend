'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  Filter,
  AlertTriangle,
  Loader2,
  Calendar,
} from 'lucide-react';
import { useTenant } from '@/context/TenantContext';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { getPhilippineSchoolYear } from '@/lib/academic-calendar';
import { TosDocument, STANDARD_EXAM_TYPES } from '@/types/tos';
import { TosCard } from '@/features/tos/components/TosCard';
import { TosCreateEditModal } from '@/features/tos/components/TosCreateEditModal';
import { TosViewModal } from '@/features/tos/components/TosViewModal';
import { TosExamModal } from '@/features/tos/components/TosExamModal';
import { SchemaHealthBanner } from '@/features/tos/components/SchemaHealthBanner';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';

export default function TosPage() {
  const { toast } = useToast();
  const supabase = createClient();
  const tenant = useTenant();

  // Primary Data
  const [tosList, setTosList] = useState<TosDocument[]>([]);
  const [sections, setSections] = useState<Array<{ id: string; name: string; track?: string; grade_level?: string }>>([]);
  const [gradingPeriods, setGradingPeriods] = useState<Array<{ id: string; name: string; is_current: boolean }>>([]);
  const [availableSchoolYears, setAvailableSchoolYears] = useState<string[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);

  // Page Controls & Filters
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerm, setFilterTerm] = useState('ALL');
  const [filterExamType, setFilterExamType] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Schema Health (Admin only)
  const [schemaHealthy, setSchemaHealthy] = useState(true);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Modal States
  const [isCreateEditOpen, setIsCreateEditOpen] = useState(false);
  const [editingTos, setEditingTos] = useState<TosDocument | null>(null);
  const [viewingTos, setViewingTos] = useState<TosDocument | null>(null);
  const [examModalTos, setExamModalTos] = useState<TosDocument | null>(null);

  // Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tosToDelete, setTosToDelete] = useState<TosDocument | null>(null);
  const [linkedAssessmentsCount, setLinkedAssessmentsCount] = useState<number>(0);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fallback school year
  const defaultSchoolYear = tenant?.schoolYear || getPhilippineSchoolYear();

  useEffect(() => {
    if (defaultSchoolYear && !selectedSchoolYear) {
      setSelectedSchoolYear(defaultSchoolYear);
    }
  }, [defaultSchoolYear, selectedSchoolYear]);

  // Check Schema Health
  const checkSchema = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/schema-health');
      if (res.ok) {
        const data = await res.json();
        setSchemaHealthy(Boolean(data.healthy));
        setMissingColumns(data.missingColumns || []);
        if (!data.healthy) {
          setSchemaError(data.error || 'Required database columns missing.');
        }
      }
    } catch (e) {
      // Non-blocking schema probe
      console.warn('Schema probe notice:', e);
    }
  }, []);

  // Load All TOS Data
  const loadData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      // 1. Fetch TOS documents with fallback for schema differences
      let documents: TosDocument[] = [];
      const tosRes = await supabase
        .from('tos_documents')
        .select(`
          id,
          assessment_id,
          tenant_id,
          subject,
          term,
          school_year,
          grade,
          strand,
          section,
          target_items,
          total_days,
          days_taught,
          status,
          rows,
          teacher_name,
          exam_type,
          description,
          sections,
          generated_at,
          created_at,
          updated_at,
          assessments ( id, title )
        `)
        .order('created_at', { ascending: false });

      if (!tosRes.error && tosRes.data) {
        documents = tosRes.data as unknown as TosDocument[];
      } else {
        console.warn('Extended TOS query failed, falling back to base columns:', tosRes.error);
        const fallbackTos = await supabase
          .from('tos_documents')
          .select(`
            id,
            assessment_id,
            tenant_id,
            subject,
            term,
            school_year,
            grade,
            strand,
            section,
            target_items,
            status,
            rows,
            created_at,
            updated_at
          `)
          .order('created_at', { ascending: false });

        if (fallbackTos.error) throw fallbackTos.error;
        documents = (fallbackTos.data || []) as unknown as TosDocument[];
      }
      setTosList(documents);

      // 2. Fetch Sections safely (always filter is_archived = false; fallback only if column missing with admin banner)
      try {
        const secRes = await supabase
          .from('sections')
          .select('id, name, grade, strand_code')
          .eq('is_archived', false)
          .order('name', { ascending: true });

        if (!secRes.error && secRes.data) {
          setSections(
            secRes.data.map((s) => ({
              id: s.id,
              name: s.name,
              track: s.strand_code || s.grade || '',
              grade_level: s.grade || '',
            }))
          );
        } else {
          console.warn('Archived sections filter failed, falling back to basic query:', secRes.error);
          setSchemaHealthy(false);
          setMissingColumns((prev) => Array.from(new Set([...prev, 'sections.is_archived'])));
          const fbSec = await supabase.from('sections').select('id, name').order('name', { ascending: true });
          if (fbSec.data) {
            setSections(fbSec.data.map((s) => ({ id: s.id, name: s.name })));
          }
        }
      } catch (secErr) {
        console.warn('Sections query error, trying basic fallback:', secErr);
        setSchemaHealthy(false);
        setMissingColumns((prev) => Array.from(new Set([...prev, 'sections.is_archived'])));
        const fbSec = await supabase.from('sections').select('id, name').order('name', { ascending: true });
        if (fbSec.data) {
          setSections(fbSec.data.map((s) => ({ id: s.id, name: s.name })));
        }
      }

      // 3. Fetch Grading Periods safely
      try {
        const gpRes = await supabase
          .from('grading_periods')
          .select('id, name, is_current')
          .eq('is_archived', false)
          .order('position', { ascending: true });

        if (gpRes.data && gpRes.data.length > 0) {
          setGradingPeriods(gpRes.data);
        } else {
          setGradingPeriods([
            { id: 't1', name: 'Term 1', is_current: true },
            { id: 't2', name: 'Term 2', is_current: false },
            { id: 't3', name: 'Term 3', is_current: false },
            { id: 't4', name: 'Term 4', is_current: false },
          ]);
        }
      } catch {
        setGradingPeriods([
          { id: 't1', name: 'Term 1', is_current: true },
          { id: 't2', name: 'Term 2', is_current: false },
          { id: 't3', name: 'Term 3', is_current: false },
          { id: 't4', name: 'Term 4', is_current: false },
        ]);
      }

      // 4. Fetch Available Subjects from subjects table for suggestion list
      try {
        const subjRes = await supabase
          .from('subjects')
          .select('title')
          .order('title', { ascending: true });
        if (subjRes.data) {
          setAvailableSubjects(subjRes.data.map((s) => s.title).filter(Boolean));
        }
      } catch (subjErr) {
        console.warn('Could not fetch subjects suggestion list:', subjErr);
      }

      // Collect available school years
      const years = Array.from(
        new Set([
          defaultSchoolYear,
          ...documents.map((d) => d.school_year).filter(Boolean),
        ])
      ).sort().reverse();
      setAvailableSchoolYears(years);
    } catch (err: any) {
      console.error('Failed to load Table of Specifications documents:', err);
      setFetchError(friendlyError(err, 'Could not retrieve Table of Specifications.'));
    } finally {
      setLoading(false);
    }
  }, [supabase, defaultSchoolYear]);

  useEffect(() => {
    loadData();
    checkSchema();
  }, [loadData, checkSchema]);

  // Filtered Cards
  const filteredTosList = useMemo(() => {
    return tosList.filter((tos) => {
      // School Year filter
      if (selectedSchoolYear && tos.school_year !== selectedSchoolYear) {
        return false;
      }

      // Term filter
      if (filterTerm !== 'ALL' && tos.term !== filterTerm) {
        return false;
      }

      // Exam Type filter
      if (filterExamType !== 'ALL' && (tos.exam_type || 'Summative Test 1') !== filterExamType) {
        return false;
      }

      // Search Query
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const subjectMatch = tos.subject.toLowerCase().includes(query);
        const descMatch = (tos.description || '').toLowerCase().includes(query);
        const sectionMatch = (tos.section || '').toLowerCase().includes(query);
        return subjectMatch || descMatch || sectionMatch;
      }

      return true;
    });
  }, [tosList, selectedSchoolYear, filterTerm, filterExamType, searchTerm]);

  // Unique list of subjects for autocomplete (combines subjects table + existing TOS subjects)
  const existingSubjects = useMemo(() => {
    return Array.from(
      new Set([
        ...availableSubjects,
        ...tosList.map((t) => t.subject).filter(Boolean),
      ])
    ).sort();
  }, [availableSubjects, tosList]);

  // Create or Update Action
  const handleSaveTos = async (payload: any) => {
    const { data: { user } } = await supabase.auth.getUser();

    const tenantId = tenant?.tenantId;
    if (!tenantId) {
      throw new Error('Your user profile is not associated with an active school.');
    }

    const completePayload = {
      ...payload,
      tenant_id: tenantId,
      created_by: user?.id,
    };

    if (editingTos) {
      const { data: updated, error } = await supabase
        .from('tos_documents')
        .update(completePayload)
        .eq('id', editingTos.id)
        .select()
        .single();

      if (error) throw error;
      toast.success(`Table of Specification for "${updated.subject}" updated.`);
      await loadData();
      setViewingTos(updated as unknown as TosDocument);
      return updated;
    } else {
      const { data: inserted, error } = await supabase
        .from('tos_documents')
        .insert(completePayload)
        .select()
        .single();

      if (error) throw error;
      toast.success(`Table of Specification for "${inserted.subject}" created!`);
      await loadData();
      setViewingTos(inserted as unknown as TosDocument);
      return inserted;
    }
  };

  // Delete Action
  const handleRequestDelete = async (tos: TosDocument) => {
    setTosToDelete(tos);
    setLinkedAssessmentsCount(0);

    try {
      const { count } = await supabase
        .from('assessments')
        .select('id', { count: 'exact', head: true })
        .eq('tos_id', tos.id);

      setLinkedAssessmentsCount(count || 0);
    } catch (e) {
      console.warn('Check linked assessment count error:', e);
    }

    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!tosToDelete) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('tos_documents')
        .delete()
        .eq('id', tosToDelete.id);

      if (error) throw error;

      toast.success(`Table of Specification for "${tosToDelete.subject}" deleted.`);
      setDeleteModalOpen(false);
      setTosToDelete(null);
      await loadData();
    } catch (err: any) {
      console.error('Failed to delete TOS:', err);
      toast.error(friendlyError(err, 'Failed to delete Table of Specification.'));
    } finally {
      setIsDeleting(false);
    }
  };

  const currentUser = {
    id: '',
    displayName: tenant?.userDisplayName || 'Subject Teacher',
    isAdmin: tenant?.userRole === 'admin' || tenant?.userRole === 'super_admin',
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto px-4 sm:px-6">
      {/* Schema Health Warning Banner (Admins only) */}
      {!schemaHealthy && currentUser.isAdmin && (
        <SchemaHealthBanner
          missingColumns={missingColumns}
          requiredMigration="20260908000020_tos_eclassroom_redesign.sql"
          technicalError={schemaError}
        />
      )}

      {/* Main Header (Copy screenshot 6) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <span>Table of Specification</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              DepEd Order 8, s. 2015
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Design standard competency allocation matrices, Bloom taxonomy distributions, and examinations.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* School Year Selector */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs shadow-sm">
            <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">School Year:</span>
            <select
              value={selectedSchoolYear}
              onChange={(e) => setSelectedSchoolYear(e.target.value)}
              className="bg-transparent font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
            >
              {availableSchoolYears.map((sy) => (
                <option key={sy} value={sy}>
                  {sy} {sy === defaultSchoolYear ? '(Current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => loadData()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-colors"
            title="Refresh Table of Specifications"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {/* Create TOS Button */}
          <button
            onClick={() => {
              setEditingTos(null);
              setIsCreateEditOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Create TOS</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by subject, description or section..."
            className="w-full text-xs sm:text-sm pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border-none outline-none text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>

        {/* Term Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={filterTerm}
            onChange={(e) => setFilterTerm(e.target.value)}
            className="w-full sm:w-auto text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none font-medium"
          >
            <option value="ALL">All Terms</option>
            {gradingPeriods.map((gp) => (
              <option key={gp.id} value={gp.name}>
                {gp.name}
              </option>
            ))}
          </select>

          {/* Exam Type Filter */}
          <select
            value={filterExamType}
            onChange={(e) => setFilterExamType(e.target.value)}
            className="w-full sm:w-auto text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none font-medium"
          >
            <option value="ALL">All Exam Types</option>
            {STANDARD_EXAM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Content States: Loading, Error, Empty, or Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-56 rounded-2xl bg-slate-100 dark:bg-slate-800/50 animate-pulse border border-slate-200 dark:border-slate-800 p-5 space-y-4"
            >
              <div className="flex gap-2">
                <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded-full" />
              </div>
              <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded-lg pt-4" />
            </div>
          ))}
        </div>
      ) : fetchError ? (
        <div className="p-8 rounded-3xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-center space-y-3">
          <AlertTriangle className="h-8 w-8 text-rose-600 dark:text-rose-400 mx-auto" />
          <h3 className="text-base font-bold text-rose-900 dark:text-rose-100">{fetchError}</h3>
          <button
            onClick={() => loadData()}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-sm"
          >
            Retry Loading
          </button>
        </div>
      ) : filteredTosList.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <FileSpreadsheet className="h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {searchTerm || filterTerm !== 'ALL' || filterExamType !== 'ALL'
                ? 'No matching Table of Specifications found'
                : 'Create your first Table of Specification'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              {searchTerm || filterTerm !== 'ALL' || filterExamType !== 'ALL'
                ? 'Try adjusting your search query, term filter, or exam type.'
                : 'Define competencies and instructional days to automatically allocate Bloom domains and generate standardized tests.'}
            </p>
          </div>
          <button
            onClick={() => {
              setEditingTos(null);
              setIsCreateEditOpen(true);
            }}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20"
          >
            <Plus className="h-4 w-4" />
            <span>Create your first TOS</span>
          </button>
        </div>
      ) : (
        /* Responsive Card Grid (1 col phone, 2 tablet, 3 desktop) */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTosList.map((tos) => (
            <TosCard
              key={tos.id}
              tos={tos}
              onView={(target) => setViewingTos(target)}
              onEdit={(target) => {
                setEditingTos(target);
                setIsCreateEditOpen(true);
              }}
              onCreateExam={(target) => setExamModalTos(target)}
              onDelete={(target) => handleRequestDelete(target)}
              onPrintPdf={(target) => setViewingTos(target)}
            />
          ))}
        </div>
      )}

      {/* Modals */}

      {/* 1. Create / Edit Modal (Phase 3) */}
      <TosCreateEditModal
        isOpen={isCreateEditOpen}
        onClose={() => {
          setIsCreateEditOpen(false);
          setEditingTos(null);
        }}
        onSave={handleSaveTos}
        existingTos={editingTos}
        availableSections={sections}
        availableGradingPeriods={gradingPeriods}
        existingSubjects={existingSubjects}
        currentSchoolYear={selectedSchoolYear || defaultSchoolYear}
        schoolName={tenant?.tenantName || 'Project KIT School'}
        currentUser={currentUser}
        hasLinkedExam={Boolean(editingTos?.assessment_id)}
      />

      {/* 2. Official Table View Modal (Phase 4) */}
      <TosViewModal
        isOpen={Boolean(viewingTos)}
        onClose={() => setViewingTos(null)}
        tos={viewingTos}
        schoolName={tenant?.tenantName || 'Project KIT School'}
        region={tenant?.region}
        division={tenant?.division}
        onCreateExam={(target) => setExamModalTos(target)}
      />

      {/* 3. Examination Generator Modal (Phase 5) */}
      <TosExamModal
        isOpen={Boolean(examModalTos)}
        onClose={() => setExamModalTos(null)}
        tos={examModalTos}
        schoolName={tenant?.tenantName || 'Project KIT School'}
      />

      {/* 4. Delete Confirmation Modal with Linked Exam Warning */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Delete Table of Specification?"
        description={
          linkedAssessmentsCount > 0
            ? `This TOS is currently linked to an examination. Deleting this Table of Specification will also remove the linked examination draft and its answer key. Are you sure you want to permanently delete it?`
            : `Are you sure you want to permanently delete the Table of Specification for "${tosToDelete?.subject}"? This action cannot be undone.`
        }
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete Permanently'}
        cancelLabel="Cancel"
        actionType="delete"
        onConfirm={handleConfirmDelete}
        onClose={() => {
          setDeleteModalOpen(false);
          setTosToDelete(null);
        }}
      />
    </div>
  );
}
