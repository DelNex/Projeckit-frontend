'use client';

import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
    AlertTriangle,
    CheckCircle2,
    Copy,
    FileSpreadsheet,
    HelpCircle,
    Loader2,
    Plus,
    Printer,
    Save,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

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
  hours: number;
  domains: TosCompetencyDomain;
  itemTarget?: number;
}

export interface TosEditorProps {
  assessmentId: string;
  initialSubject?: string;
  initialTerm?: string;
  initialSchoolYear?: string;
  initialGrade?: string;
  initialStrand?: string;
  initialSection?: string;
  initialTargetHours?: number;
  initialTargetItems?: number;
  initialStatus?: string;
  teacherName?: string;
  onSaveSuccess?: () => void;
}

export function TosEditor({
  assessmentId,
  initialSubject = '',
  initialTerm = '',
  initialSchoolYear = '',
  initialGrade = '',
  initialStrand = '',
  initialSection = '',
  initialTargetHours = 40,
  initialTargetItems = 50,
  initialStatus = 'DRAFT',
  teacherName = '',
  onSaveSuccess,
}: TosEditorProps) {
  const supabase = createClient();

  // Academic Context State
  const [subject, setSubject] = useState(initialSubject);
  const [term, setTerm] = useState(initialTerm);
  const [schoolYear, setSchoolYear] = useState(initialSchoolYear);
  const [grade, setGrade] = useState(initialGrade);
  const [strand, setStrand] = useState(initialStrand);
  const [section, setSection] = useState(initialSection);

  // Document Config State
  const [targetHours, setTargetHours] = useState<number>(initialTargetHours || 40);
  const [targetItems, setTargetItems] = useState<number>(initialTargetItems || 50);
  const [status, setStatus] = useState<string>(initialStatus || 'DRAFT');
  const [teacher, setTeacher] = useState<string>(teacherName);

  // View and Edit Modes
  const [viewMode, setViewMode] = useState<'worksheet' | 'preview'>('worksheet');
  const [isEditing, setIsEditing] = useState(false);
  const [allocationMode, setAllocationMode] = useState<'manual' | 'hamilton'>('manual');

  // Competency Rows Store - NO fake fallback rows
  const [rows, setRows] = useState<TosCompetencyRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Inline New Row State
  const [newCode, setNewCode] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newHours, setNewHours] = useState<number>(4);
  const [newDomains, setNewDomains] = useState<TosCompetencyDomain>({
    remembering: 0,
    understanding: 0,
    applying: 0,
    analyzing: 0,
    evaluating: 0,
    creating: 0,
  });

  // UI / Async State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error' | null>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>('');
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [rowsToDelete, setRowsToDelete] = useState<string[]>([]);

  // 1. Fetch real TOS document from Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadTosDoc() {
      setLoading(true);
      try {
        const { data } = await (supabase as any)
          .from('tos_documents')
          .select('*')
          .eq('assessment_id', assessmentId)
          .maybeSingle();

        if (!isMounted) return;

        if (data && Array.isArray(data.rows) && data.rows.length > 0) {
          const parsedRows: TosCompetencyRow[] = data.rows.map((r: any, idx: number) => {
            if (r.domains) return r;
            return {
              id: r.id || String(idx + 1),
              code: r.code || `COMP-${idx + 1}`,
              description: r.competency || r.description || '',
              hours: Number(r.hours) || 0,
              domains: {
                remembering: Number(r.domains?.remembering ?? (r.cognitive === 'Remembering' ? r.items : 0)) || 0,
                understanding: Number(r.domains?.understanding ?? (r.cognitive === 'Understanding' ? r.items : 0)) || 0,
                applying: Number(r.domains?.applying ?? (r.cognitive === 'Applying' ? r.items : 0)) || 0,
                analyzing: Number(r.domains?.analyzing ?? (r.cognitive === 'Analyzing' ? r.items : 0)) || 0,
                evaluating: Number(r.domains?.evaluating ?? (r.cognitive === 'Evaluating' ? r.items : 0)) || 0,
                creating: Number(r.domains?.creating ?? (r.cognitive === 'Creating' ? r.items : 0)) || 0,
              },
            };
          });

          setRows(parsedRows);
          if (data.subject) setSubject(data.subject);
          if (data.term) setTerm(data.term);
          if (data.school_year) setSchoolYear(data.school_year);
          if (data.grade) setGrade(data.grade);
          if (data.strand) setStrand(data.strand);
          if (data.section) setSection(data.section);
          if (data.target_hours) setTargetHours(Number(data.target_hours));
          if (data.target_items) setTargetItems(Number(data.target_items));
          if (data.status) setStatus(data.status);
        } else {
          // Empty initial state without fake default data
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

  // Hamilton Largest Remainder Auto-Allocation Algorithm
  const applyHamiltonAllocationToRows = (currentRows: TosCompetencyRow[], tItems: number, tHours: number) => {
    if (tHours <= 0) return currentRows;
    return currentRows.map((c) => {
      const rawExact = (c.hours / tHours) * tItems;
      const itemTarget = Math.round(rawExact);
      const rem = Math.floor(itemTarget * 0.3);
      const und = Math.floor(itemTarget * 0.3);
      const app = Math.floor(itemTarget * 0.2);
      const ana = Math.max(0, itemTarget - (rem + und + app));

      return {
        ...c,
        domains: {
          remembering: rem,
          understanding: und,
          applying: app,
          analyzing: ana,
          evaluating: 0,
          creating: 0,
        },
        itemTarget,
      };
    });
  };

  const handleAllocationModeChange = (mode: 'manual' | 'hamilton') => {
    setAllocationMode(mode);
    if (mode === 'hamilton') {
      setRows((prev) => applyHamiltonAllocationToRows(prev, targetItems, targetHours));
    }
  };

  const getExpectedItems = (comp: TosCompetencyRow): number => {
    if (allocationMode === 'hamilton') {
      return targetHours > 0 ? Math.round((comp.hours / targetHours) * targetItems) : comp.hours;
    }
    const domainSum =
      comp.domains.remembering +
      comp.domains.understanding +
      comp.domains.applying +
      comp.domains.analyzing +
      comp.domains.evaluating +
      comp.domains.creating;
    if (typeof comp.itemTarget === 'number') {
      return comp.itemTarget;
    }
    return domainSum > 0 ? domainSum : comp.hours;
  };

  const totals = useMemo(() => {
    let currentHours = 0;
    const domainTotals: TosCompetencyDomain = {
      remembering: 0,
      understanding: 0,
      applying: 0,
      analyzing: 0,
      evaluating: 0,
      creating: 0,
    };

    rows.forEach((r) => {
      currentHours += Number(r.hours) || 0;
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
    rows.forEach((r) => {
      const exp = getExpectedItems(r);
      const cur =
        r.domains.remembering +
        r.domains.understanding +
        r.domains.applying +
        r.domains.analyzing +
        r.domains.evaluating +
        r.domains.creating;
      if (!r.hours || r.hours <= 0 || cur !== exp) {
        rowIssues++;
      }
    });

    const hoursMismatch = currentHours !== targetHours;
    const itemsMismatch = totalAllocatedItems !== targetItems;
    const totalErrors = rowIssues + (hoursMismatch ? 1 : 0) + (itemsMismatch ? 1 : 0);

    return {
      currentHours,
      domainTotals,
      totalAllocatedItems,
      rowIssues,
      totalErrors,
      hoursStatus: currentHours === targetHours ? 'valid' : currentHours < targetHours ? 'deficit' : 'overflow',
      itemsStatus: totalAllocatedItems === targetItems ? 'valid' : totalAllocatedItems < targetItems ? 'deficit' : 'overflow',
    };
  }, [rows, targetHours, targetItems, allocationMode]);

  const handleSaveTos = async () => {
    setSaving(true);
    setSaveStatus('saving');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();

      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      const payload = {
        assessment_id: assessmentId,
        tenant_id: tenantId,
        subject,
        term,
        school_year: schoolYear,
        grade,
        strand,
        section,
        target_hours: targetHours,
        target_items: targetItems,
        status,
        rows,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertErr } = await (supabase as any)
        .from('tos_documents')
        .upsert(payload, { onConflict: 'assessment_id' });

      if (upsertErr) throw upsertErr;

      setSaveStatus('saved');
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      setIsEditing(false);
      if (onSaveSuccess) onSaveSuccess();
    } catch (err: any) {
      console.error('Failed to save TOS to Supabase:', err);
      setSaveStatus('error');
      alert(`Could not save TOS: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCommitInlineRow = () => {
    if (!newDesc.trim()) return;

    const rowId = Date.now().toString();
    const newRow: TosCompetencyRow = {
      id: rowId,
      code: newCode.trim() || `COMP-${rows.length + 1}`,
      description: newDesc.trim(),
      hours: Math.max(1, newHours || 4),
      domains: { ...newDomains },
    };

    let updated = [...rows, newRow];
    if (allocationMode === 'hamilton') {
      updated = applyHamiltonAllocationToRows(updated, targetItems, targetHours);
    }
    setRows(updated);

    setNewCode('');
    setNewDesc('');
    setNewHours(4);
    setNewDomains({
      remembering: 0,
      understanding: 0,
      applying: 0,
      analyzing: 0,
      evaluating: 0,
      creating: 0,
    });
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

    const cloned: TosCompetencyRow[] = toDuplicate.map((r) => ({
      ...r,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      code: `${r.code}-COPY`,
      description: `${r.description} (Copy)`,
      domains: { ...r.domains },
    }));

    let updated = [...rows, ...cloned];
    if (allocationMode === 'hamilton') {
      updated = applyHamiltonAllocationToRows(updated, targetItems, targetHours);
    }
    setRows(updated);
    setSelectedIds(new Set());
  };

  const handleConfirmBulkDelete = () => {
    const remaining = rows.filter((r) => !rowsToDelete.includes(r.id));
    let updated = remaining;
    if (allocationMode === 'hamilton') {
      updated = applyHamiltonAllocationToRows(updated, targetItems, targetHours);
    }
    setRows(updated);
    setSelectedIds(new Set());
    setIsDeleteModalOpen(false);
    setRowsToDelete([]);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
        <span className="text-xs">Loading Table of Specifications...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 min-w-0">
      {/* ── Top Sticky Document Header Bar ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 dark:border-gray-800 pb-4 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
              Table of Specifications (TOS) Document Editor
            </h1>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400 font-medium">
            {saveStatus === 'saving' ? (
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
          </div>

          {/* Action Buttons */}
          {isEditing ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveTos}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition flex items-center gap-1.5 shrink-0"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Save Changes
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 transition shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
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
              placeholder="e.g. 2025-2026"
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
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Active Quarter</label>
            <input
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="e.g. 1st Quarter"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 text-xs outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Track / Strand</label>
            <input
              type="text"
              value={strand}
              onChange={(e) => setStrand(e.target.value)}
              placeholder="e.g. TVL - ICT"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 text-xs outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Section</label>
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g. 11-ICT-A"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 text-xs outline-none"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Subject Title</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Empowerment Tech"
              className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold focus:ring-2 focus:ring-blue-500 text-xs outline-none"
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
              <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Teacher / Proponent</label>
              <input
                type="text"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="e.g. Maria Santos, LPT"
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
                  onChange={(e) => {
                    const val = Number(e.target.value) || 50;
                    setTargetItems(val);
                    if (allocationMode === 'hamilton') {
                      setRows((prev) => applyHamiltonAllocationToRows(prev, val, targetHours));
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-center text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 text-xs outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">Target Hours</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={targetHours}
                  onChange={(e) => {
                    const val = Number(e.target.value) || 40;
                    setTargetHours(val);
                    if (allocationMode === 'hamilton') {
                      setRows((prev) => applyHamiltonAllocationToRows(prev, targetItems, val));
                    }
                  }}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold text-center text-blue-600 dark:text-blue-400 focus:ring-2 focus:ring-blue-500 text-xs outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Metrics Summary & Mode Selector */}
        <div className="p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3 min-w-0">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              Worksheet Metrics Summary
            </h3>
          </div>

          {/* Consolidated Dynamic Summary Badges */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800">
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Hours</span>
              <span
                className={cn(
                  'block text-sm font-black',
                  totals.hoursStatus === 'valid'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : totals.hoursStatus === 'deficit'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {totals.currentHours} / {targetHours} hrs
              </span>
              <span
                className={cn(
                  'text-[9px] font-bold',
                  totals.hoursStatus === 'valid'
                    ? 'text-emerald-600'
                    : totals.hoursStatus === 'deficit'
                    ? 'text-amber-600'
                    : 'text-rose-600'
                )}
              >
                {totals.hoursStatus === 'valid'
                  ? 'Verified'
                  : totals.hoursStatus === 'deficit'
                  ? `${targetHours - totals.currentHours} remaining`
                  : `+${totals.currentHours - targetHours} excess`}
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
              <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Errors</span>
              <span
                className={cn(
                  'block text-sm font-black',
                  totals.totalErrors === 0 ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                {totals.totalErrors}
              </span>
              <span className="text-[9px] text-gray-400 font-medium">
                {totals.rowIssues > 0 ? `${totals.rowIssues} row issue(s)` : 'No issues'}
              </span>
            </div>
          </div>

          {/* Allocation Mode Selector */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
            <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Item Allocation Mode:</label>
            <div className="grid grid-cols-2 gap-2">
              <label
                onClick={() => handleAllocationModeChange('manual')}
                className={cn(
                  'flex items-center gap-1.5 p-2 rounded-xl border cursor-pointer transition',
                  allocationMode === 'manual'
                    ? 'border-blue-500 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300 font-bold'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                )}
              >
                <input
                  type="radio"
                  name="alloc-mode"
                  checked={allocationMode === 'manual'}
                  onChange={() => {}}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Manual</span>
              </label>

              <label
                onClick={() => handleAllocationModeChange('hamilton')}
                className={cn(
                  'flex items-center gap-1.5 p-2 rounded-xl border cursor-pointer transition',
                  allocationMode === 'hamilton'
                    ? 'border-blue-500 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300 font-bold'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'
                )}
              >
                <input
                  type="radio"
                  name="alloc-mode"
                  checked={allocationMode === 'hamilton'}
                  onChange={() => {}}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Hamilton Auto</span>
              </label>
            </div>
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
                Distribute test items across Bloom&apos;s Taxonomy cognitive process dimensions
              </p>
            </div>

            {/* Validation Banner */}
            <div>
              {totals.totalErrors === 0 ? (
                <div className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Validation Passed: Hours &amp; Items Verified ({totals.currentHours} hrs · {totals.totalAllocatedItems} items)</span>
                </div>
              ) : (
                <div className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                  <span>
                    Validation Alert: {totals.rowIssues > 0 && `${totals.rowIssues} row issue(s)`}
                    {totals.hoursStatus !== 'valid' && ` · Hours: ${totals.currentHours}/${targetHours}`}
                    {totals.itemsStatus !== 'valid' && ` · Items: ${totals.totalAllocatedItems}/${targetItems}`}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Worksheet Matrix Table */}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full text-left text-xs table-optimized min-w-[720px]">
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
                  <th className="px-3 py-3 w-40 font-bold text-gray-700 dark:text-gray-300">Code</th>
                  <th className="px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Learning Competency Description</th>
                  <th className="px-3 py-3 text-center w-16 font-bold text-gray-700 dark:text-gray-300">Hours</th>
                  <th className="px-3 py-3 text-center w-16 font-bold text-blue-600 dark:text-blue-400">Items</th>
                  <th className="px-2 py-3 text-center w-14 text-blue-600 dark:text-blue-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-[10px]" title="Remembering">REM</span>
                  </th>
                  <th className="px-2 py-3 text-center w-14 text-indigo-600 dark:text-indigo-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-[10px]" title="Understanding">UND</span>
                  </th>
                  <th className="px-2 py-3 text-center w-14 text-purple-600 dark:text-purple-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-[10px]" title="Applying">APP</span>
                  </th>
                  <th className="px-2 py-3 text-center w-14 text-amber-600 dark:text-amber-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/50 text-[10px]" title="Analyzing">ANA</span>
                  </th>
                  <th className="px-2 py-3 text-center w-14 text-rose-600 dark:text-rose-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-[10px]" title="Evaluating">EVA</span>
                  </th>
                  <th className="px-2 py-3 text-center w-14 text-emerald-600 dark:text-emerald-400 font-bold">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-[10px]" title="Creating">CRE</span>
                  </th>
                  <th className="px-3 py-3 text-center w-28 font-bold text-gray-700 dark:text-gray-300">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.length === 0 && !isEditing && (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <FileSpreadsheet className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                          No competency rows in this Table of Specifications
                        </span>
                        <p className="text-xs text-gray-400 max-w-sm">
                          Click &quot;Edit Worksheet&quot; to begin adding learning competencies, instructional hours, and item distributions.
                        </p>
                        <button
                          onClick={() => setIsEditing(true)}
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs hover:bg-blue-700 transition"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Add Competency</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )}

                {rows.map((row, idx) => {
                  const expectedItems = getExpectedItems(row);
                  const currentDomainSum =
                    row.domains.remembering +
                    row.domains.understanding +
                    row.domains.applying +
                    row.domains.analyzing +
                    row.domains.evaluating +
                    row.domains.creating;
                  const isHoursZero = !row.hours || row.hours <= 0;
                  const isDomainMatch = currentDomainSum === expectedItems;
                  const isDomainOver = currentDomainSum > expectedItems;

                  const isSelected = selectedIds.has(row.id);

                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'transition-colors',
                        isDomainOver || isHoursZero
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
                          <span className="text-xs text-gray-800 dark:text-gray-200 font-medium">
                            {row.description}
                          </span>
                        )}
                      </td>

                      {/* Hours */}
                      <td className="px-3 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="1"
                            value={row.hours}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].hours = Number(e.target.value) || 0;
                              if (allocationMode === 'hamilton') {
                                setRows(applyHamiltonAllocationToRows(updated, targetItems, targetHours));
                              } else {
                                setRows(updated);
                              }
                            }}
                            className={cn(
                              'w-14 text-center px-1 py-1 text-xs font-bold rounded-lg border transition-colors',
                              isHoursZero
                                ? 'border-rose-500 bg-rose-50 text-rose-700 ring-2 ring-rose-400'
                                : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                            )}
                          />
                        ) : (
                          <span className="text-xs font-semibold text-gray-900 dark:text-white">
                            {row.hours} hrs
                          </span>
                        )}
                      </td>

                      {/* Expected Items */}
                      <td className="px-3 py-3 text-center font-bold text-xs text-blue-600 dark:text-blue-400">
                        {expectedItems}
                      </td>

                      {/* REM */}
                      <td className="px-2 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.remembering}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].domains.remembering = Number(e.target.value) || 0;
                              setRows(updated);
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-blue-600 font-semibold"
                          />
                        ) : (
                          <span
                            className={cn(
                              'text-xs',
                              row.domains.remembering > 0 ? 'font-bold text-blue-600' : 'text-gray-300 dark:text-gray-600'
                            )}
                          >
                            {row.domains.remembering}
                          </span>
                        )}
                      </td>

                      {/* UND */}
                      <td className="px-2 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.understanding}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].domains.understanding = Number(e.target.value) || 0;
                              setRows(updated);
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-indigo-600 font-semibold"
                          />
                        ) : (
                          <span
                            className={cn(
                              'text-xs',
                              row.domains.understanding > 0 ? 'font-bold text-indigo-600' : 'text-gray-300 dark:text-gray-600'
                            )}
                          >
                            {row.domains.understanding}
                          </span>
                        )}
                      </td>

                      {/* APP */}
                      <td className="px-2 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.applying}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].domains.applying = Number(e.target.value) || 0;
                              setRows(updated);
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-purple-600 font-semibold"
                          />
                        ) : (
                          <span
                            className={cn(
                              'text-xs',
                              row.domains.applying > 0 ? 'font-bold text-purple-600' : 'text-gray-300 dark:text-gray-600'
                            )}
                          >
                            {row.domains.applying}
                          </span>
                        )}
                      </td>

                      {/* ANA */}
                      <td className="px-2 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.analyzing}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].domains.analyzing = Number(e.target.value) || 0;
                              setRows(updated);
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-amber-600 font-semibold"
                          />
                        ) : (
                          <span
                            className={cn(
                              'text-xs',
                              row.domains.analyzing > 0 ? 'font-bold text-amber-600' : 'text-gray-300 dark:text-gray-600'
                            )}
                          >
                            {row.domains.analyzing}
                          </span>
                        )}
                      </td>

                      {/* EVA */}
                      <td className="px-2 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.evaluating}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].domains.evaluating = Number(e.target.value) || 0;
                              setRows(updated);
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-rose-600 font-semibold"
                          />
                        ) : (
                          <span
                            className={cn(
                              'text-xs',
                              row.domains.evaluating > 0 ? 'font-bold text-rose-600' : 'text-gray-300 dark:text-gray-600'
                            )}
                          >
                            {row.domains.evaluating}
                          </span>
                        )}
                      </td>

                      {/* CRE */}
                      <td className="px-2 py-3 text-center">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={row.domains.creating}
                            onChange={(e) => {
                              const updated = [...rows];
                              updated[idx].domains.creating = Number(e.target.value) || 0;
                              setRows(updated);
                            }}
                            className="w-12 text-center px-1 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-emerald-600 font-semibold"
                          />
                        ) : (
                          <span
                            className={cn(
                              'text-xs',
                              row.domains.creating > 0 ? 'font-bold text-emerald-600' : 'text-gray-300 dark:text-gray-600'
                            )}
                          >
                            {row.domains.creating}
                          </span>
                        )}
                      </td>

                      {/* Validation Badge */}
                      <td className="px-3 py-3 text-center">
                        {isHoursZero ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            ❌ 0 Hours
                          </span>
                        ) : isDomainMatch ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            ✓ Valid
                          </span>
                        ) : isDomainOver ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                            ❌ Sum: {currentDomainSum} (+{currentDomainSum - expectedItems})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                            ⚠ Sum: {currentDomainSum} (-{expectedItems - currentDomainSum})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Inline Add Row */}
                {isEditing && (
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
                        placeholder="e.g. CS_EN11/12A-EAPP-Ia-c-7"
                        value={newCode}
                        onChange={(e) => setNewCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCommitInlineRow()}
                        className="w-full px-2 py-1 text-xs font-mono rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="text"
                        placeholder="Type competency description..."
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
                        value={newHours}
                        onChange={(e) => setNewHours(Number(e.target.value) || 4)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCommitInlineRow()}
                        className="w-14 text-center px-1 py-1 text-xs font-bold rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                    <td className="px-2 py-2 text-center text-xs text-gray-400">—</td>
                    <td className="px-1 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        value={newDomains.remembering}
                        onChange={(e) => setNewDomains({ ...newDomains, remembering: Number(e.target.value) || 0 })}
                        className="w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-blue-600 font-semibold"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        value={newDomains.understanding}
                        onChange={(e) => setNewDomains({ ...newDomains, understanding: Number(e.target.value) || 0 })}
                        className="w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-indigo-600 font-semibold"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        value={newDomains.applying}
                        onChange={(e) => setNewDomains({ ...newDomains, applying: Number(e.target.value) || 0 })}
                        className="w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-purple-600 font-semibold"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        value={newDomains.analyzing}
                        onChange={(e) => setNewDomains({ ...newDomains, analyzing: Number(e.target.value) || 0 })}
                        className="w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-amber-600 font-semibold"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        value={newDomains.evaluating}
                        onChange={(e) => setNewDomains({ ...newDomains, evaluating: Number(e.target.value) || 0 })}
                        className="w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-rose-600 font-semibold"
                      />
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        value={newDomains.creating}
                        onChange={(e) => setNewDomains({ ...newDomains, creating: Number(e.target.value) || 0 })}
                        className="w-12 text-center px-1 py-1 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-emerald-600 font-semibold"
                      />
                    </td>
                    <td className="px-3 py-2 text-center text-xs font-semibold text-emerald-600">
                      + Add Row
                    </td>
                  </tr>
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
                    <td
                      className={cn(
                        'px-2 py-3 text-center text-xs font-extrabold',
                        totals.hoursStatus === 'valid'
                          ? 'text-emerald-600'
                          : totals.hoursStatus === 'deficit'
                          ? 'text-amber-600'
                          : 'text-rose-600'
                      )}
                    >
                      {totals.currentHours} hrs
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
                    <td className="px-2 py-3 text-center text-xs font-bold text-blue-600">
                      {totals.domainTotals.remembering}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-bold text-indigo-600">
                      {totals.domainTotals.understanding}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-bold text-purple-600">
                      {totals.domainTotals.applying}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-bold text-amber-600">
                      {totals.domainTotals.analyzing}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-bold text-rose-600">
                      {totals.domainTotals.evaluating}
                    </td>
                    <td className="px-2 py-3 text-center text-xs font-bold text-emerald-600">
                      {totals.domainTotals.creating}
                    </td>
                    <td className="px-3 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* ── VIEW TAB 2: OFFICIAL DEPED PRINT PREVIEW ── */}
      {viewMode === 'preview' && (
        <div className="space-y-4">
          <div
            id="official-tos-card"
            className="p-8 bg-white text-gray-900 rounded-2xl border border-gray-200 shadow-md font-serif max-w-4xl mx-auto space-y-6"
          >
            {/* DepEd Official Document Header */}
            <div className="text-center space-y-1 border-b-2 border-gray-900 pb-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Republic of the Philippines</p>
              <p className="text-sm font-bold uppercase tracking-widest text-gray-800">Department of Education</p>
              <p className="text-xs uppercase text-gray-600">Region III — Central Luzon · Division of Tarlac Province</p>
              <h2 className="text-base font-extrabold uppercase text-gray-900 tracking-wider pt-1">
                CAPAS SENIOR HIGH SCHOOL
              </h2>
              <p className="text-xs italic text-gray-500">Capas, Tarlac</p>
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
                  <strong>INSTRUCTOR:</strong> <span>{teacher || '—'}</span>
                </p>
                <p>
                  <strong>TOTAL ITEMS:</strong> <span>{targetItems} Test Items</span>
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
                    <th className="border border-gray-900 p-2 w-12">HOURS</th>
                    <th className="border border-gray-900 p-2 w-12">ITEMS</th>
                    <th className="border border-gray-900 p-2 w-10">REM</th>
                    <th className="border border-gray-900 p-2 w-10">UND</th>
                    <th className="border border-gray-900 p-2 w-10">APP</th>
                    <th className="border border-gray-900 p-2 w-10">ANA</th>
                    <th className="border border-gray-900 p-2 w-10">EVA</th>
                    <th className="border border-gray-900 p-2 w-10">CRE</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr className="border-b border-gray-900 text-center">
                      <td colSpan={10} className="border border-gray-900 p-6 text-xs text-gray-500 italic">
                        No competency data is available for this Table of Specifications. Add competency rows in the Worksheet Editor.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {rows.map((r) => {
                        const items = getExpectedItems(r);
                        return (
                          <tr key={r.id} className="border-b border-gray-900 text-center">
                            <td className="border border-gray-900 p-1.5 font-mono text-[11px] font-bold text-left">
                              {r.code}
                            </td>
                            <td className="border border-gray-900 p-1.5 text-left">{r.description}</td>
                            <td className="border border-gray-900 p-1.5 font-semibold">{r.hours}</td>
                            <td className="border border-gray-900 p-1.5 font-bold">{items}</td>
                            <td className="border border-gray-900 p-1.5">{r.domains.remembering || '-'}</td>
                            <td className="border border-gray-900 p-1.5">{r.domains.understanding || '-'}</td>
                            <td className="border border-gray-900 p-1.5">{r.domains.applying || '-'}</td>
                            <td className="border border-gray-900 p-1.5">{r.domains.analyzing || '-'}</td>
                            <td className="border border-gray-900 p-1.5">{r.domains.evaluating || '-'}</td>
                            <td className="border border-gray-900 p-1.5">{r.domains.creating || '-'}</td>
                          </tr>
                        );
                      })}
                      {/* Totals Row */}
                      <tr className="border-t-2 border-gray-900 font-bold bg-gray-100 text-center">
                        <td colSpan={2} className="border border-gray-900 p-1.5 text-left">
                          TOTALS
                        </td>
                        <td className="border border-gray-900 p-1.5">{totals.currentHours}</td>
                        <td className="border border-gray-900 p-1.5">{totals.totalAllocatedItems}</td>
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

            {/* Print Action Button */}
            <div className="text-center pt-4 print:hidden">
              <button
                onClick={handlePrint}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs inline-flex items-center gap-2 transition"
              >
                <Printer className="h-4 w-4" />
                <span>Print Official TOS Document</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Bulk Action Bar ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-md text-white text-xs px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 sm:gap-6 border border-gray-700">
          <span className="font-semibold text-white whitespace-nowrap">
            {selectedIds.size} row{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <div className="h-4 w-px bg-gray-700" />
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handleBulkDuplicate}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs flex items-center gap-1.5 transition"
            >
              <Copy className="h-3.5 w-3.5" />
              <span>Duplicate</span>
            </button>
            <button
              onClick={() => {
                setRowsToDelete(Array.from(selectedIds));
                setIsDeleteModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 rounded-xl font-semibold shadow-xs flex items-center gap-1.5 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Slide-Over Help Drawer ── */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl p-6 overflow-y-auto space-y-6">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-600" />
                How to fill the TOS Worksheet
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
                <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-1">1. Teaching Hours &amp; Auto Total</h4>
                <p>
                  Enter actual instructional time spent per competency. Total Hours automatically sums up all competency hours.
                </p>
              </div>

              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-200 dark:border-indigo-900">
                <h4 className="font-bold text-indigo-700 dark:text-indigo-400 mb-1">2. Hamilton Auto Allocation</h4>
                <p>
                  Select &quot;Hamilton Auto&quot; in the summary card to calculate target items per competency proportionally (
                  <code className="font-mono text-[11px]">(Hours / Target Hours) × N</code>).
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-gray-900 dark:text-white">3. Bloom&apos;s Cognitive Levels:</h4>
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
    </div>
  );
}
