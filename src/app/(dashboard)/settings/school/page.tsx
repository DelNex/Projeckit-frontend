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
    Award,
    BookOpen,
    CheckCircle2,
    GraduationCap,
    Layers,
    Loader2,
    Plus,
    Save,
    School,
    Trash2,
    Users,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

interface SectionItem {
  id: string;
  name: string;
  grade: string;
  strand_code: string;
  is_advisory: boolean;
  student_count: number;
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

  // Sections & Grade Levels State
  const [sectionsList, setSectionsList] = useState<SectionItem[]>([]);
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionGrade, setNewSectionGrade] = useState('11');
  const [newSectionStrand, setNewSectionStrand] = useState('STEM');
  const [newSectionAdvisory, setNewSectionAdvisory] = useState(false);
  const [addingSection, setAddingSection] = useState(false);

  // DepEd SHS Grading Weights State
  const [weights, setWeights] = useState<GradeComponentWeights>(DEFAULT_SHS_WEIGHTS);

  const supabase = createClient();

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
          const { data: secData } = await (supabase as any)
            .from('sections')
            .select('*')
            .eq('config_id', config.id)
            .order('grade', { ascending: true })
            .order('name', { ascending: true });

          if (secData) setSectionsList(secData);
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

  // Delete Section Handler
  const handleDeleteSection = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove section "${name}"?`)) return;

    try {
      const { error: delErr } = await (supabase as any).from('sections').delete().eq('id', id);
      if (delErr) throw delErr;
      setSectionsList((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      console.error('Failed to delete section:', err);
      setError(err.message || 'Failed to delete section');
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
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Grading Period / Term
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                >
                  <option value="1st Quarter">1st Quarter</option>
                  <option value="2nd Quarter">2nd Quarter</option>
                  <option value="3rd Quarter">3rd Quarter</option>
                  <option value="4th Quarter">4th Quarter</option>
                  <option value="First Semester">First Semester</option>
                  <option value="Second Semester">Second Semester</option>
                  <option value="Midterm">Midterm</option>
                  <option value="Finals">Finals</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Grades & Sections Management */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
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

              <button
                type="button"
                onClick={() => setIsAddSectionOpen(!isAddSectionOpen)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 transition"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Section</span>
              </button>
            </div>

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
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-800"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Grade Level
                    </label>
                    <select
                      value={newSectionGrade}
                      onChange={(e) => setNewSectionGrade(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-800"
                    >
                      <option value="11">Grade 11</option>
                      <option value="12">Grade 12</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                      Academic Strand
                    </label>
                    <select
                      value={newSectionStrand}
                      onChange={(e) => setNewSectionStrand(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-800"
                    >
                      <option value="STEM">STEM</option>
                      <option value="ABM">ABM</option>
                      <option value="HUMSS">HUMSS</option>
                      <option value="TVL">TVL</option>
                      <option value="GAS">GAS</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={newSectionAdvisory}
                      onChange={(e) => setNewSectionAdvisory(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
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
            {sectionsList.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center border border-dashed rounded-2xl dark:border-gray-800">
                No sections registered. Click &quot;Add Section&quot; to enroll your grade levels and classes.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sectionsList.map((sec) => (
                  <div
                    key={sec.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl border border-gray-100 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-800/40 hover:border-gray-200 dark:hover:border-gray-700 transition"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-gray-900 dark:text-white truncate">
                          {sec.name}
                        </span>
                        {sec.is_advisory && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
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

                    <button
                      type="button"
                      onClick={() => handleDeleteSection(sec.id, sec.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition"
                      title="Delete Section"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 3: DepEd Senior High School Component Weights */}
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
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                >
                  {Object.entries(TRACK_WEIGHT_PRESETS).map(([key, val]) => (
                    <option key={key} value={key}>
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
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
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
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
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
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
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
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
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
                  className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
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
                className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
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
    </div>
  );
}
