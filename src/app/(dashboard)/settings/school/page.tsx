'use client';

import {
    DEFAULT_SHS_WEIGHTS,
    getSavedGradingWeights,
    GradeComponentWeights,
    saveGradingWeights,
    TRACK_WEIGHT_PRESETS,
} from '@/lib/deped-grading';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
    Archive,
    ArchiveRestore,
    Award,
    BookOpen,
    CheckCircle2,
    FileSpreadsheet,
    GraduationCap,
    Layers,
    Loader2,
    Plus,
    RotateCcw,
    Save,
    School,
    Trash2,
    Users,
    X,
    XCircle,
} from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import React, { useEffect, useMemo, useState } from 'react';

interface SectionItem {
  id: string;
  name: string;
  grade: string;
  strand_code: string;
  is_advisory: boolean;
  student_count: number;
  is_archived?: boolean;
  archived_at?: string;
}

interface SubjectItem {
  id: string;
  code: string;
  title: string;
  grade: string;
  target_hours?: number;
  target_items?: number;
}

export default function SchoolSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [configId, setConfigId] = useState<string>('');
  const [facultyId, setFacultyId] = useState<string | null>(null);
  const [schoolYear, setSchoolYear] = useState('2025-2026');
  const [term, setTerm] = useState('1st Quarter');
  const [facultyName, setFacultyName] = useState('');
  const [designation, setDesignation] = useState('Subject Teacher');
  const [approverName, setApproverName] = useState('');

  const { toast } = useToast();
  const [sectionsList, setSectionsList] = useState<SectionItem[]>([]);
  const [sectionsTab, setSectionsTab] = useState<'active' | 'archived'>('active');
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set());
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionGrade, setNewSectionGrade] = useState('11');
  const [newSectionStrand, setNewSectionStrand] = useState('STEM');
  const [newSectionAdvisory, setNewSectionAdvisory] = useState(false);
  const [addingSection, setAddingSection] = useState(false);

  // Bulk Sections State
  const [isBulkSectionsOpen, setIsBulkSectionsOpen] = useState(false);
  const [bulkSectionsText, setBulkSectionsText] = useState('');
  const [bulkSectionGrade, setBulkSectionGrade] = useState('11');
  const [bulkSectionStrand, setBulkSectionStrand] = useState('STEM');
  const [bulkPrefixGrade, setBulkPrefixGrade] = useState(true);
  const [addingBulkSections, setAddingBulkSections] = useState(false);
  const [bulkSectionResult, setBulkSectionResult] = useState<{
    createdCount: number;
    failedRows: { name: string; reason: string }[];
  } | null>(null);

  // Section Confirmation Modal State
  const [sectionConfirmModal, setSectionConfirmModal] = useState<{
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
  const [sectionOperating, setSectionOperating] = useState(false);
  const [needsMigration, setNeedsMigration] = useState(false);

  // DepEd SHS Grading Weights State
  const [weights, setWeights] = useState<GradeComponentWeights>(DEFAULT_SHS_WEIGHTS);

  // Subjects Management State
  const [subjectsList, setSubjectsList] = useState<SubjectItem[]>([]);
  const [isAddSubjectOpen, setIsAddSubjectOpen] = useState(false);
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newSubjectTitle, setNewSubjectTitle] = useState('');
  const [newSubjectGrade, setNewSubjectGrade] = useState('11');
  const [newSubjectHours, setNewSubjectHours] = useState('80');
  const [newSubjectItems, setNewSubjectItems] = useState('50');
  const [addingSubject, setAddingSubject] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<SubjectItem | null>(null);
  const [deletingSubject, setDeletingSubject] = useState(false);

  const supabase = createClient();

  const refreshSections = async (targetConfigId?: string) => {
    const cfgId = targetConfigId || configId;
    if (!cfgId) return;
    try {
      const { data: sData, error: sErr } = await (supabase as any)
        .from('sections')
        .select('id, name, grade, strand_code, is_advisory, student_count, is_archived, archived_at')
        .eq('config_id', cfgId)
        .order('grade', { ascending: true })
        .order('name', { ascending: true });

      if (sErr) {
        setNeedsMigration(true);
        const { data: fallbackData } = await (supabase as any)
          .from('sections')
          .select('id, name, grade, strand_code, is_advisory, student_count')
          .eq('config_id', cfgId)
          .order('grade', { ascending: true })
          .order('name', { ascending: true });
        if (fallbackData) {
          setSectionsList(fallbackData.map((s: any) => ({ ...s, is_archived: false })));
        }
      } else if (sData) {
        setNeedsMigration(false);
        setSectionsList(sData.map((s: any) => ({ ...s, is_archived: Boolean(s.is_archived) })));
      }
    } catch (e) {
      console.error('Failed to refresh sections:', e);
    }
  };

  useEffect(() => {
    async function loadSchoolSettings() {
      setLoading(true);
      setError(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('tenant_id, display_name')
          .eq('id', user?.id || '')
          .maybeSingle();

        const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

        // 1. Fetch active academic config
        const { data: config } = await (supabase as any)
          .from('academic_configs')
          .select('id, school_year, term')
          .eq('tenant_id', tenantId)
          .limit(1)
          .maybeSingle();

        if (config) {
          setConfigId(config.id);
          if (config.school_year) setSchoolYear(config.school_year);
          if (config.term) setTerm(config.term);

          // 2. Fetch faculty record for this config
          const { data: fac } = await (supabase as any)
            .from('faculty')
            .select('id, teacher_name, designation, approver_name')
            .eq('config_id', config.id)
            .limit(1)
            .maybeSingle();

          if (fac) {
            setFacultyId(fac.id);
            setFacultyName(fac.teacher_name || profile?.display_name || '');
            setDesignation(fac.designation || 'Subject Teacher');
            setApproverName(fac.approver_name || 'Principal / Department Head');
          } else {
            setFacultyName(profile?.display_name || 'Teacher');
            setApproverName('Principal / Department Head');
          }

          // 3. Fetch sections for this config
          await refreshSections(config.id);

          // 4. Fetch subjects for this config
          const { data: subData } = await (supabase as any)
            .from('subjects')
            .select('id, code, title, grade, target_hours, target_items')
            .eq('config_id', config.id)
            .order('grade', { ascending: true })
            .order('code', { ascending: true });

          if (subData) {
            setSubjectsList(subData);
          }
        }

        // 4. Load persistent default grading weights
        setWeights(getSavedGradingWeights());
      } catch (err: any) {
        console.error('Failed to load school settings:', err);
        setError(err.message || 'Failed to load school configuration');
      } finally {
        setLoading(false);
      }
    }

    loadSchoolSettings();
  }, [supabase]);

  // Compute total weights percentage
  const totalWeightsPercent = useMemo(() => {
    return Math.round(
      (weights.writtenWorks + weights.performanceTasks + weights.quarterlyAssessment) * 100
    );
  }, [weights]);

  // Save Settings
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      // 1. Update academic config
      if (configId) {
        const { error: confErr } = await (supabase as any)
          .from('academic_configs')
          .update({
            school_year: schoolYear.trim(),
            term: term.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', configId);

        if (confErr) throw confErr;
      }

      // 2. Update or insert faculty record
      if (facultyId) {
        const { error: facErr } = await (supabase as any)
          .from('faculty')
          .update({
            teacher_name: facultyName.trim(),
            designation: designation.trim(),
            approver_name: approverName.trim(),
          })
          .eq('id', facultyId);

        if (facErr) throw facErr;
      } else if (configId) {
        const { data: newFac, error: insErr } = await (supabase as any)
          .from('faculty')
          .insert({
            config_id: configId,
            teacher_name: facultyName.trim(),
            designation: designation.trim(),
            approver_name: approverName.trim(),
          })
          .select()
          .single();

        if (insErr) throw insErr;
        if (newFac) setFacultyId(newFac.id);
      }

      // 3. Persist default grading weights to school storage
      saveGradingWeights(weights);

      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err: any) {
      console.error('Failed to save school settings:', err);
      setError(err.message || 'Could not save configuration');
    } finally {
      setSaving(false);
    }
  };

  // Add Section Handler
  const handleAddSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim() || !configId) return;

    setAddingSection(true);
    try {
      const sectionFullName = newSectionName.startsWith('Grade')
        ? newSectionName.trim()
        : `Grade ${newSectionGrade} - ${newSectionName.trim()}`;

      const { data: created, error: addErr } = await (supabase as any)
        .from('sections')
        .insert({
          config_id: configId,
          name: sectionFullName,
          grade: newSectionGrade,
          strand_code: newSectionStrand,
          is_advisory: newSectionAdvisory,
          student_count: 0,
        })
        .select()
        .single();

      if (addErr) throw addErr;

      if (created) {
        setSectionsList((prev) => [...prev, created]);
        setNewSectionName('');
        setIsAddSectionOpen(false);
      }
    } catch (err: any) {
      console.error('Failed to add section:', err);
      setError(err.message || 'Failed to add section');
    } finally {
      setAddingSection(false);
    }
  };

  // Add Subject Handler
  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectCode.trim() || !newSubjectTitle.trim() || !configId) return;

    setAddingSubject(true);
    try {
      const { data: created, error: addErr } = await (supabase as any)
        .from('subjects')
        .insert({
          config_id: configId,
          code: newSubjectCode.trim().toUpperCase(),
          title: newSubjectTitle.trim(),
          grade: newSubjectGrade,
          target_hours: parseInt(newSubjectHours, 10) || 80,
          target_items: parseInt(newSubjectItems, 10) || 50,
        })
        .select()
        .single();

      if (addErr) throw addErr;

      if (created) {
        setSubjectsList((prev) => [...prev, created]);
        setNewSubjectCode('');
        setNewSubjectTitle('');
        setIsAddSubjectOpen(false);
        toast.success(`Subject "${created.code} - ${created.title}" added successfully!`);
      }
    } catch (err: any) {
      console.error('Failed to add subject:', err);
      toast.error(friendlyError(err, 'Failed to add subject.'));
    } finally {
      setAddingSubject(false);
    }
  };

  // Delete Subject Handler
  const handleDeleteSubject = async () => {
    if (!subjectToDelete) return;
    setDeletingSubject(true);
    try {
      const { error: delErr } = await (supabase as any)
        .from('subjects')
        .delete()
        .eq('id', subjectToDelete.id);

      if (delErr) {
        if (delErr.code === '23503') {
          throw new Error('This subject cannot be deleted because assessments are already linked to it.');
        }
        throw delErr;
      }

      setSubjectsList((prev) => prev.filter((s) => s.id !== subjectToDelete.id));
      toast.success(`Subject "${subjectToDelete.code}" deleted.`);
      setSubjectToDelete(null);
    } catch (err: any) {
      console.error('Failed to delete subject:', err);
      toast.error(friendlyError(err, 'Failed to delete subject.'));
    } finally {
      setDeletingSubject(false);
    }
  };

  // Bulk Sections Parsing & Memo (Item 5: Skip and report empty, duplicates, and existing)
  const parsedBulkSections = useMemo(() => {
    if (!bulkSectionsText) return [];
    const lines = bulkSectionsText.split(/\r?\n/);

    const existingNames = new Set(sectionsList.map((s) => s.name.trim().toLowerCase()));
    const seenInBatch = new Set<string>();

    return lines.map((rawLine, idx) => {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        return {
          rawName: `(Line ${idx + 1})`,
          formattedName: `(Empty line ${idx + 1})`,
          isValid: false,
          error: 'Empty section name (skipped)',
        };
      }

      const formattedName =
        bulkPrefixGrade && !trimmed.toLowerCase().startsWith('grade')
          ? `Grade ${bulkSectionGrade} - ${trimmed}`
          : trimmed;
      const lower = formattedName.toLowerCase();
      let error: string | null = null;
      if (existingNames.has(lower)) {
        error = 'Already exists in school records (including archived)';
      } else if (seenInBatch.has(lower)) {
        error = 'Duplicate in pasted list';
      } else {
        seenInBatch.add(lower);
      }

      return {
        rawName: trimmed,
        formattedName,
        isValid: !error,
        error,
      };
    });
  }, [bulkSectionsText, bulkSectionGrade, bulkPrefixGrade, sectionsList]);

  const validBulkSections = useMemo(
    () => parsedBulkSections.filter((s) => s.isValid),
    [parsedBulkSections]
  );

  const handleSaveBulkSections = async () => {
    if (validBulkSections.length === 0 || !configId) return;
    setAddingBulkSections(true);

    let createdCount = 0;
    const failures: { name: string; reason: string }[] = [];

    const recordsToInsert = validBulkSections.map((s) => ({
      config_id: configId,
      name: s.formattedName,
      grade: bulkSectionGrade,
      strand_code: bulkSectionStrand,
      is_advisory: false,
      student_count: 0,
    }));

    // Insert in chunks of 200 with per-row retry on failure (Item 5)
    const CHUNK_SIZE = 200;

    try {
      for (let i = 0; i < recordsToInsert.length; i += CHUNK_SIZE) {
        const chunk = recordsToInsert.slice(i, i + CHUNK_SIZE);
        const { error: chunkErr } = await (supabase as any)
          .from('sections')
          .insert(chunk);

        if (!chunkErr) {
          createdCount += chunk.length;
        } else {
          // Retry chunk row-by-row on failure so one bad row doesn't block the others
          for (const row of chunk) {
            const { error: singleErr } = await (supabase as any)
              .from('sections')
              .insert(row);

            if (!singleErr) {
              createdCount += 1;
            } else {
              const isDuplicate =
                singleErr.code === '23505' ||
                singleErr.message?.includes('23505') ||
                singleErr.message?.includes('duplicate key');

              failures.push({
                name: row.name,
                reason: isDuplicate
                  ? 'Section already exists in school records.'
                  : friendlyError(singleErr, 'Failed to create section.'),
              });
            }
          }
        }
      }

      setBulkSectionResult({
        createdCount,
        failedRows: failures,
      });

      if (createdCount > 0) {
        toast.success(`Successfully enrolled ${createdCount} class section(s)!`);
      }
    } catch (err: any) {
      console.error('Failed to bulk add sections:', err);
      setBulkSectionResult({
        createdCount,
        failedRows: [
          ...failures,
          {
            name: 'Remaining sections',
            reason: friendlyError(err, 'Bulk section enrollment failed unexpectedly.'),
          },
        ],
      });
      toast.error(friendlyError(err, 'Failed to add sections.'));
    } finally {
      // Always refresh the list afterward (Item 5)
      await refreshSections();
      setAddingBulkSections(false);
    }
  };

  // Active vs Archived Sections Memo
  const activeSections = useMemo(
    () => sectionsList.filter((s) => !s.is_archived),
    [sectionsList]
  );

  const archivedSections = useMemo(
    () => sectionsList.filter((s) => Boolean(s.is_archived)),
    [sectionsList]
  );

  const displayedSections = useMemo(
    () => (sectionsTab === 'active' ? activeSections : archivedSections),
    [sectionsTab, activeSections, archivedSections]
  );

  // Section Selection
  const allSectionsSelected =
    displayedSections.length > 0 &&
    displayedSections.every((s) => selectedSectionIds.has(s.id));

  const toggleSelectAllSections = () => {
    if (allSectionsSelected) {
      setSelectedSectionIds(new Set());
    } else {
      const newSet = new Set(selectedSectionIds);
      displayedSections.forEach((s) => newSet.add(s.id));
      setSelectedSectionIds(newSet);
    }
  };

  const toggleSelectSection = (id: string) => {
    const newSet = new Set(selectedSectionIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSectionIds(newSet);
  };

  // Section Archive Triggers
  const triggerArchiveSections = (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedSectionIds);
    if (targetIds.length === 0) return;

    setSectionConfirmModal({
      isOpen: true,
      action: 'archive',
      targetIds,
      title: targetIds.length > 1 ? `Archive ${targetIds.length} Sections?` : 'Archive Section?',
      description:
        targetIds.length > 1
          ? `Are you sure you want to archive these ${targetIds.length} sections? They will be moved to the Archived Sections list and can be restored anytime without losing student records.`
          : 'Are you sure you want to archive this section? It will be moved to the Archived Sections list and can be restored anytime.',
      affectedCount: targetIds.length,
    });
  };

  const triggerRestoreSections = (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedSectionIds);
    if (targetIds.length === 0) return;

    setSectionConfirmModal({
      isOpen: true,
      action: 'restore',
      targetIds,
      title: targetIds.length > 1 ? `Restore ${targetIds.length} Sections?` : 'Restore Section?',
      description:
        targetIds.length > 1
          ? `Are you sure you want to restore these ${targetIds.length} sections back to active use?`
          : 'Are you sure you want to restore this section back to active use?',
      affectedCount: targetIds.length,
    });
  };

  const triggerDeleteSections = (ids?: string[]) => {
    const targetIds = ids || Array.from(selectedSectionIds);
    if (targetIds.length === 0) return;

    setSectionConfirmModal({
      isOpen: true,
      action: 'delete',
      targetIds,
      title:
        targetIds.length > 1
          ? `Permanently Delete ${targetIds.length} Sections?`
          : 'Permanently Delete Section?',
      description:
        'This action permanently erases the selected section(s) from the database. This action CANNOT be undone.',
      affectedCount: targetIds.length,
    });
  };

  // Execute Section Action
  const handleExecuteSectionAction = async () => {
    const { action, targetIds } = sectionConfirmModal;
    if (targetIds.length === 0) return;

    setSectionOperating(true);
    setError(null);
    try {
      // 1. Try server-side API endpoint
      const res = await fetch('/api/sections/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, sectionIds: targetIds }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to ${action} section(s)`);
      }

      setSectionsList((prev) => {
        if (action === 'archive') {
          return prev.map((s) => (targetIds.includes(s.id) ? { ...s, is_archived: true } : s));
        } else if (action === 'restore') {
          return prev.map((s) => (targetIds.includes(s.id) ? { ...s, is_archived: false } : s));
        } else {
          return prev.filter((s) => !targetIds.includes(s.id));
        }
      });

      setSectionConfirmModal((prev) => ({ ...prev, isOpen: false }));
      setSelectedSectionIds(new Set());
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err: any) {
      console.error('Section operation error:', err);
      setError(`Section action failed: ${err.message || err}`);
    } finally {
      setSectionOperating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          School Academic Settings
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Configure active academic periods, grade &amp; sections, DepEd grading component weights, and faculty signatories.
        </p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>Academic configuration successfully saved to Supabase!</span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {needsMigration && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          Archive needs migration 20260908000005 applied.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-xs text-gray-400">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span>Loading academic context from Supabase...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Card 1: Current Academic Period */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
              <School className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                Current Academic Period
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  School Year
                </label>
                <input
                  type="text"
                  required
                  value={schoolYear}
                  onChange={(e) => setSchoolYear(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Grading Period / Term
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                >
                  <option value="1st Quarter" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">1st Quarter</option>
                  <option value="2nd Quarter" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">2nd Quarter</option>
                  <option value="3rd Quarter" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">3rd Quarter</option>
                  <option value="4th Quarter" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">4th Quarter</option>
                  <option value="First Semester" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">First Semester</option>
                  <option value="Second Semester" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Second Semester</option>
                  <option value="Midterm" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Midterm</option>
                  <option value="Finals" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Finals</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Grades & Sections Management */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <GraduationCap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                    Grade Levels &amp; Class Sections
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Active classes and learner cohorts enrolled under this academic year.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsBulkSectionsOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-850 dark:text-gray-300 dark:hover:bg-gray-800 shadow-xs transition"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Bulk Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsAddSectionOpen(!isAddSectionOpen)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Section</span>
                </button>
              </div>
            </div>

            {/* View Tabs: Active Sections vs Archived Sections */}
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pt-1 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSectionsTab('active');
                    setSelectedSectionIds(new Set());
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition',
                    sectionsTab === 'active'
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Active Sections</span>
                  <span className="ml-1 rounded-full px-1.5 py-0.2 font-mono text-[10px] bg-blue-200/60 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200">
                    {activeSections.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSectionsTab('archived');
                    setSelectedSectionIds(new Set());
                  }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition',
                    sectionsTab === 'archived'
                      ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  )}
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span>Archived Sections</span>
                  <span className="ml-1 rounded-full px-1.5 py-0.2 font-mono text-[10px] bg-amber-200/60 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                    {archivedSections.length}
                  </span>
                </button>
              </div>

              {displayedSections.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllSections}
                  className="text-[11px] font-semibold text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                >
                  {allSectionsSelected ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {/* Bulk Actions Bar for Sections */}
            {selectedSectionIds.size > 0 && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-blue-50 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-900/50">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white font-mono text-[11px] font-bold">
                    {selectedSectionIds.size}
                  </span>
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    {selectedSectionIds.size} section{selectedSectionIds.size > 1 ? 's' : ''} selected
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {sectionsTab === 'active' ? (
                    <button
                      type="button"
                      onClick={() => triggerArchiveSections()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      <span>Archive Selected ({selectedSectionIds.size})</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => triggerRestoreSections()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700 transition"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Restore Selected ({selectedSectionIds.size})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerDeleteSections()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Permanently Delete ({selectedSectionIds.size})</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Inline Add Section Form */}
            {isAddSectionOpen && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
                <span className="font-bold text-xs text-gray-900 dark:text-white">
                  Create New Class Section
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Section Name (e.g. Einstein)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Einstein or Hawking"
                      value={newSectionName}
                      onChange={(e) => setNewSectionName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Grade Level
                    </label>
                    <select
                      value={newSectionGrade}
                      onChange={(e) => setNewSectionGrade(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                    >
                      <option value="11" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Grade 11</option>
                      <option value="12" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Grade 12</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Academic Strand
                    </label>
                    <select
                      value={newSectionStrand}
                      onChange={(e) => setNewSectionStrand(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                    >
                      <option value="STEM" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">STEM</option>
                      <option value="ABM" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">ABM</option>
                      <option value="HUMSS" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">HUMSS</option>
                      <option value="TVL" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">TVL</option>
                      <option value="GAS" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">GAS</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={newSectionAdvisory}
                      onChange={(e) => setNewSectionAdvisory(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
                    />
                    <span>Designate as Advisory Class</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddSectionOpen(false)}
                      className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddSection}
                      disabled={addingSection || !newSectionName.trim()}
                      className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addingSection ? 'Creating…' : 'Add Section'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sections List Grid */}
            {displayedSections.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center border border-dashed rounded-2xl dark:border-gray-800">
                {sectionsTab === 'active'
                  ? 'No active sections registered. Click "Add Section" to enroll your grade levels and classes.'
                  : 'No sections have been archived.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {displayedSections.map((sec) => {
                  const isSelected = selectedSectionIds.has(sec.id);
                  return (
                    <div
                      key={sec.id}
                      className={cn(
                        'flex items-center justify-between p-3.5 rounded-2xl border transition',
                        isSelected
                          ? 'border-blue-400 bg-blue-50/50 dark:border-blue-700 dark:bg-blue-950/30'
                          : 'border-gray-100 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-800/40 hover:border-gray-200 dark:hover:border-gray-700'
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectSection(sec.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 shrink-0"
                          aria-label={`Select ${sec.name}`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                              {sec.name}
                            </span>
                            {sec.is_advisory && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
                                Advisory
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                            <span className="font-semibold text-blue-600 dark:text-blue-400">
                              Grade {sec.grade}
                            </span>
                            <span>•</span>
                            <span className="font-mono">{sec.strand_code}</span>
                          </div>
                        </div>
                      </div>

                      {/* Section Action Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {sectionsTab === 'active' ? (
                          <button
                            type="button"
                            onClick={() => triggerArchiveSections([sec.id])}
                            className="inline-flex items-center gap-1 p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-950/30 rounded-lg transition"
                            title="Archive Section (soft delete)"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => triggerRestoreSections([sec.id])}
                              className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg transition"
                              title="Restore Section"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => triggerDeleteSections([sec.id])}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 rounded-lg transition"
                              title="Permanently Delete Section"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Card 3: Subjects & Learning Areas */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                    Subjects &amp; Learning Areas
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Courses and learning areas available for Table of Specifications and test creation.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddSubjectOpen(!isAddSubjectOpen)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Subject</span>
                </button>
              </div>
            </div>

            {/* Inline Add Subject Form */}
            {isAddSubjectOpen && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-3">
                <span className="font-bold text-xs text-gray-900 dark:text-white">
                  Add New Subject / Learning Area
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Subject Code (e.g. EMP-TECH)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. EMPTECH or GENMATH"
                      value={newSubjectCode}
                      onChange={(e) => setNewSubjectCode(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs text-gray-900 uppercase outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Subject Title
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Empowerment Technologies"
                      value={newSubjectTitle}
                      onChange={(e) => setNewSubjectTitle(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Grade Level
                    </label>
                    <select
                      value={newSubjectGrade}
                      onChange={(e) => setNewSubjectGrade(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                    >
                      <option value="11" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Grade 11</option>
                      <option value="12" className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">Grade 12</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Target Items
                    </label>
                    <input
                      type="number"
                      min="10"
                      max="100"
                      value={newSubjectItems}
                      onChange={(e) => setNewSubjectItems(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddSubjectOpen(false)}
                    className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddSubject}
                    disabled={addingSubject || !newSubjectCode.trim() || !newSubjectTitle.trim()}
                    className="rounded-xl bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {addingSubject ? 'Adding…' : 'Add Subject'}
                  </button>
                </div>
              </div>
            )}

            {/* Subjects List Grid */}
            {subjectsList.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center border border-dashed rounded-2xl dark:border-gray-800">
                No subjects registered. Click &quot;Add Subject&quot; to register courses for your school.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {subjectsList.map((subj) => (
                  <div
                    key={subj.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-850 hover:border-blue-300 dark:hover:border-blue-700 transition"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">
                          {subj.code}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          Grade {subj.grade}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                        {subj.title}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        <span>{subj.target_items || 50} items</span>
                        <span>•</span>
                        <span>{subj.target_hours || 80} hrs</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSubjectToDelete(subj)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 rounded-lg transition"
                      title="Delete Subject"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 4: DepEd Senior High School Component Weights */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <Award className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                    DepEd Senior High School Component Weights
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Defines default weights for Written Works, Performance Tasks, and Quarterly Exams (DepEd Order No. 8, s. 2015).
                  </p>
                </div>
              </div>

              {/* Total Percentage Indicator Badge */}
              <span
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-bold font-mono self-start sm:self-auto',
                  totalWeightsPercent === 100
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                )}
              >
                Total: {totalWeightsPercent}% {totalWeightsPercent === 100 ? '✓ Valid' : '⚠ Must be 100%'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Track Preset
                </label>
                <select
                  onChange={(e) => {
                    const preset = TRACK_WEIGHT_PRESETS[e.target.value];
                    if (preset) setWeights(preset.weights);
                  }}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                >
                  {Object.entries(TRACK_WEIGHT_PRESETS).map(([key, val]) => (
                    <option key={key} value={key} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">
                      {val.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Written Works (Quizzes) %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(weights.writtenWorks * 100)}
                  onChange={(e) =>
                    setWeights({
                      ...weights,
                      writtenWorks: (parseFloat(e.target.value) || 0) / 100,
                    })
                  }
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Performance Tasks (Activities) %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(weights.performanceTasks * 100)}
                  onChange={(e) =>
                    setWeights({
                      ...weights,
                      performanceTasks: (parseFloat(e.target.value) || 0) / 100,
                    })
                  }
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Quarterly Exam (OMR Test) %
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={Math.round(weights.quarterlyAssessment * 100)}
                  onChange={(e) =>
                    setWeights({
                      ...weights,
                      quarterlyAssessment: (parseFloat(e.target.value) || 0) / 100,
                    })
                  }
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Faculty Profile & Signatories */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                Faculty Profile &amp; Test Signatories
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Teacher Name (Test Creator)
                </label>
                <input
                  type="text"
                  required
                  value={facultyName}
                  onChange={(e) => setFacultyName(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Official Designation
                </label>
                <input
                  type="text"
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Approving Authority (Principal / Dept. Head)
              </label>
              <input
                type="text"
                value={approverName}
                onChange={(e) => setApproverName(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
              />
              <span className="mt-1 block text-[11px] text-gray-400">
                Printed as the official signatory on Table of Specifications documents.
              </span>
            </div>
          </div>

          {/* Form Action Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save Academic Configuration</span>
            </button>
          </div>
        </form>
      )}

      {/* Confirmation Modal for Section Archive / Restore / Delete */}
      <ConfirmationModal
        isOpen={sectionConfirmModal.isOpen}
        onClose={() => setSectionConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={handleExecuteSectionAction}
        title={sectionConfirmModal.title}
        description={sectionConfirmModal.description}
        affectedCount={sectionConfirmModal.affectedCount}
        entityName="section"
        actionType={sectionConfirmModal.action}
        isLoading={sectionOperating}
      />

      {/* Confirmation Modal for Subject Delete */}
      <ConfirmationModal
        isOpen={subjectToDelete !== null}
        onClose={() => setSubjectToDelete(null)}
        onConfirm={handleDeleteSubject}
        title={subjectToDelete ? `Delete Subject ${subjectToDelete.code}?` : 'Delete Subject?'}
        description={`Are you sure you want to delete "${subjectToDelete?.title || ''}"? This action cannot be undone.`}
        actionType="delete"
        entityName="subject"
        affectedCount={1}
        impactTitle="Subject Removed"
        impactText="The course will no longer appear as an option when creating new assessments."
        confirmLabel="Delete Subject"
        isLoading={deletingSubject}
      />

      {/* Bulk Add Sections Modal Dialog */}
      {isBulkSectionsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900 my-8 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Bulk Add Class Sections
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Paste multiple section names to quickly populate your cohort list.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBulkSectionsText('');
                  setIsBulkSectionsOpen(false);
                }}
                disabled={addingBulkSections}
                className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body: Result Summary or Input Form */}
            {bulkSectionResult ? (
              <div className="space-y-4 py-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30 flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                      Enrolled {bulkSectionResult.createdCount} Section(s) Successfully
                    </h3>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                      The class roster list has been refreshed with the new section records.
                    </p>
                  </div>
                </div>

                {bulkSectionResult.failedRows.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                      Failed Records ({bulkSectionResult.failedRows.length})
                    </span>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-red-200 dark:border-red-900/50 p-2 divide-y divide-gray-100 dark:divide-gray-800 bg-red-50/30 dark:bg-red-950/20">
                      {bulkSectionResult.failedRows.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1.5 px-2 text-xs">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{f.name}</span>
                          <span className="text-red-600 dark:text-red-400 text-[11px] font-medium">{f.reason}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkSectionResult(null);
                      setBulkSectionsText('');
                      setIsBulkSectionsOpen(false);
                    }}
                    className="rounded-xl bg-blue-600 px-6 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Config Options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Default Grade Level
                    </label>
                    <select
                      value={bulkSectionGrade}
                      onChange={(e) => setBulkSectionGrade(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="11">Grade 11</option>
                      <option value="12">Grade 12</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                      Academic Strand
                    </label>
                    <select
                      value={bulkSectionStrand}
                      onChange={(e) => setBulkSectionStrand(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="STEM">STEM</option>
                      <option value="ABM">ABM</option>
                      <option value="HUMSS">HUMSS</option>
                      <option value="TVL">TVL</option>
                      <option value="GAS">GAS</option>
                    </select>
                  </div>
                </div>

                {/* Checkbox for Prefix */}
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={bulkPrefixGrade}
                    onChange={(e) => setBulkPrefixGrade(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800"
                  />
                  <span>Automatically prefix with &quot;Grade {bulkSectionGrade} - [Name]&quot;</span>
                </label>

                {/* Multi-line Paste Input */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Section Names (one per line)
                  </label>
                  <textarea
                    rows={5}
                    value={bulkSectionsText}
                    onChange={(e) => setBulkSectionsText(e.target.value)}
                    disabled={addingBulkSections}
                    placeholder={`Diamond\nEmerald\nRuby\nSapphire\nTopaz`}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 p-3 font-mono text-xs text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-800 resize-y"
                  />
                </div>

                {/* Preview of Parsed Sections */}
                {parsedBulkSections.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-gray-700 dark:text-gray-300">
                        Preview ({validBulkSections.length} valid of {parsedBulkSections.length} total)
                      </span>
                    </div>
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-800 p-2 divide-y divide-gray-100 dark:divide-gray-800 bg-gray-50/50 dark:bg-gray-850/30">
                      {parsedBulkSections.map((sec, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between py-1.5 px-2 text-xs"
                        >
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {sec.formattedName}
                          </span>
                          {sec.isValid ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>{sec.error}</span>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setBulkSectionsText('');
                      setBulkSectionResult(null);
                      setIsBulkSectionsOpen(false);
                    }}
                    disabled={addingBulkSections}
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveBulkSections}
                    disabled={addingBulkSections || validBulkSections.length === 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {addingBulkSections ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Creating Sections...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4" />
                        <span>Create {validBulkSections.length > 0 ? validBulkSections.length : ''} Sections</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
