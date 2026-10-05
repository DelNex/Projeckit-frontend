'use client';

import { ColumnDef, DataTable } from '@/components/ui/data-table';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
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
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active vs Archive view
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [sectionsList, setSectionsList] = useState<{ id: string; name: string }[]>([]);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Form State
  const [formLrn, setFormLrn] = useState('');
  const [formName, setFormName] = useState('');
  const [formSection, setFormSection] = useState('');

  const supabase = createClient();

  // Storage key for client-side archive fallback if database column is in migration
  const ARCHIVE_STORAGE_KEY = 'projectkit_archived_students_cache';

  const getLocalArchivedIds = (): Set<string> => {
    try {
      const stored = localStorage.getItem(ARCHIVE_STORAGE_KEY);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  };

  const setLocalArchivedIds = (ids: Set<string>) => {
    try {
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(Array.from(ids)));
    } catch {}
  };

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Try querying with is_archived and archived_at
      let fetchedStudents: StudentRecord[] = [];
      const { data, error: err } = await (supabase as any)
        .from('students')
        .select('id, lrn, name, section_name, is_archived, archived_at, created_at')
        .order('name', { ascending: true });

      if (err) {
        // Fallback for older database schema without is_archived column
        console.warn('Querying without is_archived column fallback:', err.message);
        const { data: fallbackData, error: fbErr } = await supabase
          .from('students')
          .select('id, lrn, name, section_name, created_at')
          .order('name', { ascending: true });

        if (fbErr) throw fbErr;

        const localArchived = getLocalArchivedIds();
        fetchedStudents = (fallbackData || []).map((s) => ({
          ...s,
          is_archived: localArchived.has(s.id),
        }));
      } else {
        const localArchived = getLocalArchivedIds();
        fetchedStudents = (data || []).map((s: any) => ({
          ...s,
          is_archived: Boolean(s.is_archived || localArchived.has(s.id)),
        }));
      }

      setStudents(fetchedStudents);
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
      const { data } = await supabase.from('sections').select('id, name');
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

  // Selection handlers
  const allVisibleSelected =
    displayedStudents.length > 0 &&
    displayedStudents.every((s) => selectedIds.has(s.id));

  const someVisibleSelected =
    displayedStudents.some((s) => selectedIds.has(s.id)) && !allVisibleSelected;

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      const newSet = new Set(selectedIds);
      displayedStudents.forEach((s) => newSet.add(s.id));
      setSelectedIds(newSet);
    }
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
    if (sectionsList.length > 0) setFormSection(sectionsList[0].name);
    setIsAddModalOpen(true);
  };

  const openEditModal = (student: StudentRecord) => {
    setEditingStudent(student);
    setFormLrn(student.lrn);
    setFormName(student.name);
    setFormSection(student.section_name);
    setIsAddModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLrn.trim() || !formName.trim() || !formSection) return;

    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();

      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      const { data: config } = await supabase
        .from('academic_configs')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();

      const configId = config?.id || 'c0000000-0000-0000-0000-000000000001';

      if (editingStudent) {
        const { error: updErr } = await supabase
          .from('students')
          .update({
            lrn: formLrn.trim(),
            name: formName.trim(),
            section_name: formSection,
          })
          .eq('id', editingStudent.id);

        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await supabase.from('students').insert({
          tenant_id: tenantId,
          config_id: configId,
          lrn: formLrn.trim(),
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
      alert(`Error saving student: ${err.message || err}`);
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

  // Execute confirmed action (Archive, Restore, or Permanent Delete)
  const handleExecuteConfirmedAction = async () => {
    const { action, targetIds } = confirmModal;
    if (targetIds.length === 0) return;

    setIsOperating(true);
    try {
      // 1. Try server-side protected API endpoint first
      const res = await fetch('/api/students/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, studentIds: targetIds }),
      });

      if (!res.ok) {
        // Fallback directly to Supabase client if API route fails
        if (action === 'archive') {
          const { error: updErr } = await (supabase as any)
            .from('students')
            .update({
              is_archived: true,
              archived_at: new Date().toISOString(),
            })
            .in('id', targetIds);

          if (updErr) {
            // Local fallback
            const localArchived = getLocalArchivedIds();
            targetIds.forEach((id) => localArchived.add(id));
            setLocalArchivedIds(localArchived);
          }
        } else if (action === 'restore') {
          const { error: updErr } = await (supabase as any)
            .from('students')
            .update({
              is_archived: false,
              archived_at: null,
            })
            .in('id', targetIds);

          if (updErr) {
            const localArchived = getLocalArchivedIds();
            targetIds.forEach((id) => localArchived.delete(id));
            setLocalArchivedIds(localArchived);
          }
        } else if (action === 'delete') {
          const { error: delErr } = await supabase
            .from('students')
            .delete()
            .in('id', targetIds);
          if (delErr) throw delErr;
        }
      }

      // Sync local storage cache
      const localArchived = getLocalArchivedIds();
      if (action === 'archive') {
        targetIds.forEach((id) => localArchived.add(id));
      } else if (action === 'restore') {
        targetIds.forEach((id) => localArchived.delete(id));
      } else if (action === 'delete') {
        targetIds.forEach((id) => localArchived.delete(id));
      }
      setLocalArchivedIds(localArchived);

      // Success notification
      const count = targetIds.length;
      if (action === 'archive') {
        setSuccessMessage(`Archived ${count} learner${count > 1 ? 's' : ''}.`);
      } else if (action === 'restore') {
        setSuccessMessage(`Restored ${count} learner${count > 1 ? 's' : ''} to active roster.`);
      } else {
        setSuccessMessage(`Permanently deleted ${count} learner${count > 1 ? 's' : ''}.`);
      }
      setTimeout(() => setSuccessMessage(null), 4000);

      setConfirmModal((prev) => ({ ...prev, isOpen: false }));
      setSelectedIds(new Set());
      await fetchStudents();
    } catch (err: any) {
      console.error('Operation error:', err);
      alert(`Action failed: ${err.message || err}`);
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
            checked={allVisibleSelected}
            ref={(el) => {
              if (el) el.indeterminate = someVisibleSelected;
            }}
            onChange={toggleSelectAllVisible}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
            aria-label="Select all learners"
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
    [activeTab, selectedIds, allVisibleSelected, someVisibleSelected, displayedStudents]
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
      {selectedIds.size > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-blue-50/90 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/60 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white font-mono text-xs font-bold">
              {selectedIds.size}
            </span>
            <span className="text-xs font-bold text-gray-900 dark:text-white">
              {selectedIds.size} learner{selectedIds.size > 1 ? 's' : ''} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400 ml-2"
            >
              Clear Selection
            </button>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'active' ? (
              <button
                type="button"
                onClick={() => triggerArchiveSelected()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-amber-700 transition"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archive Selected ({selectedIds.size})</span>
              </button>
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
      )}

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
        searchKey="name"
        searchPlaceholder={
          activeTab === 'active'
            ? 'Search active learners...'
            : 'Search archived learners...'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {editingStudent ? 'Edit Learner' : 'Add New Learner'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4 pt-4 text-xs">
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
                  onChange={(e) => setFormLrn(e.target.value.replace(/\D/g, ''))}
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
                  onClick={() => setIsAddModalOpen(false)}
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
    </div>
  );
}
