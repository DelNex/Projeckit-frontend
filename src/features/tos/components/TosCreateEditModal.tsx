'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  HelpCircle,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  User,
  School,
} from 'lucide-react';
import { TosDocument, TosSectionItem, STANDARD_EXAM_TYPES } from '@/types/tos';
import {
  calculateTos,
  TosCompetencyInput,
  CalculatedCompetencyRow,
} from '@/lib/tos-calculator';
import { friendlyError, extractTechnicalError, TechnicalErrorDetails } from '@/lib/errors';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';

interface SectionOption {
  id: string;
  name: string;
  track?: string;
  grade_level?: string;
}

interface GradingPeriodOption {
  id: string;
  name: string;
  is_current: boolean;
}

interface TosCreateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: any) => Promise<TosDocument | void>;
  existingTos?: TosDocument | null;
  availableSections: SectionOption[];
  availableGradingPeriods: GradingPeriodOption[];
  existingSubjects: string[];
  currentSchoolYear: string;
  schoolName: string;
  currentUser: {
    id: string;
    displayName: string;
    isAdmin: boolean;
  };
  hasLinkedExam?: boolean;
}

export function TosCreateEditModal({
  isOpen,
  onClose,
  onSave,
  existingTos,
  availableSections,
  availableGradingPeriods,
  existingSubjects,
  currentSchoolYear,
  schoolName,
  currentUser,
  hasLinkedExam = false,
}: TosCreateEditModalProps) {
  const isEditing = Boolean(existingTos);

  // Form Fields
  const [term, setTerm] = useState('');
  const [examTypeSelect, setExamTypeSelect] = useState('Summative Test 1');
  const [customExamType, setCustomExamType] = useState('');
  const [subject, setSubject] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(50);
  const [description, setDescription] = useState('');
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([]);
  const [competencies, setCompetencies] = useState<
    Array<{ id: string; description: string; daysTaught: number }>
  >([
    {
      id: '1',
      description: 'Implement column aliases using SQL',
      daysTaught: 5,
    },
  ]);

  // Proponent Title Extension
  const [teacherName, setTeacherName] = useState(currentUser.displayName || 'Subject Teacher');
  const [isEditingTeacher, setIsEditingTeacher] = useState(false);

  // Status & Errors
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [technicalDetails, setTechnicalDetails] = useState<TechnicalErrorDetails | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [copiedTech, setCopiedTech] = useState(false);

  // Modals
  const [showUnsavedGuard, setShowUnsavedGuard] = useState(false);
  const [showExamRegenConfirm, setShowExamRegenConfirm] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);

  // Initialize form when opening
  useEffect(() => {
    if (!isOpen) return;

    if (existingTos) {
      setTerm(existingTos.term);
      const isStandardType = (STANDARD_EXAM_TYPES as readonly string[]).includes(
        existingTos.exam_type || ''
      );
      if (isStandardType) {
        setExamTypeSelect(existingTos.exam_type || 'Summative Test 1');
        setCustomExamType('');
      } else {
        setExamTypeSelect('Custom');
        setCustomExamType(existingTos.exam_type || '');
      }
      setSubject(existingTos.subject || '');
      setTotalQuestions(existingTos.target_items || 50);
      setDescription(existingTos.description || '');

      // Sections
      if (Array.isArray(existingTos.sections) && existingTos.sections.length > 0) {
        setSelectedSectionIds(existingTos.sections.map((s) => s.id));
      } else if (existingTos.section) {
        // match by name if possible
        const matched = availableSections.filter((s) =>
          existingTos.section?.includes(s.name)
        );
        setSelectedSectionIds(matched.map((m) => m.id));
      } else {
        setSelectedSectionIds([]);
      }

      // Competencies
      if (Array.isArray(existingTos.rows) && existingTos.rows.length > 0) {
        setCompetencies(
          existingTos.rows.slice(0, 4).map((r, i) => ({
            id: String(i + 1),
            description: r.description || '',
            daysTaught: Number(r.daysTaught || r.days) || 1,
          }))
        );
      }

      setTeacherName(existingTos.teacher_name || currentUser.displayName || 'Subject Teacher');
    } else {
      // Default creation
      const currentPeriod = availableGradingPeriods.find((g) => g.is_current);
      setTerm(currentPeriod?.name || (availableGradingPeriods[0]?.name ?? 'Term 1'));
      setExamTypeSelect('Summative Test 1');
      setCustomExamType('');
      setSubject(existingSubjects[0] || '');
      setTotalQuestions(50);
      setDescription('');
      setSelectedSectionIds(availableSections.length > 0 ? [availableSections[0].id] : []);
      setCompetencies([
        {
          id: '1',
          description: '',
          daysTaught: 5,
        },
      ]);
      setTeacherName(currentUser.displayName || 'Subject Teacher');
    }

    setFormError(null);
    setTechnicalDetails(null);
  }, [isOpen, existingTos, availableGradingPeriods, availableSections, existingSubjects, currentUser]);

  // Live computed items using Hamilton Largest-Remainder
  const activeExamType = examTypeSelect === 'Custom' ? customExamType : examTypeSelect;
  const calcResult = useMemo(() => {
    const validComps: TosCompetencyInput[] = competencies.map((c, i) => ({
      id: c.id,
      code: `COMP-${i + 1}`,
      description: c.description.trim() || `Competency ${i + 1}`,
      daysTaught: Math.max(1, Number(c.daysTaught) || 1),
    }));

    return calculateTos(validComps, Math.max(1, totalQuestions), {
      allocationMode: 'action_verb',
      examType: activeExamType,
    });
  }, [competencies, totalQuestions, activeExamType]);

  if (!isOpen) return null;

  const handleAddCompetency = () => {
    if (competencies.length >= 4) return;
    setCompetencies([
      ...competencies,
      {
        id: String(Date.now()),
        description: '',
        daysTaught: 5,
      },
    ]);
  };

  const handleRemoveCompetency = (index: number) => {
    if (competencies.length <= 1) return;
    const next = [...competencies];
    next.splice(index, 1);
    setCompetencies(next);
  };

  const handleCompetencyChange = (index: number, field: 'description' | 'daysTaught', value: any) => {
    const next = [...competencies];
    next[index] = {
      ...next[index],
      [field]: field === 'daysTaught' ? Math.max(1, Math.min(100, Number(value) || 1)) : value,
    };
    setCompetencies(next);
  };

  const handleSelectAllSections = () => {
    if (selectedSectionIds.length === availableSections.length) {
      setSelectedSectionIds([]);
    } else {
      setSelectedSectionIds(availableSections.map((s) => s.id));
    }
  };

  const toggleSection = (id: string) => {
    if (selectedSectionIds.includes(id)) {
      setSelectedSectionIds(selectedSectionIds.filter((sid) => sid !== id));
    } else {
      setSelectedSectionIds([...selectedSectionIds, id]);
    }
  };

  const validateForm = () => {
    if (!term) return 'Please select an academic term.';
    if (!subject.trim()) return 'Please enter or select a subject.';
    if (examTypeSelect === 'Custom' && !customExamType.trim()) {
      return 'Please specify the custom exam type.';
    }
    if (totalQuestions < 1 || totalQuestions > 90) {
      return 'Total questions must be between 1 and 90.';
    }
    if (selectedSectionIds.length === 0) {
      return 'Please select at least one active section.';
    }
    for (let i = 0; i < competencies.length; i++) {
      if (!competencies[i].description.trim()) {
        return `Please enter a description for Competency ${i + 1}.`;
      }
      if (competencies[i].daysTaught < 1) {
        return `Competency ${i + 1} must have at least 1 day taught.`;
      }
    }
    return null;
  };

  const executeSave = async (payload: any) => {
    setSaving(true);
    setFormError(null);
    setTechnicalDetails(null);

    try {
      await onSave(payload);
      onClose();
    } catch (err: any) {
      console.error('Failed to save Table of Specifications:', {
        code: err?.code,
        message: err?.message,
        details: err?.details,
        hint: err?.hint,
        raw: err,
      });

      const userMsg = friendlyError(err, 'Failed to save Table of Specifications.');
      setFormError(userMsg);
      if (currentUser.isAdmin) {
        setTechnicalDetails(extractTechnicalError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errorMsg = validateForm();
    if (errorMsg) {
      setFormError(errorMsg);
      return;
    }

    const chosenSections: TosSectionItem[] = availableSections
      .filter((s) => selectedSectionIds.includes(s.id))
      .map((s) => ({
        id: s.id,
        name: s.name,
        track: s.track || 'General',
      }));

    const rowsPayload = calcResult.rows.map((r, i) => ({
      id: String(i + 1),
      code: `COMP-${i + 1}`,
      description: r.description,
      daysTaught: r.daysTaught,
      days: r.daysTaught,
      percentage: r.percentage,
      itemCount: r.itemCount,
      domains: r.domains,
      domainItemNumbers: r.domainItemNumbers,
      domainDisplay: r.domainDisplay,
    }));

    const totalDaysTaught = competencies.reduce((acc, c) => acc + c.daysTaught, 0);

    const payload = {
      subject: subject.trim(),
      term,
      school_year: currentSchoolYear,
      target_items: totalQuestions,
      total_days: totalDaysTaught,
      days_taught: totalDaysTaught,
      status: 'draft',
      exam_type: activeExamType,
      description: description.trim() || undefined,
      sections: chosenSections,
      section: chosenSections.map((s) => s.name).join(', '),
      teacher_name: teacherName.trim(),
      rows: rowsPayload,
    };

    if (isEditing && hasLinkedExam) {
      setPendingPayload(payload);
      setShowExamRegenConfirm(true);
    } else {
      executeSave(payload);
    }
  };

  const copyTechnicalText = () => {
    if (!technicalDetails) return;
    navigator.clipboard.writeText(technicalDetails.fullText);
    setCopiedTech(true);
    setTimeout(() => setCopiedTech(false), 2000);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
        <div className="relative w-full max-w-3xl my-8 bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {isEditing ? 'Edit Table of Specification' : 'Create Table of Specification'}
              </h2>
              <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1 font-medium">
                  <School className="h-3.5 w-3.5" />
                  {schoolName}
                </span>
                <span>•</span>
                <span>S.Y. {currentSchoolYear}</span>
              </div>
            </div>
            <button
              onClick={() => setShowUnsavedGuard(true)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body / Scroll Area */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            {/* Error Banner with Technical Details for Admin */}
            {formError && (
              <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 text-sm space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 font-medium">{formError}</div>
                </div>

                {currentUser.isAdmin && technicalDetails && (
                  <div className="mt-2 pt-2 border-t border-rose-200 dark:border-rose-900/60">
                    <button
                      type="button"
                      onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                      className="text-xs font-semibold flex items-center gap-1 text-rose-700 dark:text-rose-300 hover:underline"
                    >
                      Technical details (Admin only){' '}
                      {showTechnicalDetails ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>

                    {showTechnicalDetails && (
                      <div className="mt-2 p-3 bg-white/70 dark:bg-slate-900/80 rounded-xl font-mono text-[11px] space-y-2">
                        <pre className="overflow-x-auto whitespace-pre-wrap">{technicalDetails.fullText}</pre>
                        <button
                          type="button"
                          onClick={copyTechnicalText}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-rose-100 dark:bg-rose-900/60 rounded-md font-sans font-medium"
                        >
                          {copiedTech ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          {copiedTech ? 'Copied' : 'Copy Technical Details'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Top Grid: Term, Exam Type, Subject, Total Questions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {/* Term */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Term <span className="text-rose-500">*</span>
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                >
                  {availableGradingPeriods.map((gp) => (
                    <option key={gp.id} value={gp.name}>
                      {gp.name} {gp.is_current ? '(Current)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exam Type */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Exam Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={examTypeSelect}
                  onChange={(e) => setExamTypeSelect(e.target.value)}
                  className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                >
                  {STANDARD_EXAM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                  <option value="Custom">Custom...</option>
                </select>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Subject <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  list="subject-suggestions"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Science 10"
                  className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
                <datalist id="subject-suggestions">
                  {existingSubjects.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>

              {/* Total Questions */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Total Questions <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={totalQuestions}
                  onChange={(e) => setTotalQuestions(Number(e.target.value))}
                  className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none font-semibold"
                  required
                />
              </div>
            </div>

            {/* Custom Exam Type Input if selected */}
            {examTypeSelect === 'Custom' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Custom Exam Type Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={customExamType}
                  onChange={(e) => setCustomExamType(e.target.value)}
                  placeholder="e.g. Midterm Diagnostic Examination"
                  className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>
            )}

            {/* Lesson / Topic Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Lesson / Description <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Lesson 6 - Managing Data in Oracle"
                className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            {/* Sections Checklist */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Section(s) <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select every section that will use this TOS and examination.
                  </p>
                </div>
                {availableSections.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllSections}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    {selectedSectionIds.length === availableSections.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
              </div>

              {availableSections.length === 0 ? (
                <div className="p-3 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                  No active sections found in the current school configuration.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-40 overflow-y-auto p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  {availableSections.map((sec) => {
                    const isChecked = selectedSectionIds.includes(sec.id);
                    return (
                      <label
                        key={sec.id}
                        onClick={() => toggleSection(sec.id)}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer select-none transition-all ${
                          isChecked
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by wrapper click
                          className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {sec.name}
                          </div>
                          {sec.track && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {sec.track}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Learning Competencies Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Learning Competencies (1 to 4) <span className="text-rose-500">*</span>
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Enter each competency and Days Taught. Project KIT computes items live via largest-remainder math.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleAddCompetency}
                  disabled={competencies.length >= 4}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 rounded-xl hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Competency</span>
                </button>
              </div>

              {competencies.length >= 4 && (
                <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-200 dark:border-amber-800">
                  A TOS can have up to 4 learning competencies.
                </div>
              )}

              {/* Table of Competencies */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    <tr>
                      <th className="py-2.5 px-3 w-12 text-center">No.</th>
                      <th className="py-2.5 px-3">Learning Competency</th>
                      <th className="py-2.5 px-3 w-28 text-center">Days Taught</th>
                      <th className="py-2.5 px-3 w-32 text-center">Computed Items</th>
                      <th className="py-2.5 px-3 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {competencies.map((comp, index) => {
                      const computedItemCount = calcResult.rows[index]?.itemCount || 0;
                      return (
                        <tr key={comp.id}>
                          <td className="py-2.5 px-3 text-center font-bold text-slate-500">
                            {index + 1}
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={comp.description}
                              onChange={(e) => handleCompetencyChange(index, 'description', e.target.value)}
                              placeholder="Example: Implement column aliases using SQL"
                              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-2.5 py-1.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                              required
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="1"
                              max="100"
                              value={comp.daysTaught}
                              onChange={(e) => handleCompetencyChange(index, 'daysTaught', e.target.value)}
                              className="w-full text-xs text-center font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white px-2 py-1.5 focus:ring-2 focus:ring-emerald-500 outline-none"
                              required
                            />
                          </td>
                          <td className="py-2.5 px-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                            {computedItemCount} items
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveCompetency(index)}
                              disabled={competencies.length <= 1}
                              className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Delete competency"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bloom's Explanation Box */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <HelpCircle className="h-4 w-4 text-emerald-600" />
                <span>Automatic Bloom placement</span>
              </div>
              <p className="leading-relaxed">
                Items for each competency are divided as evenly as possible across the six Bloom levels. Any remainder
                starts with the competency&apos;s primary level, which is detected from its action verb. Lower-order and
                higher-order thinking are balanced according to the exam type, whole item counts are assigned, and every
                item number is placed under Remembering, Understanding, Applying, Analyzing, Evaluating or Creating.
              </p>
            </div>

            {/* Proponent & Teacher Info */}
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" />
                <span>Proponent / Teacher: </span>
                {isEditingTeacher ? (
                  <input
                    type="text"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    className="text-xs font-bold rounded border px-2 py-0.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                ) : (
                  <span className="font-bold text-slate-900 dark:text-white">{teacherName}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsEditingTeacher(!isEditingTeacher)}
                className="font-semibold text-emerald-600 hover:underline"
              >
                {isEditingTeacher ? 'Done' : 'Edit Title'}
              </button>
            </div>

            {/* Footer Buttons */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>{isEditing ? 'Save changes' : 'Generate TOS'}</span>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Unsaved Changes Guard */}
      <ConfirmationModal
        isOpen={showUnsavedGuard}
        title="Discard Unsaved Changes?"
        description="You have unsaved changes in this Table of Specification. Are you sure you want to close without saving?"
        confirmLabel="Discard & Close"
        cancelLabel="Continue Editing"
        actionType="delete"
        onConfirm={() => {
          setShowUnsavedGuard(false);
          onClose();
        }}
        onClose={() => setShowUnsavedGuard(false)}
      />

      {/* Linked Exam Regeneration Warning */}
      <ConfirmationModal
        isOpen={showExamRegenConfirm}
        title="Regenerate Linked Examination?"
        description="This TOS already has a linked examination. Updating the competencies, items, or domains will require regenerating the exam draft to match the new TOS structure."
        confirmLabel="Save & Regenerate"
        cancelLabel="Cancel"
        actionType="neutral"
        onConfirm={() => {
          setShowExamRegenConfirm(false);
          if (pendingPayload) executeSave(pendingPayload);
        }}
        onClose={() => setShowExamRegenConfirm(false)}
      />
    </>
  );
}
