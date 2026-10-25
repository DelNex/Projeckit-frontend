'use client';

import { createClient } from '@/lib/supabase/client';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
    AlertTriangle,
    CheckCircle2,
    Copy,
    FileSpreadsheet,
    FileText,
    HelpCircle,
    Info,
    Loader2,
    Plus,
    Save,
    Sliders,
    Sparkles,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTenant } from '@/context/TenantContext';
import { ExamQuestion } from '@/lib/exam-types';
import { ExamGeneratorModal } from './ExamGeneratorModal';
import { ExamDraftEditor } from './ExamDraftEditor';
import {
  calculateTos,
  BloomLevel,
  DEFAULT_COGNITIVE_DISTRIBUTION,
  CognitiveDistributionConfig,
  CognitiveDomains,
  TosCompetencyInput,
} from '@/lib/tos-calculator';

export interface TosCompetencyDomain {
  remembering: number;
  understanding: number;
  applying: number;
  analyzing: number;
  evaluating: number;
  creating: number;
}

export interface TosCompetencyRow {
  id: string;
  code: string;
  description: string;
  daysTaught: number;
  domains: TosCompetencyDomain;
  itemTarget?: number;
  itemRange?: string;
  startItem?: number;
  endItem?: number;
  domainItemNumbers?: Record<BloomLevel, number[]>;
  domainDisplay?: Record<BloomLevel, string>;
}

export interface TosEditorProps {
  assessmentId?: string;
  tosDocId?: string;
  initialSubject?: string;
  initialTerm?: string;
  initialSchoolYear?: string;
  initialGrade?: string;
  initialStrand?: string;
  initialSection?: string;
  initialTargetItems?: number;
  initialStatus?: string;
  teacherName?: string;
  onSaveSuccess?: () => void;
}

