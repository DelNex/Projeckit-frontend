'use client';

import { ColumnDef, DataTable } from '@/components/ui/data-table';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { BulkAddStudentsModal } from '@/components/students/BulkAddStudentsModal';
import { useToast } from '@/components/ui/toast';
import { getTenantContext } from '@/lib/tenant-context';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

interface StudentRecord {
  id: string;
  lrn: string;
  name: string;
  section_name: string;
  is_archived?: boolean;
  archived_at?: string;
  created_at?: string;
}

export default function StudentsPage() {
  const { toast } = useToast();
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active vs Archive view
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [sectionsList, setSectionsList] = useState<{ id: string; name: string }[]>([]);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visiblePageStudents, setVisiblePageStudents] = useState<StudentRecord[]>([]);
  const [targetMoveSection, setTargetMoveSection] = useState('');

  // Confirmation Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    action: 'archive' | 'restore' | 'delete';
    targetIds: string[];
    title: string;
    description: string;
    affectedCount: number;
  }>({
    isOpen: false,
    action: 'archive',
    targetIds: [],
    title: '',
    description: '',
    affectedCount: 0,
  });
  const [isOperating, setIsOperating] = useState(false);

  // Add / Edit Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [archivedDuplicateId, setArchivedDuplicateId] = useState<string | null>(null);

  // Form State
  const [formLrn, setFormLrn] = useState('');
  const [formName, setFormName] = useState('');
  const [formSection, setFormSection] = useState('');
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);

  const hasUnsavedLearner = isAddModalOpen && Boolean(formName.trim() || formLrn.trim());

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedLearner) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedLearner]);

  const handleAttemptCloseAddModal = () => {
    if (hasUnsavedLearner) {
      setIsDiscardModalOpen(true);
    } else {
      setIsAddModalOpen(false);
      setFormError(null);
      setArchivedDuplicateId(null);
    }
  };

  const handleConfirmDiscard = () => {
    setIsDiscardModalOpen(false);
    setIsAddModalOpen(false);
    setFormName('');
    setFormLrn('');
    setFormError(null);
    setArchivedDuplicateId(null);
  };

  const supabase = createClient();

  const [needsMigration, setNeedsMigration] = useState(false);

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const PAGE_SIZE = 1000;
      let allRecords: StudentRecord[] = [];
      let page = 0;
      let hasMore = true;
      let columnFallback = false;

      // Test whether is_archived column exists
      const testQuery = await (supabase as any)
        .from('students')
        .select('id, is_archived')
        .limit(1);

      if (testQuery.error) {
        columnFallback = true;
        setNeedsMigration(true);
      } else {
        setNeedsMigration(false);
      }

      while (hasMore) {
        const from = page * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        if (columnFallback) {
          const { data, error: fbErr } = await supabase
            .from('students')
            .select('id, lrn, name, section_name, created_at')
            .order('name', { ascending: true })
            .range(from, to);

          if (fbErr) throw fbErr;
          const rows = (data || []).map((s) => ({
            ...s,
            is_archived: false,
          }));
          allRecords = allRecords.concat(rows);
          if (rows.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          const { data, error: err } = await (supabase as any)
            .from('students')
            .select('id, lrn, name, section_name, is_archived, archived_at, created_at')
            .order('name', { ascending: true })
            .range(from, to);

          if (err) throw err;
          const rows = (data || []).map((s: any) => ({
            ...s,
            is_archived: Boolean(s.is_archived),
          }));
          allRecords = allRecords.concat(rows);
          if (rows.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            page++;
          }
        }
      }

      setStudents(allRecords);
      // Clear selection on refresh
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error('Failed to fetch students:', err);
      setError(err?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const fetchSections = async () => {
    try {
      let { data, error: secErr } = await (supabase as any)
        .from('sections')
        .select('id, name')
        .eq('is_archived', false)
        .order('name', { ascending: true });

      if (secErr) {
        const { data: fallbackData } = await supabase
          .from('sections')
          .select('id, name')
          .order('name', { ascending: true });
        data = fallbackData;
      }

      if (data && data.length > 0) {
        setSectionsList(data);
        if (!formSection) setFormSection(data[0].name);
      }
    } catch (e) {
      console.warn('Error fetching sections:', e);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchSections();
  }, []);

  // Filter students based on active/archived tab and section filter
  const activeStudents = useMemo(
    () => students.filter((s) => !s.is_archived),
    [students]
  );

  const archivedStudents = useMemo(
    () => students.filter((s) => Boolean(s.is_archived)),
    [students]
  );

  const displayedStudents = useMemo(() => {
    const list = activeTab === 'active' ? activeStudents : archivedStudents;
    if (sectionFilter === 'ALL') return list;
    return list.filter((s) => s.section_name === sectionFilter);
  }, [activeTab, activeStudents, archivedStudents, sectionFilter]);

  // Selection handlers: restricted to visible rows on the current page
  const allPageSelected =
    visiblePageStudents.length > 0 &&
    visiblePageStudents.every((s) => selectedIds.has(s.id));

  const somePageSelected =
    visiblePageStudents.some((s) => selectedIds.has(s.id)) && !allPageSelected;

  const toggleSelectAllVisible = () => {
    const newSet = new Set(selectedIds);
    if (allPageSelected) {
      // Unticking only deselects rows visible on the current page
      visiblePageStudents.forEach((s) => newSet.delete(s.id));
    } else {
      // Ticking selects all rows visible on the current page
      visiblePageStudents.forEach((s) => newSet.add(s.id));
    }
    setSelectedIds(newSet);
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Add / Edit Form handlers
  const openAddModal = () => {
    setEditingStudent(null);
    setFormLrn('');
    setFormName('');
    setFormError(null);
    setArchivedDuplicateId(null);
    if (sectionsList.length > 0) setFormSection(sectionsList[0].name);
    setIsAddModalOpen(true);
  };

  const openEditModal = (student: StudentRecord) => {
    setEditingStudent(student);
    setFormLrn(student.lrn);
    setFormName(student.name);
    setFormSection(student.section_name);
    setFormError(null);
    setArchivedDuplicateId(null);
    setIsAddModalOpen(true);
  };

  const handleRestoreDirectly = async (ids: string | string[]) => {
    const targetIds = Array.isArray(ids) ? ids : [ids];
    if (targetIds.length === 0) return;
    try {
      setSubmitting(true);
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', studentIds: targetIds }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to restore learner');
      }
      setIsAddModalOpen(false);
      setArchivedDuplicateId(null);
      setFormError(null);
      toast.success(
        `Restored ${targetIds.length} learner${targetIds.length > 1 ? 's' : ''} to active roster.`
      );
      await fetchStudents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore learner');
      setFormError(err.message || 'Failed to restore learner');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLrn.trim() || !formName.trim() || !formSection) return;

    const trimmedLrn = formLrn.trim();
    setArchivedDuplicateId(null);

    // Pre-check against loaded student roster
    const existingLearner = students.find(
      (s) => s.lrn === trimmedLrn && (!editingStudent || s.id !== editingStudent.id)
    );
    if (existingLearner) {
      if (existingLearner.is_archived) {
        setFormError(
          'A learner with this LRN already exists. If they were archived, restore them from the Archived tab.'
        );
        setArchivedDuplicateId(existingLearner.id);
        return;
      } else {
        setFormError('A learner with this LRN already exists in the active roster.');
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const { tenantId, configId } = await getTenantContext(supabase);

      if (editingStudent) {
        const { error: updErr } = await supabase
          .from('students')
          .update({
            lrn: trimmedLrn,
            name: formName.trim(),
            section_name: formSection,
          })
          .eq('id', editingStudent.id)
          .eq('tenant_id', tenantId);

        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('students').insert({
          tenant_id: tenantId,
          config_id: configId,
          lrn: trimmedLrn,
          name: formName.trim(),
          section_name: formSection,
        });

        if (insErr) throw insErr;
      }

      setIsAddModalOpen(false);
      setSuccessMessage(
        editingStudent ? 'Learner details updated.' : 'New learner enrolled successfully.'
      );
      setTimeout(() => setSuccessMessage(null), 4000);
      await fetchStudents();
    } catch (err: any) {
      console.error('Failed to save student:', err);
      const isDuplicate =
        err?.code === '23505' ||
        err?.message?.includes('23505') ||
        err?.message?.includes('uq_tenant_student_lrn') ||
        err?.message?.includes('duplicate key');

      if (isDuplicate) {
        const match = students.find((s) => s.lrn === trimmedLrn);
        if (match?.is_archived) {
          setArchivedDuplicateId(match.id);
        }
        setFormError(
          'A learner with this LRN already exists. If they were archived, restore them from the Archived tab.'
        );
      } else {
        setFormError(err.message || 'Error saving student');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Trigger Confirmation Modals
  const triggerArchiveSelected = (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedIds);
    if (targetIds.length === 0) return;

    setConfirmModal({
      isOpen: true,
      action: 'archive',
      targetIds,
      title: targetIds.length > 1 ? `Archive ${targetIds.length} Learners?` : 'Archive Learner?',
      description:
        targetIds.length > 1
          ? `Are you sure you want to archive these ${targetIds.length} learners? They will be removed from your active roster and can be restored anytime from the Archive tab.`
          : 'Are you sure you want to archive this learner? The record will be moved to the Archive tab with all historical grades preserved.',
      affectedCount: targetIds.length,
    });
  };

  const triggerRestoreSelected = (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedIds);
    if (targetIds.length === 0) return;

    setConfirmModal({
      isOpen: true,
      action: 'restore',
      targetIds,
      title: targetIds.length > 1 ? `Restore ${targetIds.length} Learners?` : 'Restore Learner?',
      description:
        targetIds.length > 1
          ? `Are you sure you want to restore these ${targetIds.length} learners back to the active roster?`
          : 'Are you sure you want to restore this learner back to the active roster?',
      affectedCount: targetIds.length,
    });
  };

  const triggerDeleteSelected = (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedIds);
    if (targetIds.length === 0) return;

    setConfirmModal({
      isOpen: true,
      action: 'delete',
      targetIds,
      title:
        targetIds.length > 1
          ? `Permanently Delete ${targetIds.length} Learners?`
          : 'Permanently Delete Learner?',
      description:
        'This action permanently erases the selected learner records from the database. This action CANNOT be undone.',
      affectedCount: targetIds.length,
    });
  };

  // Bulk Move Learners to Section
  const handleBulkMove = async () => {
    if (!targetMoveSection || selectedIds.size === 0) return;
    const targetIds = Array.from(selectedIds);
    setIsOperating(true);
    try {
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          studentIds: targetIds,
          targetSection: targetMoveSection,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to move learners');
      }

      toast.success(
        `Successfully moved ${targetIds.length} learner${targetIds.length > 1 ? 's' : ''} to section "${targetMoveSection}".`
      );
      setSelectedIds(new Set());
      setTargetMoveSection('');
      await fetchStudents();
    } catch (err: any) {
      toast.error(err.message || 'Failed to move learners');
    } finally {
      setIsOperating(false);
    }
  };

  // Export current roster to CSV with formula injection sanitization
  const handleExportCsv = () => {
    if (displayedStudents.length === 0) {
      toast.error('No learner records to export.');
      return;
    }

    const sanitizeCell = (value: string | number | boolean | null | undefined): string => {
      if (value === null || value === undefined) return '""';
      let str = String(value);
      // Formula injection prevention: if cell begins with =, +, -, or @, prepend '
      if (/^[=+\-@]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const headers = ['DepEd LRN', 'Learner Name', 'Section', 'Status'];
    const rows = displayedStudents.map((s) => [
      sanitizeCell(s.lrn),
      sanitizeCell(s.name),
      sanitizeCell(s.section_name),
      sanitizeCell(s.is_archived ? 'Archived' : 'Active'),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `learners_roster_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${displayedStudents.length} learners to CSV.`);
  };

  // Execute confirmed action (Archive, Restore, or Permanent Delete)
  const handleExecuteConfirmedAction = async () => {
    const { action, targetIds } = confirmModal;
    if (targetIds.length === 0) return;

    setIsOperating(true);
    setError(null);
    try {
      // 1. Try server-side protected API endpoint
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, studentIds: targetIds }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${action} learners`);
      }

      // Success notification
      const count = targetIds.length;
      if (action === 'archive') {
        const archivedIds = [...targetIds];
        toast.success(`Archived ${count} learner${count > 1 ? 's' : ''}.`, {
          duration: 8000,
          action: {
            label: 'Undo',
            onClick: () => handleRestoreDirectly(archivedIds),
          },
        });
      } else if (action === 'restore') {
        toast.success(`Restored ${count} learner${count > 1 ? 's' : ''} to active roster.`);
      } else {
        toast.success(`Permanently deleted ${count} learner${count > 1 ? 's' : ''}.`);
      }

      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      setSelectedIds(new Set());
      await fetchStudents();
    } catch (err: any) {
      console.error('Operation error:', err);
      setError(err.message || 'Operation failed');
    } finally {
      setIsOperating(false);
    }
  };

  // Define Table Columns
  const columns = useMemo<ColumnDef<StudentRecord>[]>(
    () => [
      // Select Checkbox Column
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={allPageSelected}
            ref={(el) => {
              if (el) el.indeterminate = somePageSelected;
            }}
            onChange={toggleSelectAllVisible}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
            aria-label="Select learners on this page"
          />
        ),
        cell: ({ row }) => {
          const isSelected = selectedIds.has(row.original.id);
          return (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelectOne(row.original.id)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
              aria-label={`Select ${row.original.name}`}
            />
          );
        },
        sortable: false,
      },
      {
        accessorKey: 'name',
        header: 'Learner Name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-white">
              {row.getValue('name')}
            </span>
            {row.original.is_archived && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Archived
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'lrn',
        header: 'DepEd LRN',
        cell: ({ row }) => (
          <span className="font-mono text-gray-600 dark:text-gray-300">
            {row.getValue('lrn')}
          </span>
        ),
      },
      {
        accessorKey: 'section_name',
        header: 'Section',
        cell: ({ row }) => (
          <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {row.getValue('section_name')}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const s = row.original;
          if (activeTab === 'archived') {
            return (
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => triggerRestoreSelected([s.id])}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 transition"
                  title="Restore to active roster"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Restore</span>
                </button>
                <button
                  type="button"
                  onClick={() => triggerDeleteSelected([s.id])}
                  className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition"
                  title="Permanently Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          }

          return (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => openEditModal(s)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 transition"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={() => triggerArchiveSelected([s.id])}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 transition"
                title="Archive learner (soft delete)"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archive</span>
              </button>
            </div>
          );
        },
      },
    ],
    [activeTab, selectedIds, allPageSelected, somePageSelected, displayedStudents]
  );

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Header & Enrolment Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            Learners Roster
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Authoritative student enrollment records, DepEd LRN registry, and archive management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs font-bold text-gray-700 shadow-xs hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-850 dark:text-gray-300 dark:hover:bg-gray-800 transition"
            title="Download CSV roster"
          >
            <Download className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setIsBulkAddOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-xs font-bold text-gray-700 shadow-xs hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-850 dark:text-gray-300 dark:hover:bg-gray-800 transition"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Bulk Import</span>
          </button>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <Plus className="h-4 w-4" />
            <span>Add Learner</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300 animate-in fade-in duration-150">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={fetchStudents}
            className="inline-flex items-center gap-1 font-bold underline hover:text-red-900"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {needsMigration && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          Archive needs migration 20260908000005 applied.
        </div>
      )}

      {/* View Tabs: Active Learners vs Archive */}
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('active');
              setSelectedIds(new Set());
            }}
            className={cn(
              'flex items-center gap-2 pb-3 px-3 text-xs font-bold transition-all relative border-b-2 -mb-[2px]',
              activeTab === 'active'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            <Users className="h-4 w-4" />
            <span>Active Learners</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono',
                activeTab === 'active'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              )}
            >
              {activeStudents.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('archived');
              setSelectedIds(new Set());
            }}
            className={cn(
              'flex items-center gap-2 pb-3 px-3 text-xs font-bold transition-all relative border-b-2 -mb-[2px]',
              activeTab === 'archived'
                ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            )}
          >
            <Archive className="h-4 w-4" />
            <span>Archived Roster</span>
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-bold font-mono',
                activeTab === 'archived'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              )}
            >
              {archivedStudents.length}
            </span>
          </button>
        </div>
      </div>

      {/* Floating / Sticky Bulk Action Toolbar */}
      {selectedIds.size > 0 && (() => {
        const selectedOnCurrentPage = visiblePageStudents.filter((s) => selectedIds.has(s.id)).length;
        const selectedOffPage = selectedIds.size - selectedOnCurrentPage;

        return (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-blue-50/90 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/60 animate-in slide-in-from-top-2 duration-150">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white font-mono text-xs font-bold">
                {selectedIds.size}
              </span>
              <span className="text-xs font-bold text-gray-900 dark:text-white">
                {selectedIds.size} learner{selectedIds.size > 1 ? 's' : ''} selected
                {selectedOffPage > 0 && (
                  <span className="font-normal text-gray-500 dark:text-gray-400 ml-1">
                    ({selectedOnCurrentPage} on this page, {selectedOffPage} not on current page)
                  </span>
                )}
              </span>
              {selectedIds.size < displayedStudents.length && (
                <button
                  type="button"
                  onClick={() => {
                    const newSet = new Set(selectedIds);
                    displayedStudents.forEach((s) => newSet.add(s.id));
                    setSelectedIds(newSet);
                  }}
                  className="text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400 ml-1"
                >
                  Select all {displayedStudents.length} in this list
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] font-semibold text-gray-500 hover:underline dark:text-gray-400 ml-2"
              >
                Clear Selection
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activeTab === 'active' ? (
                <>
                  {sectionsList.length > 0 && (
                    <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-1 shadow-xs">
                      <select
                        value={targetMoveSection}
                        onChange={(e) => setTargetMoveSection(e.target.value)}
                        disabled={isOperating}
                        className="bg-transparent text-xs font-medium text-gray-800 dark:text-gray-200 px-2 py-1 outline-none"
                        aria-label="Target section for move"
                      >
                        <option value="">Move to Section...</option>
                        {sectionsList.map((sec) => (
                          <option key={sec.id} value={sec.name}>
                            {sec.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={!targetMoveSection || isOperating}
                        onClick={handleBulkMove}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition disabled:opacity-40"
                      >
                        {isOperating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                        <span>Move</span>
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => triggerArchiveSelected()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    <span>Archive Selected ({selectedIds.size})</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => triggerRestoreSelected()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Restore Selected ({selectedIds.size})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => triggerDeleteSelected()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-red-700 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Permanently Delete ({selectedIds.size})</span>
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Archive Context Banner when in Archived tab */}
      {activeTab === 'archived' && (
        <div className="flex items-center gap-2.5 p-3 rounded-2xl border border-amber-200 bg-amber-50/60 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <ArchiveRestore className="h-4 w-4 shrink-0" />
          <span>
            <strong>Archive Records:</strong> These learners have been soft-deleted from the active roster. You can restore them anytime or permanently delete them if no longer needed.
          </span>
        </div>
      )}

      {/* Unified DataTable Component */}
      <DataTable
        columns={columns}
        data={displayedStudents}
        onVisibleRowsChange={setVisiblePageStudents}
        searchKey={['name', 'lrn']}
        searchPlaceholder={
          activeTab === 'active'
            ? 'Search learners by name or LRN...'
            : 'Search archived learners by name or LRN...'
        }
        loading={loading}
        emptyTitle={
          activeTab === 'active' ? 'No active learners' : 'Archive is empty'
        }
        emptyDescription={
          activeTab === 'active'
            ? 'Enroll students to begin generating personalized OMR sheets and tracking MPS.'
            : 'No student records have been archived.'
        }
        renderCustomFilter={
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 outline-none transition focus:border-blue-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300"
            >
              <option value="ALL">All Sections</option>
              {sectionsList.map((sec) => (
                <option key={sec.id} value={sec.name}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Confirmation Modal for Archive / Restore / Permanent Deletion */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleExecuteConfirmedAction}
        title={confirmModal.title}
        description={confirmModal.description}
        affectedCount={confirmModal.affectedCount}
        entityName="learner"
        actionType={confirmModal.action}
        isLoading={isOperating}
      />

      {/* Add / Edit Learner Modal Dialog */}
      {isAddModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleAttemptCloseAddModal();
            }
          }}
        >
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {editingStudent ? 'Edit Learner' : 'Add New Learner'}
              </h3>
              <button
                type="button"
                onClick={handleAttemptCloseAddModal}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4 pt-4 text-xs">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 space-y-2">
                  <p>{formError}</p>
                  {archivedDuplicateId && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleRestoreDirectly(archivedDuplicateId)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restore Learner</span>
                    </button>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Learner Full Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Juan D. Dela Cruz"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  DepEd 12-Digit LRN
                </label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  pattern="\d{12}"
                  value={formLrn}
                  onChange={(e) => {
                    setFormLrn(e.target.value.replace(/\D/g, ''));
                    if (archivedDuplicateId) setArchivedDuplicateId(null);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. 101234567890"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 font-mono text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  Must be exactly 12 numeric digits matching LIS registry.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Section Assignment
                </label>
                <select
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800"
                >
                  {sectionsList.map((sec) => (
                    <option key={sec.id} value={sec.name}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={handleAttemptCloseAddModal}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{editingStudent ? 'Save Changes' : 'Enroll Learner'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Discard Unsaved Changes Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        onConfirm={handleConfirmDiscard}
        title="Discard unsaved changes?"
        description="You have entered learner details that will be lost if you exit now. Are you sure you want to discard them?"
        actionType="neutral"
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
      />

      {/* Bulk Add Learners Modal */}
      <BulkAddStudentsModal
        isOpen={isBulkAddOpen}
        onClose={() => setIsBulkAddOpen(false)}
        onSuccess={() => fetchStudents()}
        existingStudents={students}
        sections={sectionsList}
      />
    </div>
  );
}
