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
    ArrowUp,
    ArrowDown,
    Edit2,
    Check,
    Calendar,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
} from 'lucide-react';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { getTenantContext } from '@/lib/tenant-context';
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

interface GradingPeriodItem {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  position: number;
  is_current: boolean;
  is_archived: boolean;
}

export default function SchoolSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenantId, setTenantId] = useState<string>('');
  const [configId, setConfigId] = useState<string>('');
  const [facultyId, setFacultyId] = useState<string | null>(null);
  const [schoolYear, setSchoolYear] = useState('2025-2026');
  const [term, setTerm] = useState('1st Quarter');
  const [facultyName, setFacultyName] = useState('');
  const [designation, setDesignation] = useState('Subject Teacher');
  const [approverName, setApproverName] = useState('');

  // Grading Periods State (C2)
  const [gradingPeriods, setGradingPeriods] = useState<GradingPeriodItem[]>([]);
  const [archivedGradingPeriods, setArchivedGradingPeriods] = useState<GradingPeriodItem[]>([]);
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [rowOperatingId, setRowOperatingId] = useState<string | null>(null);

  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editPeriodName, setEditPeriodName] = useState('');
  const [editPeriodCode, setEditPeriodCode] = useState('');
  const [periodWarningModal, setPeriodWarningModal] = useState<{
    isOpen: boolean;
    periodId: string;
    oldName: string;
    newName: string;
    newCode: string;
    affectedCount: number;
  }>({
    isOpen: false,
    periodId: '',
    oldName: '',
    newName: '',
    newCode: '',
    affectedCount: 0,
  });
  const [savingPeriod, setSavingPeriod] = useState(false);

  // Add Term Modal State
  const [isAddTermModalOpen, setIsAddTermModalOpen] = useState(false);
  const [newTermName, setNewTermName] = useState('');
  const [newTermType, setNewTermType] = useState<'term' | 'semester'>('term');
  const [newTermCode, setNewTermCode] = useState('');
  const [addingTerm, setAddingTerm] = useState(false);

  // Delete / Archive Term Modal State
  const [deleteModalState, setDeleteModalState] = useState<{
    isOpen: boolean;
    period: GradingPeriodItem | null;
    assessmentCount: number;
    tosCount: number;
    totalCount: number;
    targetPeriodId: string;
    loadingUsage: boolean;
    operating: boolean;
  }>({
    isOpen: false,
    period: null,
    assessmentCount: 0,
    tosCount: 0,
    totalCount: 0,
    targetPeriodId: '',
    loadingUsage: false,
    operating: false,
  });

  // Set Current Term Confirmation Modal State
  const [setCurrentConfirmModal, setSetCurrentConfirmModal] = useState<{
    isOpen: boolean;
    period: GradingPeriodItem | null;
  }>({
    isOpen: false,
    period: null,
  });

  // Preset Confirmation Modal State
  const [presetConfirmModal, setPresetConfirmModal] = useState<{
    isOpen: boolean;
    preset: '4quarter' | '2semester';
  }>({
    isOpen: false,
    preset: '4quarter',
  });

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

  const refreshGradingPeriods = async (tId?: string): Promise<GradingPeriodItem[]> => {
    const tid = tId || tenantId;
    if (!tid) return [];
    try {
      setLoadingPeriods(true);
      const [activeRes, archRes] = await Promise.all([
        (supabase as any)
          .from('grading_periods')
          .select('*')
          .eq('tenant_id', tid)
          .eq('is_archived', false)
          .order('position', { ascending: true }),
        (supabase as any)
          .from('grading_periods')
          .select('*')
          .eq('tenant_id', tid)
          .eq('is_archived', true)
          .order('created_at', { ascending: false }),
      ]);

      if (activeRes.error) throw activeRes.error;

      const loadedActive = (activeRes.data as GradingPeriodItem[]) || [];
      const loadedArchived = (archRes.data as GradingPeriodItem[]) || [];

      console.log(`[GradingPeriods] Fetched ${loadedActive.length} active and ${loadedArchived.length} archived periods for tenant: ${tid}`);
      setGradingPeriods(loadedActive);
      setArchivedGradingPeriods(loadedArchived);

      const current = loadedActive.find((p) => p.is_current);
      if (current) {
        setTerm(current.name);
      }
      return loadedActive;
    } catch (e) {
      console.warn('[GradingPeriods] Failed to load grading periods:', e);
      return [];
    } finally {
      setLoadingPeriods(false);
    }
  };

  const handleReorderPeriod = async (periodId: string, direction: 'up' | 'down') => {
    const idx = gradingPeriods.findIndex((p) => p.id === periodId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= gradingPeriods.length) return;

    setRowOperatingId(periodId);
    const currentPeriod = gradingPeriods[idx];
    const targetPeriod = gradingPeriods[targetIdx];

    const newPeriods = [...gradingPeriods];
    newPeriods[idx] = { ...targetPeriod, position: currentPeriod.position };
    newPeriods[targetIdx] = { ...currentPeriod, position: targetPeriod.position };
    setGradingPeriods(newPeriods);

    try {
      await Promise.all([
        (supabase as any)
          .from('grading_periods')
          .update({ position: currentPeriod.position })
          .eq('id', targetPeriod.id),
        (supabase as any)
          .from('grading_periods')
          .update({ position: targetPeriod.position })
          .eq('id', currentPeriod.id),
      ]);
      toast.success('Grading periods reordered.');
    } catch (err: any) {
      console.error('Failed to reorder grading periods:', err);
      toast.error(friendlyError(err, 'Failed to reorder grading periods.'));
      await refreshGradingPeriods();
    } finally {
      setRowOperatingId(null);
    }
  };

  const handleConfirmSetCurrent = async (period: GradingPeriodItem) => {
    if (period.is_current) return;
    setRowOperatingId(period.id);
    try {
      // 1. Try RPC first
      const { error: rpcErr } = await (supabase as any).rpc('set_current_grading_period', {
        p_period_id: period.id,
      });

      if (rpcErr) {
        console.warn('[GradingPeriods] RPC set_current_grading_period fallback:', rpcErr.message);
        await (supabase as any)
          .from('grading_periods')
          .update({ is_current: false })
          .eq('tenant_id', tenantId)
          .eq('is_current', true);

        const { error: updErr } = await (supabase as any)
          .from('grading_periods')
          .update({ is_current: true })
          .eq('id', period.id);

        if (updErr) throw updErr;

        if (configId) {
          await (supabase as any)
            .from('academic_configs')
            .update({ term: period.name, updated_at: new Date().toISOString() })
            .eq('id', configId);
        }
      }

      setTerm(period.name);
      setGradingPeriods((prev) =>
        prev.map((p) => ({
          ...p,
          is_current: p.id === period.id,
        }))
      );
      toast.success(`"${period.name}" is now the active Current Term.`);
      await refreshGradingPeriods();
    } catch (err: any) {
      console.error('Failed to set current period:', err);
      toast.error(friendlyError(err, 'Failed to set current term.'));
    } finally {
      setRowOperatingId(null);
      setSetCurrentConfirmModal({ isOpen: false, period: null });
    }
  };

  const handleRequestSavePeriod = async (
    period: GradingPeriodItem,
    newName: string,
    newCode: string
  ) => {
    const trimmedName = newName.trim();
    let trimmedCode = newCode.trim().toUpperCase();

    if (!trimmedName) {
      toast.error('Period display name cannot be empty.');
      return;
    }

    if (trimmedName.length > 50) {
      toast.error('Period display name cannot exceed 50 characters.');
      return;
    }

    if (!trimmedCode) {
      trimmedCode = trimmedName.toLowerCase().includes('semester')
        ? `S${period.position}`
        : `T${period.position}`;
    }

    // Check case-insensitive uniqueness against other active periods
    const duplicateName = gradingPeriods.some(
      (p) => p.id !== period.id && p.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicateName) {
      toast.error(`A term with the name "${trimmedName}" already exists.`);
      return;
    }

    if (trimmedName === period.name && trimmedCode === period.code) {
      setEditingPeriodId(null);
      return;
    }

    try {
      const { count } = await (supabase as any)
        .from('assessments')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('term', period.name);

      if (count && count > 0 && trimmedName !== period.name) {
        setPeriodWarningModal({
          isOpen: true,
          periodId: period.id,
          oldName: period.name,
          newName: trimmedName,
          newCode: trimmedCode,
          affectedCount: count,
        });
        return;
      }

      await applySavePeriod(period.id, period.name, trimmedName, trimmedCode);
    } catch (err: any) {
      console.error('Failed to check assessment impact:', err);
      toast.error(friendlyError(err, 'Failed to update period.'));
    }
  };

  const applySavePeriod = async (
    periodId: string,
    oldName: string,
    newName: string,
    newCode: string
  ) => {
    setSavingPeriod(true);
    setRowOperatingId(periodId);
    try {
      const { error: updErr } = await (supabase as any)
        .from('grading_periods')
        .update({ name: newName, code: newCode })
        .eq('id', periodId);

      if (updErr) throw updErr;

      if (oldName !== newName) {
        await (supabase as any)
          .from('assessments')
          .update({ term: newName })
          .eq('tenant_id', tenantId)
          .eq('term', oldName);

        await (supabase as any)
          .from('tos_documents')
          .update({ term: newName })
          .eq('tenant_id', tenantId)
          .eq('term', oldName);

        const currentPeriod = gradingPeriods.find((p) => p.id === periodId);
        if (currentPeriod?.is_current) {
          setTerm(newName);
          if (configId) {
            await (supabase as any)
              .from('academic_configs')
              .update({ term: newName, updated_at: new Date().toISOString() })
              .eq('id', configId);
          }
        }
      }

      setEditingPeriodId(null);
      setPeriodWarningModal((prev) => ({ ...prev, isOpen: false }));
      toast.success(`Grading period "${newName}" saved.`);
      await refreshGradingPeriods();
    } catch (err: any) {
      console.error('Failed to save period:', err);
      toast.error(friendlyError(err, 'Failed to save period changes.'));
    } finally {
      setSavingPeriod(false);
      setRowOperatingId(null);
    }
  };

  const handleAddTerm = async () => {
    if (!tenantId) {
      toast.error('Your account is not linked to a school yet.');
      return;
    }

    if (gradingPeriods.length >= 4) {
      toast.error('You can have up to 4 terms. Delete or archive one first.');
      return;
    }

    const trimmedName = newTermName.trim();
    if (!trimmedName) {
      toast.error('Please enter a term name.');
      return;
    }

    if (trimmedName.length > 50) {
      toast.error('Term name cannot exceed 50 characters.');
      return;
    }

    const duplicateName = gradingPeriods.some(
      (p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicateName) {
      toast.error(`A term with the name "${trimmedName}" already exists.`);
      return;
    }

    setAddingTerm(true);
    try {
      const nextPos = gradingPeriods.length + 1;
      let finalCode = newTermCode.trim().toUpperCase();
      if (!finalCode) {
        finalCode = newTermType === 'semester' || trimmedName.toLowerCase().includes('semester')
          ? `S${nextPos}`
          : `T${nextPos}`;
      }

      // 1. Try RPC function
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('add_grading_period', {
        p_name: trimmedName,
        p_code: finalCode,
        p_type: newTermType,
      });

      if (rpcErr) {
        console.warn('[GradingPeriods] RPC add_grading_period fallback:', rpcErr.message);

        // Fallback: direct insert
        const { error: insErr } = await (supabase as any)
          .from('grading_periods')
          .insert({
            tenant_id: tenantId,
            name: trimmedName,
            code: finalCode,
            position: nextPos,
            is_current: false,
            is_archived: false,
          })
          .select('*');

        if (insErr) throw insErr;
      }

      setIsAddTermModalOpen(false);
      setNewTermName('');
      setNewTermCode('');
      toast.success(`Term "${trimmedName}" added successfully.`);
      await refreshGradingPeriods();
    } catch (err: any) {
      console.error('Failed to add grading period:', err);
      toast.error(friendlyError(err, 'Failed to add grading period.'));
    } finally {
      setAddingTerm(false);
    }
  };

  const handleRequestDeletePeriod = async (period: GradingPeriodItem) => {
    if (period.is_current) {
      toast.error('Cannot delete the active current term. Set another term as current first.');
      return;
    }

    if (gradingPeriods.length <= 1) {
      toast.error('At least one term is required.');
      return;
    }

    const otherActivePeriods = gradingPeriods.filter((p) => p.id !== period.id);
    const defaultTargetId = otherActivePeriods.length > 0 ? otherActivePeriods[0].id : '';

    setDeleteModalState({
      isOpen: true,
      period,
      assessmentCount: 0,
      tosCount: 0,
      totalCount: 0,
      targetPeriodId: defaultTargetId,
      loadingUsage: true,
      operating: false,
    });

    try {
      // 1. Try RPC get_grading_period_usage
      const { data: usageData, error: usageErr } = await (supabase as any).rpc('get_grading_period_usage', {
        p_period_id: period.id,
      });

      if (!usageErr && usageData) {
        setDeleteModalState((prev) => ({
          ...prev,
          assessmentCount: usageData.assessment_count || 0,
          tosCount: usageData.tos_count || 0,
          totalCount: usageData.total_count || 0,
          loadingUsage: false,
        }));
      } else {
        // Fallback: client queries
        const [assRes, tosRes] = await Promise.all([
          (supabase as any)
            .from('assessments')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('term', period.name),
          (supabase as any)
            .from('tos_documents')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('term', period.name),
        ]);

        const aCount = assRes.count || 0;
        const tCount = tosRes.count || 0;
        setDeleteModalState((prev) => ({
          ...prev,
          assessmentCount: aCount,
          tosCount: tCount,
          totalCount: aCount + tCount,
          loadingUsage: false,
        }));
      }
    } catch (err: any) {
      console.warn('Failed to load usage counts:', err);
      setDeleteModalState((prev) => ({ ...prev, loadingUsage: false }));
    }
  };

  const handleConfirmDeleteOrArchive = async (action: 'delete' | 'archive' | 'move_and_delete') => {
    const period = deleteModalState.period;
    if (!period) return;

    setDeleteModalState((prev) => ({ ...prev, operating: true }));
    setRowOperatingId(period.id);

    try {
      const { error: rpcErr } = await (supabase as any).rpc('delete_or_archive_grading_period', {
        p_period_id: period.id,
        p_action: action,
        p_target_period_id: action === 'move_and_delete' ? deleteModalState.targetPeriodId : null,
      });

      if (rpcErr) {
        console.warn('[GradingPeriods] RPC delete_or_archive_grading_period fallback:', rpcErr.message);

        if (action === 'move_and_delete') {
          const target = gradingPeriods.find((p) => p.id === deleteModalState.targetPeriodId);
          if (target) {
            await (supabase as any)
              .from('assessments')
              .update({ term: target.name })
              .eq('tenant_id', tenantId)
              .eq('term', period.name);

            await (supabase as any)
              .from('tos_documents')
              .update({ term: target.name })
              .eq('tenant_id', tenantId)
              .eq('term', period.name);
          }
          await (supabase as any).from('grading_periods').delete().eq('id', period.id);
        } else if (action === 'delete') {
          await (supabase as any).from('grading_periods').delete().eq('id', period.id);
        } else if (action === 'archive') {
          await (supabase as any)
            .from('grading_periods')
            .update({
              is_archived: true,
              is_current: false,
              code: `${period.code}_arch_${period.id.slice(0, 6)}`,
            })
            .eq('id', period.id);
        }

        // Renumber remaining active positions 1..N
        const remaining = gradingPeriods.filter((p) => p.id !== period.id);
        for (let i = 0; i < remaining.length; i++) {
          await (supabase as any)
            .from('grading_periods')
            .update({ position: i + 1 })
            .eq('id', remaining[i].id);
        }
      }

      setDeleteModalState({
        isOpen: false,
        period: null,
        assessmentCount: 0,
        tosCount: 0,
        totalCount: 0,
        targetPeriodId: '',
        loadingUsage: false,
        operating: false,
      });

      const label = action === 'archive' ? 'archived' : 'deleted';
      toast.success(`Term "${period.name}" ${label} successfully.`);
      await refreshGradingPeriods();
    } catch (err: any) {
      console.error('Failed to perform delete/archive action:', err);
      toast.error(friendlyError(err, 'Failed to update term.'));
    } finally {
      setRowOperatingId(null);
      setDeleteModalState((prev) => ({ ...prev, operating: false }));
    }
  };

  const handleRestorePeriod = async (period: GradingPeriodItem) => {
    if (gradingPeriods.length >= 4) {
      toast.error('Maximum of 4 active terms reached. Delete or archive one before restoring.');
      return;
    }

    const duplicateName = gradingPeriods.some(
      (p) => p.name.trim().toLowerCase() === period.name.trim().toLowerCase()
    );
    if (duplicateName) {
      toast.error(`An active term with the name "${period.name}" already exists.`);
      return;
    }

    setRowOperatingId(period.id);
    try {
      const { error: rpcErr } = await (supabase as any).rpc('restore_grading_period', {
        p_period_id: period.id,
      });

      if (rpcErr) {
        console.warn('[GradingPeriods] RPC restore_grading_period fallback:', rpcErr.message);
        const cleanCode = period.code.replace(/_arch_.*$/, '');
        const nextPos = gradingPeriods.length + 1;
        await (supabase as any)
          .from('grading_periods')
          .update({
            is_archived: false,
            is_current: false,
            position: nextPos,
            code: cleanCode,
          })
          .eq('id', period.id);
      }

      toast.success(`Term "${period.name}" restored successfully.`);
      await refreshGradingPeriods();
    } catch (err: any) {
      console.error('Failed to restore term:', err);
      toast.error(friendlyError(err, 'Failed to restore term.'));
    } finally {
      setRowOperatingId(null);
    }
  };

  const handleRequestPreset = (preset: '4quarter' | '2semester') => {
    if (gradingPeriods.length > 0) {
      setPresetConfirmModal({
        isOpen: true,
        preset,
      });
    } else {
      handleApplyPreset(preset);
    }
  };

  const handleApplyPreset = async (preset: '4quarter' | '2semester') => {
    if (!tenantId) {
      toast.error('Your account is not linked to a school yet.');
      return;
    }
    setLoadingPeriods(true);
    try {
      console.log(`[GradingPeriods] Applying preset ${preset} for tenant: ${tenantId}`);

      // 1. Try atomic database RPC function first
      const { data: rpcData, error: rpcErr } = await (supabase as any).rpc('apply_grading_period_preset', {
        p_preset: preset,
      });

      console.log('[GradingPeriods] RPC apply_grading_period_preset result:', { data: rpcData, error: rpcErr });

      if (rpcErr) {
        console.warn('[GradingPeriods] RPC unavailable, executing client fallback with verification:', rpcErr.message);

        // Client-side fallback: archive existing active periods safely
        const { error: archiveErr } = await (supabase as any)
          .from('grading_periods')
          .update({ is_archived: true, is_current: false })
          .eq('tenant_id', tenantId);

        if (archiveErr) {
          console.error('[GradingPeriods] Failed to archive existing periods:', archiveErr);
          throw archiveErr;
        }

        const standardRows = preset === '4quarter'
          ? [
              { tenant_id: tenantId, name: '1st Term', code: 'T1', position: 1, is_current: true, is_archived: false },
              { tenant_id: tenantId, name: '2nd Term', code: 'T2', position: 2, is_current: false, is_archived: false },
              { tenant_id: tenantId, name: '3rd Term', code: 'T3', position: 3, is_current: false, is_archived: false },
              { tenant_id: tenantId, name: '4th Term', code: 'T4', position: 4, is_current: false, is_archived: false },
            ]
          : [
              { tenant_id: tenantId, name: '1st Semester', code: 'S1', position: 1, is_current: true, is_archived: false },
              { tenant_id: tenantId, name: '2nd Semester', code: 'S2', position: 2, is_current: false, is_archived: false },
            ];

        const { data: insertedRows, error: insErr } = await (supabase as any)
          .from('grading_periods')
          .insert(standardRows)
          .select('*');

        console.log('[GradingPeriods] Fallback insert result:', { count: insertedRows?.length, error: insErr });

        if (insErr) {
          console.error('[GradingPeriods] Insert error:', insErr);
          throw insErr;
        }

        if (!insertedRows || insertedRows.length === 0) {
          throw new Error('Zero grading periods were inserted into the database.');
        }
      }

      // 2. Fresh fetch to confirm rows exist in the database before showing success
      const freshRows = await refreshGradingPeriods(tenantId);
      console.log(`[GradingPeriods] Follow-up fetch returned ${freshRows.length} rows`);

      if (!freshRows || freshRows.length === 0) {
        throw new Error('Grading periods could not be verified after applying preset.');
      }

      const active = freshRows.find((p) => p.is_current) || freshRows[0];
      if (active) {
        setTerm(active.name);
      }

      toast.success(preset === '4quarter' ? 'Applied standard 4-Term configuration.' : 'Applied 2-Semester configuration.');
    } catch (err: any) {
      console.error('[GradingPeriods] Failed to apply preset:', err);
      toast.error(friendlyError(err, 'Failed to apply preset.'));
    } finally {
      setLoadingPeriods(false);
      setPresetConfirmModal({ isOpen: false, preset: '4quarter' });
    }
  };

  useEffect(() => {
    async function loadSchoolSettings() {
      setLoading(true);
      setError(null);
      try {
        const { tenantId: currentTenantId, configId: currentConfigId } = await getTenantContext(supabase);
        setTenantId(currentTenantId);
        setConfigId(currentConfigId);

        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('display_name')
          .eq('id', user?.id || '')
          .maybeSingle();

        // 1. Fetch active academic config deterministically
        const { data: config } = await (supabase as any)
          .from('academic_configs')
          .select('id, school_year, term')
          .eq('id', currentConfigId)
          .maybeSingle();

        // 1b. Fetch active grading periods
        await refreshGradingPeriods(currentTenantId);

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
        setError(friendlyError(err, 'Failed to load school configuration.'));
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

        if (tenantId && term) {
          await (supabase as any)
            .from('grading_periods')
            .update({ is_current: false })
            .eq('tenant_id', tenantId)
            .eq('is_current', true);

          await (supabase as any)
            .from('grading_periods')
            .update({ is_current: true })
            .eq('tenant_id', tenantId)
            .eq('name', term.trim());
        }
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
                  Active Academic Term
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                >
                  {gradingPeriods.length > 0 ? (
                    gradingPeriods.map((gp) => (
                      <option
                        key={gp.id}
                        value={gp.name}
                        className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white"
                      >
                        {gp.name} ({gp.code})
                      </option>
                    ))
                  ) : (
                    <option value="" disabled className="bg-white text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                      No active terms configured — apply a preset below
                    </option>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Card: Grading Periods & Current Term (C2) */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                    Grading Periods &amp; Current Term
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Define active academic terms, custom labels (e.g. Prelims/Midterms), display sequence, and current active period.
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={gradingPeriods.length >= 4 || Boolean(rowOperatingId)}
                  onClick={() => {
                    const nextPos = gradingPeriods.length + 1;
                    setNewTermType('term');
                    setNewTermName(`Term ${nextPos}`);
                    setNewTermCode(`T${nextPos}`);
                    setIsAddTermModalOpen(true);
                  }}
                  title={
                    gradingPeriods.length >= 4
                      ? 'You can have up to 4 terms. Delete or archive one first.'
                      : 'Add a new grading period'
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Term</span>
                </button>

                <span className="text-[11px] font-semibold text-gray-400 ml-1">Presets:</span>
                <button
                  type="button"
                  disabled={Boolean(rowOperatingId)}
                  onClick={() => handleRequestPreset('4quarter')}
                  className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 transition disabled:opacity-50"
                >
                  4 Terms
                </button>
                <button
                  type="button"
                  disabled={Boolean(rowOperatingId)}
                  onClick={() => handleRequestPreset('2semester')}
                  className="rounded-xl border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 transition disabled:opacity-50"
                >
                  2 Semesters
                </button>
              </div>
            </div>

            {gradingPeriods.length >= 4 && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>You can have up to 4 terms. Delete or archive one first.</span>
              </div>
            )}

            {loadingPeriods ? (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
                <span className="text-xs">Loading grading periods...</span>
              </div>
            ) : gradingPeriods.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-xs">
                No active grading periods configured. Click "4 Terms" or "2 Semesters" above to initialize.
              </div>
            ) : (
              <div className="space-y-2">
                {gradingPeriods.map((gp, idx) => {
                  const isEditing = editingPeriodId === gp.id;
                  const isOperating = rowOperatingId === gp.id;

                  return (
                    <div
                      key={gp.id}
                      className={cn(
                        'flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-3.5 transition-all',
                        gp.is_current
                          ? 'border-blue-200 bg-blue-50/40 dark:border-blue-900/50 dark:bg-blue-950/20'
                          : 'border-gray-200 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/40'
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Position badge & reorder buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-200 text-[10px] font-mono font-bold text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                            #{gp.position}
                          </span>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              disabled={idx === 0 || Boolean(rowOperatingId)}
                              onClick={() => handleReorderPeriod(gp.id, 'up')}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-20 transition"
                              title="Move up"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === gradingPeriods.length - 1 || Boolean(rowOperatingId)}
                              onClick={() => handleReorderPeriod(gp.id, 'down')}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-20 transition"
                              title="Move down"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        {/* Name & Code */}
                        {isEditing ? (
                          <div className="flex flex-wrap items-center gap-2 flex-1">
                            <input
                              type="text"
                              value={editPeriodName}
                              onChange={(e) => setEditPeriodName(e.target.value)}
                              placeholder="Display label (e.g. Prelims)"
                              className="rounded-lg border border-blue-400 bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 outline-none dark:bg-gray-800 dark:text-white"
                            />
                            <input
                              type="text"
                              value={editPeriodCode}
                              onChange={(e) => setEditPeriodCode(e.target.value)}
                              placeholder="Code (e.g. T1)"
                              className="w-16 rounded-lg border border-blue-400 bg-white px-2 py-1 text-xs font-mono font-semibold text-gray-900 outline-none dark:bg-gray-800 dark:text-white uppercase"
                            />
                            <button
                              type="button"
                              onClick={() => handleRequestSavePeriod(gp, editPeriodName, editPeriodCode)}
                              className="rounded-lg bg-emerald-600 p-1 text-white hover:bg-emerald-700"
                              title="Save label"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPeriodId(null)}
                              className="rounded-lg bg-gray-200 p-1 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                              {gp.name}
                            </span>
                            <span className="rounded-md bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300 uppercase">
                              {gp.code.replace(/_arch_.*$/, '')}
                            </span>
                            {gp.is_current && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <CheckCircle2 className="h-3 w-3" /> Current Term
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Right actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isOperating ? (
                          <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-blue-600">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Updating...</span>
                          </div>
                        ) : (
                          <>
                            {!isEditing && (
                              <button
                                type="button"
                                disabled={Boolean(rowOperatingId)}
                                onClick={() => {
                                  setEditingPeriodId(gp.id);
                                  setEditPeriodName(gp.name);
                                  setEditPeriodCode(gp.code.replace(/_arch_.*$/, ''));
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50 transition"
                              >
                                <Edit2 className="h-3 w-3" /> Rename
                              </button>
                            )}

                            {!gp.is_current && (
                              <button
                                type="button"
                                disabled={Boolean(rowOperatingId)}
                                onClick={() => setSetCurrentConfirmModal({ isOpen: true, period: gp })}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50 transition"
                              >
                                Set as Current Term
                              </button>
                            )}

                            {/* Delete Button */}
                            <button
                              type="button"
                              disabled={gp.is_current || gradingPeriods.length <= 1 || Boolean(rowOperatingId)}
                              onClick={() => handleRequestDeletePeriod(gp)}
                              title={
                                gp.is_current
                                  ? 'Set another term as current first.'
                                  : gradingPeriods.length <= 1
                                  ? 'At least one term is required.'
                                  : 'Delete or archive this term'
                              }
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/40 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition"
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

            {/* Collapsible Archived Terms Section */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <button
                type="button"
                onClick={() => setIsArchivedExpanded(!isArchivedExpanded)}
                className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition"
              >
                <Archive className="h-3.5 w-3.5" />
                <span>Archived terms ({archivedGradingPeriods.length})</span>
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform duration-200', isArchivedExpanded && 'rotate-180')}
                />
              </button>

              {isArchivedExpanded && (
                <div className="mt-3 space-y-2">
                  {archivedGradingPeriods.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2">No archived terms.</p>
                  ) : (
                    archivedGradingPeriods.map((arch) => {
                      const isOperating = rowOperatingId === arch.id;
                      const hasNameCollision = gradingPeriods.some(
                        (p) => p.name.trim().toLowerCase() === arch.name.trim().toLowerCase()
                      );
                      const isMaxReached = gradingPeriods.length >= 4;
                      const canRestore = !hasNameCollision && !isMaxReached;

                      return (
                        <div
                          key={arch.id}
                          className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-850/40 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-gray-700 dark:text-gray-300 truncate">
                              {arch.name}
                            </span>
                            <span className="rounded bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-mono font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-400 uppercase">
                              {arch.code.replace(/_arch_.*$/, '')}
                            </span>
                            <span className="rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-medium">
                              Archived
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={!canRestore || Boolean(rowOperatingId)}
                            onClick={() => handleRestorePeriod(arch)}
                            title={
                              isMaxReached
                                ? 'Maximum of 4 active terms reached. Delete or archive one before restoring.'
                                : hasNameCollision
                                ? 'An active term with this name already exists.'
                                : 'Restore this grading period'
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:bg-gray-800 dark:text-blue-400 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            {isOperating ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ArchiveRestore className="h-3.5 w-3.5" />
                            )}
                            <span>Restore</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
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

      {/* Grading Period Assessment Impact Warning Modal (C2) */}
      <ConfirmationModal
        isOpen={periodWarningModal.isOpen}
        onClose={() => setPeriodWarningModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() =>
          applySavePeriod(
            periodWarningModal.periodId,
            periodWarningModal.oldName,
            periodWarningModal.newName,
            periodWarningModal.newCode
          )
        }
        isLoading={savingPeriod}
        actionType="neutral"
        title="Update Linked Assessments?"
        description={`${periodWarningModal.affectedCount} assessment(s) are recorded under "${periodWarningModal.oldName}". Renaming it will update their display label to "${periodWarningModal.newName}".`}
        confirmLabel="Rename Period & Update Records"
      />

      {/* Set Current Term Confirmation Modal */}
      <ConfirmationModal
        isOpen={setCurrentConfirmModal.isOpen}
        onClose={() => setSetCurrentConfirmModal({ isOpen: false, period: null })}
        onConfirm={() => {
          if (setCurrentConfirmModal.period) {
            handleConfirmSetCurrent(setCurrentConfirmModal.period);
          }
        }}
        isLoading={Boolean(rowOperatingId)}
        actionType="neutral"
        title="Change Active Academic Term?"
        description={`Set "${setCurrentConfirmModal.period?.name}" as the active Current Term? This changes the default academic period for the entire school.`}
        confirmLabel="Confirm & Set as Current"
      />

      {/* Preset Switch Confirmation Modal */}
      <ConfirmationModal
        isOpen={presetConfirmModal.isOpen}
        onClose={() => setPresetConfirmModal({ isOpen: false, preset: '4quarter' })}
        onConfirm={() => handleApplyPreset(presetConfirmModal.preset)}
        isLoading={loadingPeriods}
        actionType="neutral"
        title={`Switch to ${presetConfirmModal.preset === '4quarter' ? '4 Terms' : '2 Semesters'}?`}
        description={`This will configure ${
          presetConfirmModal.preset === '4quarter' ? '4 standard terms' : '2 standard semesters'
        } for your school. Any existing active terms will be archived and all linked assessments and records will be preserved.`}
        confirmLabel="Switch Configuration"
      />

      {/* Add Term Modal */}
      {isAddTermModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Add Academic Term
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddTermModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Type Suggestion Choice */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Academic Structure Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextPos = gradingPeriods.length + 1;
                      setNewTermType('term');
                      setNewTermName(`Term ${nextPos}`);
                      setNewTermCode(`T${nextPos}`);
                    }}
                    className={cn(
                      'rounded-xl border py-2 px-3 text-xs font-bold transition text-center',
                      newTermType === 'term'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300'
                    )}
                  >
                    Quarter / Term
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextPos = gradingPeriods.length + 1;
                      setNewTermType('semester');
                      setNewTermName(nextPos <= 2 ? `${nextPos === 1 ? '1st' : '2nd'} Semester` : `Semester ${nextPos}`);
                      setNewTermCode(`S${nextPos}`);
                    }}
                    className={cn(
                      'rounded-xl border py-2 px-3 text-xs font-bold transition text-center',
                      newTermType === 'semester'
                        ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300'
                    )}
                  >
                    Semester
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Type choice provides default wording suggestions.
                </p>
              </div>

              {/* Term Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Term Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={newTermName}
                  onChange={(e) => setNewTermName(e.target.value)}
                  placeholder="e.g. 1st Semester, Prelims, Midterms"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                <span className="text-[10px] text-gray-400 mt-1 block">
                  {newTermName.length}/50 characters • Must be unique among active terms
                </span>
              </div>

              {/* Code */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Code Badge (e.g. T1, S1, PRELIM)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={newTermCode}
                  onChange={(e) => setNewTermCode(e.target.value.toUpperCase())}
                  placeholder="e.g. T1 or S1"
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 font-mono text-xs uppercase font-semibold text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="rounded-xl bg-blue-50/60 p-3 text-[11px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                <span>New terms are assigned position #{gradingPeriods.length + 1} and are not set as current.</span>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setIsAddTermModalOpen(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addingTerm || !newTermName.trim()}
                onClick={handleAddTerm}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {addingTerm ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Term</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete / Move / Archive Term Modal */}
      {deleteModalState.isOpen && deleteModalState.period && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Delete &quot;{deleteModalState.period.name}&quot;?
                </h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDeleteModalState((prev) => ({ ...prev, isOpen: false, period: null }))
                }
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {deleteModalState.loadingUsage ? (
              <div className="flex items-center justify-center py-8 text-gray-400 text-xs">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
                <span>Checking dependent records...</span>
              </div>
            ) : deleteModalState.totalCount === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Are you sure you want to permanently delete{' '}
                  <strong className="text-gray-900 dark:text-white">
                    &quot;{deleteModalState.period.name}&quot;
                  </strong>
                  ? No assessments or TOS documents are recorded under this term.
                </p>
                <p className="text-[11px] text-gray-400">
                  Remaining terms will be re-numbered 1..N to keep gradebook and analytics aligned.
                </p>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteModalState((prev) => ({ ...prev, isOpen: false, period: null }))
                    }
                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleteModalState.operating}
                    onClick={() => handleConfirmDeleteOrArchive('delete')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {deleteModalState.operating ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Deleting...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Permanently Delete</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Active Records Found</span>
                  </div>
                  <p>
                    <strong>{deleteModalState.assessmentCount}</strong> assessment(s) and{' '}
                    <strong>{deleteModalState.tosCount}</strong> TOS document(s) are recorded under{' '}
                    &quot;{deleteModalState.period.name}&quot;.
                  </p>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                    To prevent broken data, you must either move these records to another active term or archive this term instead.
                  </p>
                </div>

                {/* Move Section */}
                <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800 space-y-3">
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    Option 1: Move Everything &amp; Delete
                  </span>
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
                      Destination Term
                    </label>
                    <select
                      value={deleteModalState.targetPeriodId}
                      onChange={(e) =>
                        setDeleteModalState((prev) => ({
                          ...prev,
                          targetPeriodId: e.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-xs text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      {gradingPeriods
                        .filter((p) => p.id !== deleteModalState.period?.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code})
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={deleteModalState.operating || !deleteModalState.targetPeriodId}
                    onClick={() => handleConfirmDeleteOrArchive('move_and_delete')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {deleteModalState.operating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    <span>Move Records &amp; Delete Term</span>
                  </button>
                </div>

                {/* Archive Option */}
                <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800 space-y-2">
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    Option 2: Archive Instead
                  </span>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Hides &quot;{deleteModalState.period.name}&quot; from all dropdowns and gradebooks while keeping all records and historical scores completely intact.
                  </p>
                  <button
                    type="button"
                    disabled={deleteModalState.operating}
                    onClick={() => handleConfirmDeleteOrArchive('archive')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300 transition"
                  >
                    {deleteModalState.operating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    <span>Archive Term (Preserve Data)</span>
                  </button>
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteModalState((prev) => ({ ...prev, isOpen: false, period: null }))
                    }
                    className="rounded-xl border border-gray-200 px-4 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