export function TosEditor({
  assessmentId = '',
  tosDocId = '',
  initialSubject = '',
  initialTerm = '',
  initialSchoolYear = '',
  initialGrade = '',
  initialStrand = '',
  initialSection = '',
  initialTargetItems = 50,
  initialStatus = 'DRAFT',
  teacherName = '',
  onSaveSuccess,
}: TosEditorProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const { tenantName, userDisplayName } = useTenant();

  // Academic Context State
  const [subject, setSubject] = useState(initialSubject);
  const [term, setTerm] = useState(initialTerm);
  const [schoolYear, setSchoolYear] = useState(initialSchoolYear);
  const [grade, setGrade] = useState(initialGrade);
  const [strand, setStrand] = useState(initialStrand);
  const [section, setSection] = useState(initialSection);

  // Document Config State
  const [targetItems, setTargetItems] = useState<number>(initialTargetItems || 50);
  const [status, setStatus] = useState<string>(initialStatus || 'DRAFT');
  const [teacher, setTeacher] = useState<string>(teacherName || userDisplayName || '');

  // C5: Cognitive distribution percentages (configurable, defaults to 60/30/10)
  const [cogDist, setCogDist] = useState<CognitiveDistributionConfig>(DEFAULT_COGNITIVE_DISTRIBUTION);
  const [showDistSettings, setShowDistSettings] = useState(false);

  // C7: Manual Adjust Mode
  const [isAdjustMode, setIsAdjustMode] = useState(false);
  const [adjustments, setAdjustments] = useState<Record<string, TosCompetencyDomain>>({});

  useEffect(() => {
    if (!teacher && userDisplayName) {
      setTeacher(userDisplayName);
    }
  }, [teacher, userDisplayName]);

  // View and Edit Modes
  const [viewMode, setViewMode] = useState<'worksheet' | 'preview' | 'exam'>('worksheet');
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<ExamQuestion[]>([]);
  const [lessonTextState, setLessonTextState] = useState('');
  const [examSource, setExamSource] = useState<string>('');
  const [examMissingItems, setExamMissingItems] = useState<number[]>([]);
  const [isSampleDemoExam, setIsSampleDemoExam] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isEditing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isEditing]);

  // Competency Rows Store
  const [rows, setRows] = useState<TosCompetencyRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline New Row State (Simplified: Code, Description, Days Taught)
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newDays, setNewDays] = useState<number>(4);

  // UI / Async State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [rowsToDelete, setRowsToDelete] = useState<string[]>([]);
  const [currentTosId, setCurrentTosId] = useState<string | null>(tosDocId || null);
  const [linkedAssessmentId, setLinkedAssessmentId] = useState<string | null>(assessmentId || null);
  const [isLinkedWarningModalOpen, setIsLinkedWarningModalOpen] = useState(false);
  const [isZeroItemsWarningModalOpen, setIsZeroItemsWarningModalOpen] = useState(false);
  const [gradingPeriods, setGradingPeriods] = useState<Array<{ id: string; name: string; code: string }>>([]);

  // 1. Fetch real TOS document from Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadTosDoc() {
      setLoading(true);
      try {
        let tosQuery = supabase.from('tos_documents').select('*');
        if (tosDocId) {
          tosQuery = tosQuery.eq('id', tosDocId);
        } else if (assessmentId) {
          // Look up the TOS id from the assessment, then load by primary key
          const { data: aRow } = await supabase
            .from('assessments')
            .select('tos_id')
            .eq('id', assessmentId)
            .single();
          if (aRow?.tos_id) {
            tosQuery = tosQuery.eq('id', aRow.tos_id);
          } else {
            // No linked TOS — skip the query, will start a blank editor
            tosQuery = tosQuery.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        }

        const [tosRes, gpRes, acRes] = await Promise.all([
          tosQuery.maybeSingle(),
          supabase
            .from('grading_periods')
            .select('id, name, code')
            .eq('is_archived', false)
            .order('position', { ascending: true }),
          supabase
            .from('academic_configs')
            .select('cog_dist_lower, cog_dist_mid, cog_dist_higher')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (!isMounted) return;

        if (gpRes?.data && gpRes.data.length > 0) {
          setGradingPeriods(gpRes.data);
        }

        if (acRes?.data?.cog_dist_lower && acRes?.data?.cog_dist_mid && acRes?.data?.cog_dist_higher) {
          setCogDist({
            lower: acRes.data.cog_dist_lower,
            mid: acRes.data.cog_dist_mid,
            higher: acRes.data.cog_dist_higher,
          });
        }

        const data = tosRes?.data;

        if (data && Array.isArray(data.rows) && data.rows.length > 0) {
          const parsedRows: TosCompetencyRow[] = data.rows.map((r: any, idx: number) => {
            const rawDays = r.daysTaught !== undefined
              ? Number(r.daysTaught)
              : (r.days !== undefined ? Number(r.days) : Number(r.days_taught));
            const daysTaught = Number.isFinite(rawDays) && rawDays > 0 ? rawDays : 1;

            return {
              id: r.id || String(idx + 1),
              code: r.code || `COMP-${idx + 1}`,
              description: r.competency || r.description || '',
              daysTaught,
              domains: {
                remembering: Number(r.domains?.remembering ?? 0),
                understanding: Number(r.domains?.understanding ?? 0),
                applying: Number(r.domains?.applying ?? 0),
                analyzing: Number(r.domains?.analyzing ?? 0),
                evaluating: Number(r.domains?.evaluating ?? 0),
                creating: Number(r.domains?.creating ?? 0),
              },
            };
          });

          if (data.id) setCurrentTosId(data.id);
          if (assessmentId) setLinkedAssessmentId(assessmentId);
          setRows(parsedRows);
          if (data.subject) setSubject(data.subject);
          if (data.term) setTerm(data.term);
          if (data.school_year) setSchoolYear(data.school_year);
          if (data.grade) setGrade(data.grade);
          if (data.strand) setStrand(data.strand);
          if (data.section) setSection(data.section);
          if (data.target_items) setTargetItems(Number(data.target_items));
          if (data.status) setStatus(data.status);
          if (data.teacher_name) {
            setTeacher(data.teacher_name);
          } else if (data.created_by) {
            const { data: creator } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', data.created_by)
              .maybeSingle();
            if (creator?.display_name) {
              setTeacher(creator.display_name);
            }
          }

          if (data?.questions && Array.isArray(data.questions) && data.questions.length > 0) {
            setGeneratedQuestions(data.questions as unknown as ExamQuestion[]);
          } else if (assessmentId) {
            const { data: assData } = await supabase
              .from('assessments')
              .select('questions')
              .eq('id', assessmentId)
              .maybeSingle();
            if (assData?.questions && Array.isArray(assData.questions) && assData.questions.length > 0) {
              setGeneratedQuestions(assData.questions as unknown as ExamQuestion[]);
            }
          }
        } else {
          setRows([]);
        }
      } catch (err) {
        console.warn('Failed to load TOS document from Supabase:', err);
        setRows([]);
      } finally {
        if (isMounted) {
          setLoading(false);
          setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        }
      }
    }

    loadTosDoc();
    return () => {
      isMounted = false;
    };
  }, [assessmentId]);

  useEffect(() => {
    if (initialSubject && !subject) setSubject(initialSubject);
    if (initialTerm && !term) setTerm(initialTerm);
    if (initialSchoolYear && !schoolYear) setSchoolYear(initialSchoolYear);
    if (initialSection && !section) setSection(initialSection);
    if (initialGrade && !grade) setGrade(initialGrade);
    if (initialStrand && !strand) setStrand(initialStrand);
    if (initialTargetItems && initialTargetItems !== targetItems) {
      setTargetItems(initialTargetItems);
    }
  }, [initialSubject, initialTerm, initialSchoolYear, initialSection, initialGrade, initialStrand, initialTargetItems]);

  // C4, C5, C6: Deterministic Calculation Engine via tos-calculator
  const tosCalc = useMemo(() => {
    const inputs: TosCompetencyInput[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      description: r.description,
      daysTaught: Number(r.daysTaught) || 0,
    }));
    return calculateTos(inputs, targetItems, cogDist);
  }, [rows, targetItems, cogDist]);

  // Merge computed values into active rows for display
  const displayRows = useMemo(() => {
    return rows.map((r) => {
      const calcRow = tosCalc.rows.find((c) => c.id === r.id);
      const rowItemCount = calcRow?.itemCount ?? 0;
      const rowItemRange = calcRow?.itemRange ?? '—';
      const rowPercentage = calcRow?.percentage ?? 0;

      // In adjust mode, use teacher's manual domain values if present
      const activeDomains: TosCompetencyDomain = (isAdjustMode && adjustments[r.id])
        ? adjustments[r.id]
        : (calcRow?.domains ?? r.domains);

      return {
        ...r,
        itemCount: rowItemCount,
        itemRange: rowItemRange,
        percentage: rowPercentage,
        domains: activeDomains,
        domainRanges: calcRow?.domainRanges,
        domainItemNumbers: calcRow?.domainItemNumbers,
        domainDisplay: calcRow?.domainDisplay,
      };
    });
  }, [rows, tosCalc, isAdjustMode, adjustments]);

  // Metrics and Validation Totals
  const totals = useMemo(() => {
    const currentDays = rows.reduce((acc, r) => acc + (Number(r.daysTaught) || 0), 0);
    const domainTotals: TosCompetencyDomain = {
      remembering: 0,
      understanding: 0,
      applying: 0,
      analyzing: 0,
      evaluating: 0,
      creating: 0,
    };

    displayRows.forEach((r) => {
      domainTotals.remembering += Number(r.domains.remembering) || 0;
      domainTotals.understanding += Number(r.domains.understanding) || 0;
      domainTotals.applying += Number(r.domains.applying) || 0;
      domainTotals.analyzing += Number(r.domains.analyzing) || 0;
      domainTotals.evaluating += Number(r.domains.evaluating) || 0;
      domainTotals.creating += Number(r.domains.creating) || 0;
    });

    const totalAllocatedItems =
      domainTotals.remembering +
      domainTotals.understanding +
      domainTotals.applying +
      domainTotals.analyzing +
      domainTotals.evaluating +
      domainTotals.creating;

    let rowIssues = 0;
    displayRows.forEach((r) => {
      const cur =
        r.domains.remembering +
        r.domains.understanding +
        r.domains.applying +
        r.domains.analyzing +
        r.domains.evaluating +
        r.domains.creating;
      if (!r.daysTaught || r.daysTaught <= 0 || cur !== r.itemCount) {
        rowIssues++;
      }
    });

    const itemsMismatch = totalAllocatedItems !== targetItems;
    const countMismatch = rows.length < 1 || rows.length > 4;
    const totalErrors = rowIssues + (itemsMismatch ? 1 : 0) + (countMismatch ? 1 : 0);

    return {
      currentDays,
      domainTotals,
      totalAllocatedItems,
      rowIssues,
      totalErrors,
      itemsStatus: totalAllocatedItems === targetItems ? 'valid' : totalAllocatedItems < targetItems ? 'deficit' : 'overflow',
    };
  }, [rows, displayRows, targetItems]);

  const handleSaveTos = async (confirmedWarning: boolean = false) => {
    if (rows.length > 4) {
      toast.error('A TOS can have up to 4 learning competencies. Please reduce competencies to 4 before saving.');
      return;
    }
    if (rows.length < 1) {
      toast.error('A TOS must have at least 1 learning competency.');
      return;
    }
    const hasZeroDays = rows.some((r) => !r.daysTaught || r.daysTaught <= 0);
    if (hasZeroDays) {
      toast.error('Every competency must have days taught greater than 0.');
      return;
    }
    if (totals.totalAllocatedItems !== targetItems) {
      toast.error(`Allocated items (${totals.totalAllocatedItems}) must match target items (${targetItems}).`);
      return;
    }

    const hasWarnings = (tosCalc.warnings && tosCalc.warnings.length > 0) || (tosCalc.zeroItemCompetencies && tosCalc.zeroItemCompetencies.length > 0);
    if (!confirmedWarning && hasWarnings) {
      setIsZeroItemsWarningModalOpen(true);
      return;
    }

    setSaving(true);
    setSaveStatus('saving');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id, display_name')
        .eq('id', user?.id || '')
        .maybeSingle();

      if (!profile?.tenant_id) {
        throw new Error('Your account is not linked to a school tenant.');
      }
      const tenantId = profile.tenant_id;
      const finalTeacher = teacher.trim()
        || userDisplayName
        || profile?.display_name
        || String(user?.user_metadata?.display_name || '').trim()
        || user?.email?.split('@')[0]
        || '';

      const payload: any = {
        tenant_id: tenantId,
        subject,
        term,
        school_year: schoolYear,
        grade,
        strand,
        section,
        target_items: targetItems,
        total_days: totals.currentDays,
        days_taught: totals.currentDays,
        status,
        rows: displayRows.map((r) => ({
          id: r.id,
          code: r.code,
          description: r.description,
          daysTaught: r.daysTaught,
          days: r.daysTaught,
          itemCount: r.itemCount,
          itemRange: r.itemRange,
          domains: r.domains,
          domainItemNumbers: r.domainItemNumbers,
          domainDisplay: r.domainDisplay,
        })),
        teacher_name: finalTeacher,
        updated_at: new Date().toISOString(),
      };

      if (currentTosId) {
        payload.id = currentTosId;
      }

      const { data: savedRow, error: upsertErr } = await supabase
        .from('tos_documents')
        .upsert(payload, currentTosId ? { onConflict: 'id' } : undefined)
        .select('id')
        .single();

      if (upsertErr) throw upsertErr;
      if (savedRow?.id) {
        setCurrentTosId(savedRow.id);
        const targetAssessmentId = linkedAssessmentId || assessmentId;
        if (targetAssessmentId) {
          await supabase
            .from('assessments')
            .update({ tos_id: savedRow.id })
            .eq('id', targetAssessmentId);
        }
      }

      // Sync teacher_name to faculty table
      try {
        const { data: ac } = await supabase
          .from('academic_configs')
          .select('id')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ac?.id) {
          const { data: fac } = await supabase
            .from('faculty')
            .select('id')
            .eq('config_id', ac.id)
            .limit(1)
            .maybeSingle();

          if (fac?.id) {
            await supabase
              .from('faculty')
              .update({ teacher_name: finalTeacher })
              .eq('id', fac.id);
          } else {
            await supabase
              .from('faculty')
              .insert({ config_id: ac.id, teacher_name: finalTeacher });
          }
        }
      } catch (syncErr) {
        console.warn('Faculty sync notice:', syncErr);
      }

      setSaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsEditing(false);
      setIsAdjustMode(false);
      toast.success('Table of Specifications saved successfully.');
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error('Failed to save TOS to Supabase:', err);
      setSaveStatus('error');
      toast.error(friendlyError(err, 'Could not save TOS.'));
    } finally {
      setSaving(false);
    }
  };

  const handleCommitInlineRow = () => {
    if (!newDesc.trim()) return;

    if (rows.length >= 4) {
      toast.error('A TOS can have up to 4 learning competencies.');
      return;
    }

    const rowId = Date.now().toString();
    const newRow: TosCompetencyRow = {
      id: rowId,
      code: newCode.trim() || `COMP-${rows.length + 1}`,
      description: newDesc.trim(),
      daysTaught: Math.max(1, newDays || 1),
      domains: {
        remembering: 0,
        understanding: 0,
        applying: 0,
        analyzing: 0,
        evaluating: 0,
        creating: 0,
      },
    };

    setRows([...rows, newRow]);
    setNewCode('');
    setNewDesc('');
    setNewDays(4);
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleSelectRow = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const handleBulkDuplicate = () => {
    const toDuplicate = rows.filter((r) => selectedIds.has(r.id));
    if (toDuplicate.length === 0) return;

    if (rows.length + toDuplicate.length > 4) {
      toast.error('A TOS can have up to 4 learning competencies.');
      return;
    }

    const cloned: TosCompetencyRow[] = toDuplicate.map((r) => ({
      ...r,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      code: `${r.code}-COPY`,
      description: `${r.description} (Copy)`,
      domains: { ...r.domains },
    }));

    setRows([...rows, ...cloned]);
    setSelectedIds(new Set());
  };

  const handleConfirmBulkDelete = () => {
    const remaining = rows.filter((r) => !rowsToDelete.includes(r.id));
    setRows(remaining);
    setSelectedIds(new Set());
    setIsDeleteModalOpen(false);
    setRowsToDelete([]);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-500 space-y-3">
        <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
        <span className="text-xs">Loading Table of Specifications...</span>
      </div>
    );
  }

  const isOverCompetencyLimit = rows.length > 4;

  return (
    <div className="space-y-4 pb-8 min-w-0">
      {/* ── C3 Alert Banner for Legacy Documents with >4 Competencies ── */}
      {isOverCompetencyLimit && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">
              Competency Limit Notice: This TOS contains {rows.length} learning competencies.
            </p>
            <p>
              Under updated DepEd assessment guidelines, a Table of Specifications can have up to 4 learning competencies. Please reduce to 4 or fewer before saving changes.
            </p>
          </div>
        </div>
      )}

      {/* ── Top Bar: Status, Actions, View Switcher ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3.5 sm:p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white truncate">
                Table of Specifications (TOS)
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                DepEd Order No. 8, s. 2015
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
              {saving ? (
                <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                  Saving to Supabase...
                </span>
              ) : saveStatus === 'error' ? (
                <span className="flex items-center gap-1.5 text-rose-600 font-medium">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  ✗ Save failed
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  ✓ Saved to Supabase
                  {lastSavedTime && <span className="text-gray-400 dark:text-gray-500">· {lastSavedTime}</span>}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Top Controls & View Mode Toggle */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
          {/* View Mode Switcher */}
          <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex items-center gap-1 text-xs">
            <button
              onClick={() => setViewMode('worksheet')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-semibold transition',
                viewMode === 'worksheet'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              Worksheet Editor
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={cn(
                'px-3 py-1.5 rounded-lg font-semibold transition',
                viewMode === 'preview'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              DepEd Print Preview
            </button>
            {generatedQuestions.length > 0 && (
              <button
                onClick={() => setViewMode('exam')}
                className={cn(
                  'px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5',
                  viewMode === 'exam'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>Exam Paper ({generatedQuestions.length})</span>
              </button>
            )}
          </div>

          {/* Action Buttons */}
          <button
            type="button"
            onClick={() => setIsGeneratorModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition flex items-center gap-1.5 shrink-0"
            title="Upload lesson notes to automatically generate exam questions matching this TOS"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-200" />
            <span>Generate Exam from Lessons</span>
          </button>

          {isEditing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSaveTos(false)}
                disabled={saving || isOverCompetencyLimit}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setIsDiscardModalOpen(true)}
                className="px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 transition shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                if (linkedAssessmentId || assessmentId) {
                  setIsLinkedWarningModalOpen(true);
                } else {
                  setIsEditing(true);
                }
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0"
            >
              <span>Edit Worksheet</span>
            </button>
          )}

          <button
            onClick={() => setIsHelpOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center gap-1.5 shrink-0"
          >
            <HelpCircle className="h-3.5 w-3.5 text-gray-500" />
            <span>Help</span>
          </button>
        </div>
      </div>

      {/* ── Academic Information Context Toolbar ── */}
      <div className="p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3 min-w-0">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
            Academic Context &amp; Filters
          </h3>
          <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            SCOPE
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">School Year</label>
            <input
              type="text"
              value={schoolYear}
              onChange={(e) => setSchoolYear(e.target.value)}
              placeholder="e.g. 2026-2027"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 text-xs outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Grade Level</label>
            <input
              type="text"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              placeholder="e.g. Grade 11"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 text-xs outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Active Term</label>
            {gradingPeriods.length > 0 ? (
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 text-xs outline-none"
              >
                {gradingPeriods.map((gp) => (
                  <option key={gp.id} value={gp.name}>
                    {gp.name} ({gp.code.replace(/_arch_.*$/, '')})
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="e.g. 1st Term"
                className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 text-xs outline-none"
              />
            )}
          </div>
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. General Mathematics"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 text-xs outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Section</label>
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. STEM-11A"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 text-xs outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Track / Strand</label>
            <input
              type="text"
              value={strand}
              onChange={(e) => setStrand(e.target.value)}
              placeholder="e.g. Academic - STEM"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 text-xs outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Balanced 2-Column Dashboard Cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 min-w-0">
        {/* Card 1: Document Information & Governance */}
        <div className="p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3 min-w-0">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              Document Information
            </h3>
            <span
              className={cn(
                'px-2 py-0.5 text-[10px] font-bold uppercase rounded-full',
                status === 'FINALIZED'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
              )}
            >
              {status}
            </span>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-gray-700 dark:text-gray-300">Teacher / Proponent</label>
                {userDisplayName && teacher !== userDisplayName && (
                  <button
                    type="button"
                    onClick={() => setTeacher(userDisplayName)}
                    className="text-[10px] text-blue-600 hover:underline dark:text-blue-400 font-medium"
                    title="Reset to account name"
                  >
                    Reset to account name
                  </button>
                )}
              </div>
              <input
                type="text"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                onBlur={() => {
                  if (!teacher.trim() && userDisplayName) {
                    setTeacher(userDisplayName);
                  }
                }}
                placeholder={userDisplayName || "e.g. Maria Santos, LPT"}
                className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 text-xs outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Target Items (N)</label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={targetItems}
                  onChange={(e) => setTargetItems(Number(e.target.value) || 50)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-center text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 text-xs outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Total Days Taught</label>
                <div className="w-full px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 font-bold text-center text-xs">
                  {totals.currentDays} Days Total
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Metrics Summary & Cognitive Settings */}
        <div className="p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3 min-w-0">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              Worksheet Metrics Summary
            </h3>
            <button
              type="button"
              onClick={() => setShowDistSettings(!showDistSettings)}
              className="text-[10px] text-blue-600 hover:underline dark:text-blue-400 font-semibold flex items-center gap-1"
            >
              <Sliders className="h-3 w-3" />
              {showDistSettings ? 'Hide Settings' : 'Cognitive Distribution'}
            </button>
          </div>

          {/* Consolidated Dynamic Summary Badges */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Days Taught</span>
              <span className="block text-sm font-black text-gray-900 dark:text-white">
                {totals.currentDays} days
              </span>
              <span className="text-[9px] text-gray-400 font-medium">
                {rows.length} Competencies
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Allocated</span>
              <span
                className={cn(
                  'block text-sm font-black',
                  totals.itemsStatus === 'valid'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : totals.itemsStatus === 'deficit'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {totals.totalAllocatedItems} / {targetItems}
              </span>
              <span
                className={cn(
                  'text-[9px] font-bold',
                  totals.itemsStatus === 'valid'
                    ? 'text-emerald-600'
                    : totals.itemsStatus === 'deficit'
                    ? 'text-amber-600'
                    : 'text-rose-600'
                )}
              >
                {totals.itemsStatus === 'valid'
                  ? 'Verified'
                  : totals.itemsStatus === 'deficit'
                  ? `${targetItems - totals.totalAllocatedItems} remaining`
                  : `+${totals.totalAllocatedItems - targetItems} overflow`}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Validation</span>
              <span
                className={cn(
                  'block text-sm font-black',
                  totals.totalErrors === 0 ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                {totals.totalErrors === 0 ? 'Passed' : `${totals.totalErrors} Alert(s)`}
              </span>
              <span className="text-[9px] text-gray-400 font-medium">
                {totals.rowIssues > 0 ? `${totals.rowIssues} row issue(s)` : 'No issues'}
              </span>
            </div>
          </div>

          {/* C5: Configurable Cognitive Distribution Settings Card */}
          {showDistSettings && (
            <div className="p-3 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-blue-900 dark:text-blue-300">Bloom&apos;s Cognitive Distribution (%):</span>
                <span className={cn(
                  'text-[10px] font-extrabold px-2 py-0.5 rounded-full',
                  (cogDist.lower + cogDist.mid + cogDist.higher === 100)
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                )}>
                  Total: {cogDist.lower + cogDist.mid + cogDist.higher}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400">Lower (REM+UND)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={cogDist.lower}
                    onChange={(e) => setCogDist({ ...cogDist, lower: Number(e.target.value) || 0 })}
                    className="w-full px-2 py-1 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-center font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400">Mid (APP+ANA)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={cogDist.mid}
                    onChange={(e) => setCogDist({ ...cogDist, mid: Number(e.target.value) || 0 })}
                    className="w-full px-2 py-1 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-center font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400">Higher (EVA+CRE)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={cogDist.higher}
                    onChange={(e) => setCogDist({ ...cogDist, higher: Number(e.target.value) || 0 })}
                    className="w-full px-2 py-1 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-center font-bold text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* C7: Adjust Mode Toggle */}
          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-gray-500 text-[11px]">
              {isAdjustMode ? 'Manual Adjust active: fine-tuning domain cells.' : 'Hamilton Auto-Allocation active.'}
            </span>
            <button
              type="button"
              onClick={() => setIsAdjustMode(!isAdjustMode)}
              className={cn(
                'px-2.5 py-1 text-xs font-semibold rounded-lg border transition',
                isAdjustMode
                  ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                  : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
              )}
            >
              {isAdjustMode ? 'Done Adjusting' : 'Adjust Cells'}
            </button>
          </div>
        </div>
      </div>

      {/* ── VIEW TAB 1: WORKSHEET EDITOR ── */}
      {viewMode === 'worksheet' && (
        <div className="p-4 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4 min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
                Competency Item Allocation Matrix
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Deterministic Hamilton distribution across learning competencies and Bloom&apos;s cognitive dimensions
              </p>
            </div>

            {/* Validation Banner */}
            <div>
              {totals.totalErrors === 0 ? (
                <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Validation Passed: {totals.currentDays} Days · {totals.totalAllocatedItems} Items Verified</span>
                </div>
              ) : (
                <div className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                  <span>
                    Validation Alert: {totals.rowIssues > 0 && `${totals.rowIssues} row issue(s)`}
                    {totals.itemsStatus !== 'valid' && ` · Items: ${totals.totalAllocatedItems}/${targetItems}`}
                    {isOverCompetencyLimit && ' · Max 4 competencies exceeded'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Allocation Warning Banner (Item 8) */}
          {tosCalc.warnings && tosCalc.warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-3 sm:p-4 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-amber-900 dark:text-amber-300">Table of Specifications Warnings:</span>
                <ul className="list-disc pl-4 space-y-0.5">
                  {tosCalc.warnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Worksheet Matrix Table */}
          <div className="overflow-x-auto -mx-4 sm:mx-0 touch-pan-x focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" tabIndex={0} role="region" aria-label="Learning competency table. Swipe sideways to see more columns.">
            <p className="px-4 pb-2 text-[11px] text-gray-500 sm:hidden" aria-hidden="true">Swipe sideways to see all columns</p>
            <table className="w-full text-left text-xs table-optimized min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-bold">
                  <th className="px-3 py-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selectedIds.size === rows.length}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-3 py-3 w-36 font-bold text-gray-700 dark:text-gray-300">Competency code</th>
                  <th className="px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Learning competency</th>
                  <th className="px-3 py-3 text-center w-20 font-bold text-gray-700 dark:text-gray-300">Days taught</th>
                  <th className="px-3 py-3 text-center w-20 font-bold text-gray-700 dark:text-gray-300">Share (%)</th>
                  <th className="px-3 py-3 text-center w-14 font-bold text-blue-600 dark:text-blue-400">Items</th>
                  <th className="px-3 py-3 text-center w-20 font-bold text-gray-700 dark:text-gray-300">Range</th>
                  <th className="px-2 py-3 text-center w-20 text-blue-600 dark:text-blue-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-[10px]" title="Remembering">Remember</span>
                  </th>
                  <th className="px-2 py-3 text-center w-24 text-indigo-600 dark:text-indigo-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-[10px]" title="Understanding">Understand</span>
                  </th>
                  <th className="px-2 py-3 text-center w-20 text-purple-600 dark:text-purple-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-[10px]" title="Applying">Apply</span>
                  </th>
                  <th className="px-2 py-3 text-center w-20 text-amber-600 dark:text-amber-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-[10px]" title="Analyzing">Analyze</span>
                  </th>
                  <th className="px-2 py-3 text-center w-20 text-rose-600 dark:text-rose-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-[10px]" title="Evaluating">Evaluate</span>
                  </th>
                  <th className="px-2 py-3 text-center w-20 text-emerald-600 dark:text-emerald-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-[10px]" title="Creating">Create</span>
                  </th>
                  <th className="px-3 py-3 text-center w-24 font-bold text-gray-700 dark:text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.length === 0 && !isEditing && (
                  <tr>
                    <td colSpan={14} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <FileSpreadsheet className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                        <p className="text-xs font-semibold">No learning competencies added yet.</p>
                        <p className="text-[11px] max-w-sm text-gray-400">
                          Click &quot;Edit Worksheet&quot; to begin adding up to 4 learning competencies and days taught.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}

                {displayRows.map((row, idx) => {
                  const currentDomainSum =
                    row.domains.remembering +
                    row.domains.understanding +
                    row.domains.applying +
                    row.domains.analyzing +
                    row.domains.evaluating +
                    row.domains.creating;
                  const isDaysZero = !row.daysTaught || row.daysTaught <= 0;
                  const isDomainMatch = currentDomainSum === row.itemCount;
                  const isDomainOver = currentDomainSum > row.itemCount;
                  const isSelected = selectedIds.has(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'transition-colors',
                        isDomainOver || isDaysZero
                          ? 'bg-rose-50/40 dark:bg-rose-950/20 border-l-4 border-l-rose-500'
                          : !isDomainMatch
                          ? 'bg-amber-50/30 dark:bg-amber-950/10 border-l-4 border-l-amber-400'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
                      )}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleToggleSelectRow(row.id, e.target.checked)}
                          className="rounded border-gray-300 dark:border-gray-700 text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      {/* Code */}
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.code}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].code = e.target.value;
                              setRows(updated);
                            }}
                            className="w-full px-2 py-1 text-xs font-mono font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 font-mono">
                            {row.code}
                          </span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].description = e.target.value;
                              setRows(updated);
                            }}
                            className="w-full px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                          />
                        ) : (
                          <div>
                            <span className="text-xs text-gray-800 dark:text-gray-200 font-medium">
                              {row.description}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Days Taught */}
                      <td className="px-3 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="1"
                            value={row.daysTaught}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].daysTaught = Number(e.target.value) || 0;
                              setRows(updated);
                            }}
                            className={cn(
                              'w-14 text-center px-1 py-1 text-xs font-bold rounded-lg border transition-colors',
                              isDaysZero
                                ? 'border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-400'
                                : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                            )}
                          />
                        ) : (
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">
                            {row.daysTaught}d
                          </span>
                        )}
                      </td>

                      {/* Percentage */}
                      <td className="px-3 py-3 text-center text-xs font-bold text-gray-600 dark:text-gray-300">
                        {row.percentage}%
                      </td>

                      {/* Allocated Items */}
                      <td className="px-3 py-3 text-center font-bold text-xs text-blue-600 dark:text-blue-400">
                        {row.itemCount}
                      </td>

                      {/* C6: Item Number Range */}
                      <td className="px-3 py-3 text-center font-mono text-xs font-bold text-gray-700 dark:text-gray-300">
                        {row.itemRange}
                      </td>

                      {/* REM */}
                      <td className="px-2 py-3 text-center">
                        {isAdjustMode ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.remembering}
                            onChange={(e) => {
                              const next = { ...row.domains, remembering: Number(e.target.value) || 0 };
                              setAdjustments({ ...adjustments, [row.id]: next });
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-blue-600 font-semibold"
                          />
                        ) : (
                          <span className={cn('text-xs', row.domains.remembering > 0 ? 'font-bold text-blue-600' : 'text-gray-300 dark:text-gray-600')}>
                            {row.domains.remembering > 0 ? `${row.domains.remembering}` : '0'}
                          </span>
                        )}
                      </td>

                      {/* UND */}
                      <td className="px-2 py-3 text-center">
                        {isAdjustMode ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.understanding}
                            onChange={(e) => {
                              const next = { ...row.domains, understanding: Number(e.target.value) || 0 };
                              setAdjustments({ ...adjustments, [row.id]: next });
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-indigo-600 font-semibold"
                          />
                        ) : (
                          <span className={cn('text-xs', row.domains.understanding > 0 ? 'font-bold text-indigo-600' : 'text-gray-300 dark:text-gray-600')}>
                            {row.domains.understanding > 0 ? `${row.domains.understanding}` : '0'}
                          </span>
                        )}
                      </td>

                      {/* APP */}
                      <td className="px-2 py-3 text-center">
                        {isAdjustMode ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.applying}
                            onChange={(e) => {
                              const next = { ...row.domains, applying: Number(e.target.value) || 0 };
                              setAdjustments({ ...adjustments, [row.id]: next });
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-purple-600 font-semibold"
                          />
                        ) : (
                          <span className={cn('text-xs', row.domains.applying > 0 ? 'font-bold text-purple-600' : 'text-gray-300 dark:text-gray-600')}>
                            {row.domains.applying > 0 ? `${row.domains.applying}` : '0'}
                          </span>
                        )}
                      </td>

                      {/* ANA */}
                      <td className="px-2 py-3 text-center">
                        {isAdjustMode ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.analyzing}
                            onChange={(e) => {
                              const next = { ...row.domains, analyzing: Number(e.target.value) || 0 };
                              setAdjustments({ ...adjustments, [row.id]: next });
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-amber-600 font-semibold"
                          />
                        ) : (
                          <span className={cn('text-xs', row.domains.analyzing > 0 ? 'font-bold text-amber-600' : 'text-gray-300 dark:text-gray-600')}>
                            {row.domains.analyzing > 0 ? `${row.domains.analyzing}` : '0'}
                          </span>
                        )}
                      </td>

                      {/* EVA */}
                      <td className="px-2 py-3 text-center">
                        {isAdjustMode ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.evaluating}
                            onChange={(e) => {
                              const next = { ...row.domains, evaluating: Number(e.target.value) || 0 };
                              setAdjustments({ ...adjustments, [row.id]: next });
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-rose-600 font-semibold"
                          />
                        ) : (
                          <span className={cn('text-xs', row.domains.evaluating > 0 ? 'font-bold text-rose-600' : 'text-gray-300 dark:text-gray-600')}>
                            {row.domains.evaluating > 0 ? `${row.domains.evaluating}` : '0'}
                          </span>
                        )}
                      </td>

                      {/* CRE */}
                      <td className="px-2 py-3 text-center">
                        {isAdjustMode ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.creating}
                            onChange={(e) => {
                              const next = { ...row.domains, creating: Number(e.target.value) || 0 };
                              setAdjustments({ ...adjustments, [row.id]: next });
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-emerald-600 font-semibold"
                          />
                        ) : (
                          <span className={cn('text-xs', row.domains.creating > 0 ? 'font-bold text-emerald-600' : 'text-gray-300 dark:text-gray-600')}>
                            {row.domains.creating > 0 ? `${row.domains.creating}` : '0'}
                          </span>
                        )}
                      </td>

                      {/* Validation Column */}
                      <td className="px-3 py-3 text-center">
                        {isDaysZero ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            ❌ 0 Days
                          </span>
                        ) : isDomainMatch ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            ✓ Verified
                          </span>
                        ) : isDomainOver ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            ⚠ +{currentDomainSum - row.itemCount} Over
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            ⚠ -{row.itemCount - currentDomainSum} Under
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* C1, C3: Inline Add Row (disabled when 4 reached) */}
                {isEditing && (
                  rows.length >= 4 ? (
                    <tr className="bg-gray-50/50 dark:bg-gray-800/20 border-t border-gray-200 dark:border-gray-700">
                      <td colSpan={14} className="px-4 py-3 text-center text-xs text-gray-500 italic">
                        A Table of Specifications can have up to 4 learning competencies. Delete or remove one to add another.
                      </td>
                    </tr>
                  ) : (
                    <tr className="bg-emerald-50/40 dark:bg-emerald-950/10 border-t-2 border-dashed border-emerald-300 dark:border-emerald-800">
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={handleCommitInlineRow}
                          title="Add this competency row"
                          className="h-7 w-7 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-xs transition"
                        >
                          +
                        </button>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          placeholder="e.g. COMP-1 (optional)"
                          value={newCode}
                          onChange={(e) => setNewCode(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCommitInlineRow()}
                          className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="text"
                          placeholder="Type learning competency description..."
                          value={newDesc}
                          onChange={(e) => setNewDesc(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCommitInlineRow()}
                          className="w-full px-2 py-1 text-xs rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min="1"
                          placeholder="Days"
                          value={newDays}
                          onChange={(e) => setNewDays(Number(e.target.value) || 1)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCommitInlineRow()}
                          className="w-14 text-center px-1 py-1 text-xs font-bold rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        />
                      </td>
                      <td colSpan={9} className="px-2 py-2 text-xs text-gray-400 italic">
                        Items &amp; Cognitive domains will be computed automatically
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={handleCommitInlineRow}
                          className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition"
                        >
                          + Add
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>

              {/* Totals Footer Row */}
              {rows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 dark:bg-gray-800 font-bold border-t-2 border-gray-300 dark:border-gray-700">
                    <td className="px-3 py-3" />
                    <td colSpan={2} className="px-4 py-3 text-xs uppercase text-gray-500">
                      Column Totals
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-extrabold text-gray-900 dark:text-white">
                      {totals.currentDays}d
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-extrabold text-gray-900 dark:text-white">
                      100%
                    </td>
                    <td
                      className={cn(
                        'px-2 py-3 text-center text-xs font-extrabold',
                        totals.itemsStatus === 'valid'
                          ? 'text-emerald-600'
                          : totals.itemsStatus === 'deficit'
                          ? 'text-amber-600'
                          : 'text-rose-600'
                      )}
                    >
                      {totals.totalAllocatedItems}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-mono text-gray-500">
                      1–{targetItems}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-extrabold text-blue-600">
                      {totals.domainTotals.remembering}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-extrabold text-indigo-600">
                      {totals.domainTotals.understanding}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-extrabold text-purple-600">
                      {totals.domainTotals.applying}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-extrabold text-amber-600">
                      {totals.domainTotals.analyzing}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-extrabold text-rose-600">
                      {totals.domainTotals.evaluating}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-extrabold text-emerald-600">
                      {totals.domainTotals.creating}
                    </td>
                    <td className="px-3 py-3 text-center text-xs font-bold text-gray-600">
                      {totals.totalErrors === 0 ? '✓ Balanced' : `⚠ ${totals.totalErrors} Error(s)`}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── VIEW TAB 2: DEPED OFFICIAL PRINT PREVIEW ── */}
      {viewMode === 'preview' && (
        <div className="space-y-4">
          <div
            id="official-tos-card"
            className="p-8 bg-white text-gray-900 rounded-3xl border border-gray-300 shadow-md space-y-6 max-w-5xl mx-auto font-serif"
          >
            {/* DepEd Official Document Header */}
            <div className="text-center space-y-1 border-b-2 border-gray-900 pb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Republic of the Philippines</p>
              <h2 className="text-base font-extrabold uppercase text-gray-900 tracking-wider pt-1">
                {tenantName || 'DEPED ACADEMIC INSTITUTION'}
              </h2>
              <h1 className="text-lg font-black uppercase tracking-wider text-gray-900 pt-3">
                TABLE OF SPECIFICATIONS (TOS)
              </h1>
            </div>

            {/* Document Information Metadata Block */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p>
                  <strong>SUBJECT:</strong> <span>{subject || '—'}</span>
                </p>
                <p>
                  <strong>GRADE LEVEL:</strong> <span>{grade || '—'}</span> {term && <span>· {term}</span>}
                </p>
                <p>
                  <strong>TRACK / STRAND:</strong> <span>{strand || '—'}</span> {section && <span>({section})</span>}
                </p>
              </div>
              <div className="text-right">
                <p>
                  <strong>SCHOOL YEAR:</strong> <span>{schoolYear || '—'}</span>
                </p>
                <p>
                  <strong>TEACHER / PROPONENT:</strong> <span>{teacher || '—'}</span>
                </p>
                <p>
                  <strong>TOTAL ITEMS &amp; DAYS:</strong> <span>{targetItems} Items · {totals.currentDays} Days Taught</span>
                </p>
              </div>
            </div>

            {/* Printable Matrix Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse border border-gray-900">
                <thead>
                  <tr className="bg-gray-100 text-gray-900 border-b border-gray-900 text-center font-bold">
                    <th className="border border-gray-900 p-2">CODE</th>
                    <th className="border border-gray-900 p-2 text-left">LEARNING COMPETENCY</th>
                    <th className="border border-gray-900 p-2 w-12">DAYS</th>
                    <th className="border border-gray-900 p-2 w-12">%</th>
                    <th className="border border-gray-900 p-2 w-12">ITEMS</th>
                    <th className="border border-gray-900 p-2 w-16">RANGE</th>
                    <th className="border border-gray-900 p-2">Remember</th>
                    <th className="border border-gray-900 p-2">Understand</th>
                    <th className="border border-gray-900 p-2">Apply</th>
                    <th className="border border-gray-900 p-2">Analyze</th>
                    <th className="border border-gray-900 p-2">Evaluate</th>
                    <th className="border border-gray-900 p-2">Create</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr className="border-b border-gray-900 text-center">
                      <td colSpan={12} className="border border-gray-900 p-6 text-xs text-gray-500 italic">
                        No competency data is available for this Table of Specifications. Add competency rows in the Worksheet Editor.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {displayRows.map((r) => (
                        <tr key={r.id} className="border-b border-gray-900 text-center">
                          <td className="border border-gray-900 p-1.5 font-mono text-[11px] font-bold text-left">
                            {r.code}
                          </td>
                          <td className="border border-gray-900 p-1.5 text-left font-serif">
                            {r.description}
                          </td>
                          <td className="border border-gray-900 p-1.5 font-semibold">{r.daysTaught}</td>
                          <td className="border border-gray-900 p-1.5">{r.percentage}%</td>
                          <td className="border border-gray-900 p-1.5 font-bold">{r.itemCount}</td>
                          <td className="border border-gray-900 p-1.5 font-mono font-bold">{r.itemRange}</td>
                          <td className="border border-gray-900 p-1.5">{r.domains.remembering || 0}</td>
                          <td className="border border-gray-900 p-1.5">{r.domains.understanding || 0}</td>
                          <td className="border border-gray-900 p-1.5">{r.domains.applying || 0}</td>
                          <td className="border border-gray-900 p-1.5">{r.domains.analyzing || 0}</td>
                          <td className="border border-gray-900 p-1.5">{r.domains.evaluating || 0}</td>
                          <td className="border border-gray-900 p-1.5">{r.domains.creating || 0}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-900 bg-gray-100 font-bold text-center">
                        <td colSpan={2} className="border border-gray-900 p-2 text-left uppercase">
                          TOTALS
                        </td>
                        <td className="border border-gray-900 p-1.5">{totals.currentDays}</td>
                        <td className="border border-gray-900 p-1.5">100%</td>
                        <td className="border border-gray-900 p-1.5">{totals.totalAllocatedItems}</td>
                        <td className="border border-gray-900 p-1.5 font-mono">1–{targetItems}</td>
                        <td className="border border-gray-900 p-1.5">{totals.domainTotals.remembering}</td>
                        <td className="border border-gray-900 p-1.5">{totals.domainTotals.understanding}</td>
                        <td className="border border-gray-900 p-1.5">{totals.domainTotals.applying}</td>
                        <td className="border border-gray-900 p-1.5">{totals.domainTotals.analyzing}</td>
                        <td className="border border-gray-900 p-1.5">{totals.domainTotals.evaluating}</td>
                        <td className="border border-gray-900 p-1.5">{totals.domainTotals.creating}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* DepEd Official Sign-Off Footer Block */}
            <div className="grid grid-cols-3 gap-6 pt-8 text-xs text-center border-t border-gray-300">
              <div>
                <p className="text-gray-500">Prepared by:</p>
                <p className="font-bold text-gray-900 underline mt-8">{teacher.toUpperCase() || '—'}</p>
                <p className="text-[10px] text-gray-500">Subject Teacher / Proponent</p>
              </div>
              <div>
                <p className="text-gray-500">Reviewed by:</p>
                <p className="font-bold text-gray-900 underline mt-8">DEPARTMENT HEAD</p>
                <p className="text-[10px] text-gray-500">Academic Coordinator</p>
              </div>
              <div>
                <p className="text-gray-500">Approved by:</p>
                <p className="font-bold text-gray-900 underline mt-8">SCHOOL PRINCIPAL</p>
                <p className="text-[10px] text-gray-500">School Head / Administrator</p>
              </div>
            </div>

            {/* Centralized Print & Reports link */}
            <div className="text-center pt-4 print:hidden">
              <Link
                href="/reports"
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition"
              >
                <FileSpreadsheet className="h-4 w-4" />
                <span>Open Print &amp; Reports</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Generated Exam Paper View (Draft Exam Editor) ── */}
      {viewMode === 'exam' && (
        <ExamDraftEditor
          initialQuestions={generatedQuestions}
          assessmentId={linkedAssessmentId || assessmentId || undefined}
          tosId={currentTosId || undefined}
          targetItems={targetItems}
          assessmentTitle={`${subject} Examination`}
          subjectTitle={subject}
          term={term}
          schoolYear={schoolYear}
          grade={grade}
          strand={strand}
          teacherName={teacher}
          lessonText={lessonTextState}
          generationSource={examSource}
          missingItemNumbers={examMissingItems}
          isSampleDemo={isSampleDemoExam}
          onQuestionsSaved={(updated) => {
            setGeneratedQuestions(updated);
            toast.success('Exam questions saved.');
          }}
          onApproveSuccess={() => {
            toast.success('Exam approved and applied to answer key!');
            if (onSaveSuccess) onSaveSuccess();
          }}
        />
      )}

      {/* ── AI Exam Generator Modal ── */}
      <ExamGeneratorModal
        isOpen={isGeneratorModalOpen}
        onClose={() => setIsGeneratorModalOpen(false)}
        assessmentId={linkedAssessmentId || assessmentId || undefined}
        tosId={currentTosId || undefined}
        targetItems={targetItems}
        tosRows={rows}
        subjectTitle={subject}
        onExamGenerated={(questions, text, source, missingItems, isSampleDemo) => {
          setGeneratedQuestions(questions);
          setLessonTextState(text);
          if (source) setExamSource(source);
          if (missingItems) setExamMissingItems(missingItems);
          if (isSampleDemo !== undefined) setIsSampleDemoExam(isSampleDemo);
          setViewMode('exam');
        }}
      />

      {/* ── Slide-Over Help Drawer ── */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-600" />
                How to use the TOS Worksheet
              </h3>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-gray-600 dark:text-gray-300">
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-200 dark:border-blue-900">
                <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-1">1. Days Taught &amp; Competency Limit</h4>
                <p>
                  Enter the actual instructional days spent per competency (up to 4 competencies). The total days and proportional percentages are computed automatically.
                </p>
              </div>

              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-200 dark:border-indigo-900">
                <h4 className="font-bold text-indigo-700 dark:text-indigo-400 mb-1">2. Hamilton Largest-Remainder Method</h4>
                <p>
                  Allocates test items proportionally based on days taught. Every competency with days &gt; 0 gets at least 1 item, and contiguous item ranges are assigned automatically.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-gray-900 dark:text-white">3. Bloom&apos;s Cognitive Dimensions:</h4>
                <ul className="space-y-1.5 pl-2 border-l-2 border-blue-500">
                  <li>
                    <strong className="text-blue-600">Remembering (REM):</strong> Recall facts &amp; basic concepts
                  </li>
                  <li>
                    <strong className="text-indigo-600">Understanding (UND):</strong> Explain ideas &amp; concepts
                  </li>
                  <li>
                    <strong className="text-purple-600">Applying (APP):</strong> Use information in new situations
                  </li>
                  <li>
                    <strong className="text-amber-600">Analyzing (ANA):</strong> Draw connections among ideas
                  </li>
                  <li>
                    <strong className="text-rose-600">Evaluating (EVA):</strong> Justify a stand or decision
                  </li>
                  <li>
                    <strong className="text-emerald-600">Creating (CRE):</strong> Produce new or original work
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-2xl space-y-4 border border-gray-200 dark:border-gray-800">
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-rose-500" />
              Delete Selected Competencies?
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Are you sure you want to delete {rowsToDelete.length} competency row(s)? This will update the Table of Specifications.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBulkDelete}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
              >
                Delete Competencies
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard Unsaved Changes Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        onConfirm={() => {
          setIsEditing(false);
          setIsDiscardModalOpen(false);
        }}
        title="Discard unsaved changes?"
        description="You have unsaved changes to this Table of Specifications (TOS). Exiting edit mode will discard your modifications."
        actionType="neutral"
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
      />

      {/* Editing Linked TOS Confirmation Modal (Requirement D) */}
      <ConfirmationModal
        isOpen={isLinkedWarningModalOpen}
        onClose={() => setIsLinkedWarningModalOpen(false)}
        onConfirm={() => {
          setIsLinkedWarningModalOpen(false);
          setIsEditing(true);
        }}
        title="Edit Linked Table of Specifications?"
        description="This Table of Specifications is linked to an active assessment. Editing competencies or item allocations will alter the test layout and question distribution for the linked assessment. Are you sure you want to proceed?"
        actionType="neutral"
        confirmLabel="Proceed to Edit"
        cancelLabel="Keep Current TOS"
      />

      {/* Competency Zero-Items / Allocation Warning Modal (Item 8) */}
      <ConfirmationModal
        isOpen={isZeroItemsWarningModalOpen}
        onClose={() => setIsZeroItemsWarningModalOpen(false)}
        onConfirm={() => {
          setIsZeroItemsWarningModalOpen(false);
          handleSaveTos(true);
        }}
        title="Competency Allocation Warning"
        description={
          (tosCalc.warnings && tosCalc.warnings.length > 0
            ? tosCalc.warnings.join(' ') + ' '
            : '') + 'Do you want to proceed and save this Table of Specifications anyway?'
        }
        actionType="neutral"
        confirmLabel="Save Anyway"
        cancelLabel="Review & Fix"
      />
    </div>
  );
}
