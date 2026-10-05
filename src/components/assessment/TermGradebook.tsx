/**
 * Project KIT — DepEd Electronic Class Record (E-Class Record) & Term Gradebook
 * Compliant with DepEd Order No. 8, s. 2015 for Senior High School (SHS)
 * Integrates directly with OMR-acquired test paper scores and computes transmuted term grades.
 */

'use client';

import {
    calculateStudentTermGrade,
    DEFAULT_SHS_WEIGHTS,
    getSavedGradingWeights,
    GradeComponentWeights,
    TRACK_WEIGHT_PRESETS,
} from '@/lib/deped-grading';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
    AlertCircle,
    Award,
    Camera,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    HelpCircle,
    Loader2,
    Minus,
    Plus,
    Printer,
    RefreshCw,
    Save,
    Settings2,
    Trash2,
    UserCheck,
    Users,
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

export interface GradebookStudent {
  id: string;
  name: string;
  lrn: string;
  rollNumber: number;
  sectionName?: string;
  quizzes: Record<string, number>;
  activities: Record<string, number>;
  testScore: number;
  isOmrAcquired: boolean;
  omrConfidence?: number;
}

export interface ActivityColumn {
  id: string;
  title: string;
  maxScore: number;
}

export interface TermGradebookProps {
  assessmentId: string;
  assessmentTitle: string;
  subjectTitle: string;
  sectionName: string;
  schoolYear: string;
  initialTerm: string;
  targetItems: number;
  scannedResponses?: any[];
  onScoresSaved?: () => void;
}

const AVAILABLE_TERMS = [
  '1st Quarter',
  '2nd Quarter',
  '3rd Quarter',
  '4th Quarter',
  'Midterm',
  'Finals',
];

export function TermGradebook({
  assessmentId,
  assessmentTitle,
  subjectTitle,
  sectionName,
  schoolYear,
  initialTerm,
  targetItems,
  scannedResponses = [],
  onScoresSaved,
}: TermGradebookProps) {
  const supabase = createClient();

  const [activeTerm, setActiveTerm] = useState(initialTerm || '1st Quarter');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Grade Component Weights
  const [weights, setWeights] = useState<GradeComponentWeights>(() => getSavedGradingWeights());
  const [isWeightsModalOpen, setIsWeightsModalOpen] = useState(false);

  // Dynamic Assessment Columns
  const [quizzes, setQuizzes] = useState<ActivityColumn[]>([
    { id: 'q1', title: 'Quiz 1', maxScore: 20 },
    { id: 'q2', title: 'Quiz 2', maxScore: 25 },
  ]);

  const [activities, setActivities] = useState<ActivityColumn[]>([
    { id: 'act1', title: 'Activity 1', maxScore: 30 },
    { id: 'act2', title: 'Activity 2', maxScore: 40 },
    { id: 'pt1', title: 'Performance Task 1', maxScore: 50 },
  ]);

  // Students roster with scores
  const [students, setStudents] = useState<GradebookStudent[]>([]);

  // Search / Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Storage key for caching offline gradebook data
  const storageKey = `projectkit_gradebook_${assessmentId}_${activeTerm}`;

  // Load students & match with existing responses / OMR scans
  const loadGradebookData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      // 1. Fetch Students from class section
      const { data: studentsData, error: sErr } = await (supabase as any)
        .from('students')
        .select('id, name, lrn, section_name')
        .order('name', { ascending: true });

      if (sErr) throw sErr;

      // Filter by section if match exists, otherwise show roster
      const sectionStudents = (studentsData || []).filter((s: any) =>
        sectionName ? s.section_name?.toLowerCase() === sectionName.toLowerCase() : true
      );

      const roster = sectionStudents.length > 0 ? sectionStudents : (studentsData || []);

      // 2. Fetch existing responses for this assessment
      const { data: responsesData } = await (supabase as any)
        .from('responses')
        .select('*')
        .eq('assessment_id', assessmentId);

      // Check local storage backup for term-specific quizzes/activities
      let localCache: any = null;
      try {
        const cached = localStorage.getItem(storageKey);
        if (cached) localCache = JSON.parse(cached);
      } catch {}

      if (localCache?.quizzes) setQuizzes(localCache.quizzes);
      if (localCache?.activities) setActivities(localCache.activities);
      if (localCache?.weights) setWeights(localCache.weights);

      // Map students with responses & cached scores
      const mappedStudents: GradebookStudent[] = roster.map((s: any, idx: number) => {
        const rollNum = idx + 1;

        // Match by student_id or LRN or roll
        const matchResponse = (responsesData || []).find(
          (r: any) => r.student_id === s.id || r.student_lrn === s.lrn
        );

        // Check local cached student scores
        const cachedStudent = localCache?.students?.[s.id];

        const testScore =
          matchResponse?.score !== undefined
            ? Number(matchResponse.score)
            : cachedStudent?.testScore !== undefined
            ? Number(cachedStudent.testScore)
            : 0;

        const isOmr = Boolean(matchResponse || cachedStudent?.isOmrAcquired);

        // Initialize quizzes: default all to 0, and cleanse any old placeholder mock scores
        const studentQuizzes: Record<string, number> = {};
        quizzes.forEach((q) => {
          studentQuizzes[q.id] = 0;
        });
        if (cachedStudent?.quizzes) {
          Object.keys(cachedStudent.quizzes).forEach((k) => {
            const val = Number(cachedStudent.quizzes[k]);
            if ((k === 'q1' && val === 18) || (k === 'q2' && val === 22)) {
              studentQuizzes[k] = 0;
            } else {
              studentQuizzes[k] = isNaN(val) ? 0 : val;
            }
          });
        }

        // Initialize activities: default all to 0, and cleanse any old placeholder mock scores
        const studentActivities: Record<string, number> = {};
        activities.forEach((a) => {
          studentActivities[a.id] = 0;
        });
        if (cachedStudent?.activities) {
          Object.keys(cachedStudent.activities).forEach((k) => {
            const val = Number(cachedStudent.activities[k]);
            if ((k === 'act1' && val === 27) || (k === 'act2' && val === 36) || (k === 'pt1' && val === 45)) {
              studentActivities[k] = 0;
            } else {
              studentActivities[k] = isNaN(val) ? 0 : val;
            }
          });
        }

        return {
          id: s.id,
          name: s.name,
          lrn: s.lrn,
          rollNumber: rollNum,
          sectionName: s.section_name,
          quizzes: studentQuizzes,
          activities: studentActivities,
          testScore,
          isOmrAcquired: isOmr,
          omrConfidence: matchResponse?.audit_trail?.confidence,
        };
      });

      setStudents(mappedStudents);
    } catch (err: any) {
      console.error('Failed to load gradebook roster:', err);
      setErrorMessage(err.message || 'Failed to load student roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGradebookData();
  }, [assessmentId, activeTerm]);

  // Handle score change for a specific student and column
  const handleScoreChange = (
    studentId: string,
    type: 'quiz' | 'activity' | 'test',
    colId: string,
    value: string
  ) => {
    const numVal = Math.max(0, parseFloat(value) || 0);

    setStudents((prev) =>
      prev.map((student) => {
        if (student.id !== studentId) return student;

        if (type === 'quiz') {
          return {
            ...student,
            quizzes: { ...student.quizzes, [colId]: numVal },
          };
        }
        if (type === 'activity') {
          return {
            ...student,
            activities: { ...student.activities, [colId]: numVal },
          };
        }
        if (type === 'test') {
          return {
            ...student,
            testScore: numVal,
            isOmrAcquired: false, // marked as manual override
          };
        }
        return student;
      })
    );
  };

  // Add a new Quiz column
  const handleAddQuiz = () => {
    const newId = `q${quizzes.length + 1}`;
    setQuizzes([...quizzes, { id: newId, title: `Quiz ${quizzes.length + 1}`, maxScore: 20 }]);
  };

  // Remove a Quiz column
  const handleRemoveQuiz = (id: string) => {
    if (quizzes.length <= 1) return;
    setQuizzes(quizzes.filter((q) => q.id !== id));
  };

  // Add a new Activity column
  const handleAddActivity = () => {
    const newId = `act${activities.length + 1}`;
    setActivities([
      ...activities,
      { id: newId, title: `Activity ${activities.length + 1}`, maxScore: 30 },
    ]);
  };

  // Remove an Activity column
  const handleRemoveActivity = (id: string) => {
    if (activities.length <= 1) return;
    setActivities(activities.filter((a) => a.id !== id));
  };

  // Save gradebook to Supabase & localStorage
  const handleSaveGradebook = async () => {
    setSaving(true);
    setSaveMessage(null);
    setErrorMessage(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();

      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      // 1. Save local snapshot
      const cachePayload = {
        quizzes,
        activities,
        weights,
        students: students.reduce((acc, s) => {
          acc[s.id] = s;
          return acc;
        }, {} as Record<string, GradebookStudent>),
      };
      localStorage.setItem(storageKey, JSON.stringify(cachePayload));

      // 2. Persist student responses and term grade summaries into Supabase
      const upsertPromises = students.map(async (student) => {
        const gradeCalc = calculateStudentTermGrade(
          quizzes.map((q) => student.quizzes[q.id] || 0),
          quizzes.map((q) => q.maxScore),
          activities.map((a) => student.activities[a.id] || 0),
          activities.map((a) => a.maxScore),
          student.testScore,
          targetItems,
          weights
        );

        return (supabase as any).from('responses').upsert(
          {
            assessment_id: assessmentId,
            tenant_id: tenantId,
            student_id: student.id,
            student_lrn: student.lrn,
            section_name: student.sectionName || sectionName,
            score: student.testScore,
            total_items: targetItems,
            percentage: gradeCalc.qaPercentage,
            status: 'GRADED',
            audit_trail: {
              term: activeTerm,
              initialGrade: gradeCalc.initialGrade,
              transmutedGrade: gradeCalc.transmutedGrade,
              descriptor: gradeCalc.descriptor.descriptor,
              wwWeighted: gradeCalc.wwWeighted,
              ptWeighted: gradeCalc.ptWeighted,
              qaWeighted: gradeCalc.qaWeighted,
              quizzes: student.quizzes,
              activities: student.activities,
              weights,
            },
          },
          { onConflict: 'assessment_id,student_id' }
        );
      });

      await Promise.all(upsertPromises);

      setSaveMessage(`Successfully saved term grades for ${students.length} students!`);
      if (onScoresSaved) onScoresSaved();
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: any) {
      console.error('Failed to save gradebook:', err);
      setErrorMessage(err.message || 'Failed to save gradebook data to database.');
    } finally {
      setSaving(false);
    }
  };

  // Computed grade calculations for all students
  const calculatedRows = useMemo(() => {
    return students.map((student) => {
      const calc = calculateStudentTermGrade(
        quizzes.map((q) => student.quizzes[q.id] || 0),
        quizzes.map((q) => q.maxScore),
        activities.map((a) => student.activities[a.id] || 0),
        activities.map((a) => a.maxScore),
        student.testScore,
        targetItems,
        weights
      );
      return { student, calc };
    });
  }, [students, quizzes, activities, targetItems, weights]);

  // Filtered rows by search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return calculatedRows;
    const q = searchQuery.toLowerCase();
    return calculatedRows.filter(
      (r) =>
        r.student.name.toLowerCase().includes(q) ||
        r.student.lrn.includes(q) ||
        String(r.student.rollNumber) === q
    );
  }, [calculatedRows, searchQuery]);

  // Overall Class KPI Statistics
  const classKpis = useMemo(() => {
    if (calculatedRows.length === 0) {
      return { count: 0, avgGrade: 0, passingRate: 0, high: 0, low: 0 };
    }
    const grades = calculatedRows.map((r) => r.calc.transmutedGrade);
    const sum = grades.reduce((acc, g) => acc + g, 0);
    const avg = sum / grades.length;
    const passed = calculatedRows.filter((r) => r.calc.descriptor.isPassed).length;

    return {
      count: calculatedRows.length,
      avgGrade: Math.round(avg * 10) / 10,
      passingRate: Math.round((passed / calculatedRows.length) * 1000) / 10,
      high: Math.max(...grades),
      low: Math.min(...grades),
    };
  }, [calculatedRows]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Roll No',
      'LRN',
      'Student Name',
      ...quizzes.map((q) => `${q.title} (${q.maxScore})`),
      'WW Total',
      'WW %',
      'WW WS',
      ...activities.map((a) => `${a.title} (${a.maxScore})`),
      'PT Total',
      'PT %',
      'PT WS',
      `OMR Exam (${targetItems})`,
      'QA %',
      'QA WS',
      'Initial Grade',
      'Transmuted Term Grade',
      'Remarks',
    ];

    const rows = calculatedRows.map(({ student, calc }) => [
      student.rollNumber,
      `="${student.lrn}"`,
      `"${student.name}"`,
      ...quizzes.map((q) => student.quizzes[q.id] || 0),
      calc.wwTotal,
      calc.wwPercentage,
      calc.wwWeighted,
      ...activities.map((a) => student.activities[a.id] || 0),
      calc.ptTotal,
      calc.ptPercentage,
      calc.ptWeighted,
      student.testScore,
      calc.qaPercentage,
      calc.qaWeighted,
      calc.initialGrade,
      calc.transmutedGrade,
      `"${calc.descriptor.descriptor}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `DepEd_EClassRecord_${sectionName}_${activeTerm.replace(/\s+/g, '_')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-3 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 min-w-0">
      {/* Header and Term Selector */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-gray-100 pb-4 dark:border-gray-800 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
              DepEd E-Class Record &amp; Term Grades
            </h2>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            DepEd Order No. 8, s. 2015 Compliant • Automatic OMR Test Score Integration
          </p>
        </div>

        {/* Term Picker and Action Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Term Switcher */}
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl text-xs">
            {AVAILABLE_TERMS.map((term) => (
              <button
                key={term}
                onClick={() => setActiveTerm(term)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap',
                  activeTerm === term
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                )}
              >
                {term}
              </button>
            ))}
          </div>

          {/* Configure Weights */}
          <button
            onClick={() => setIsWeightsModalOpen(!isWeightsModalOpen)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 transition"
            title="Configure Component Weights"
          >
            <Settings2 className="h-3.5 w-3.5 text-gray-500" />
            <span>
              Weights ({Math.round(weights.writtenWorks * 100)}/{Math.round(weights.performanceTasks * 100)}/{Math.round(weights.quarterlyAssessment * 100)})
            </span>
          </button>

          {/* Save to Supabase */}
          <button
            onClick={handleSaveGradebook}
            disabled={saving || loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{saving ? 'Saving…' : 'Save Gradebook'}</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 transition"
            title="Export to CSV"
          >
            <Download className="h-3.5 w-3.5 text-gray-500" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {saveMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{saveMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-800 dark:bg-red-950/40 dark:border-red-800 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Weights Settings Popover Panel */}
      {isWeightsModalOpen && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20 text-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-gray-900 dark:text-white">
              DepEd Component Weights Configuration (Must total 100%)
            </span>
            <button
              onClick={() => setIsWeightsModalOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-white font-bold"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                Track Preset
              </label>
              <select
                onChange={(e) => {
                  const preset = TRACK_WEIGHT_PRESETS[e.target.value];
                  if (preset) setWeights(preset.weights);
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-1.5 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
              >
                {Object.entries(TRACK_WEIGHT_PRESETS).map(([key, val]) => (
                  <option key={key} value={key} className="bg-white text-gray-900 dark:bg-gray-800 dark:text-white">
                    {val.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                Written Works % (Quizzes)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={Math.round(weights.writtenWorks * 100)}
                onChange={(e) =>
                  setWeights({ ...weights, writtenWorks: (parseFloat(e.target.value) || 0) / 100 })
                }
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-1.5 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                Performance Tasks % (Activities)
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
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-1.5 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                Quarterly Assessment % (OMR Exam)
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
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-1.5 text-xs text-gray-900 outline-none focus:border-blue-600 dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800 dark:text-white dark:focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* KPI Statistic Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-800/40">
          <span className="text-[11px] font-medium text-gray-400">Class Enrolled</span>
          <p className="mt-1 text-base sm:text-lg font-bold text-gray-900 dark:text-white">
            {classKpis.count} Learners
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-800/40">
          <span className="text-[11px] font-medium text-gray-400">Class Average</span>
          <p className="mt-1 text-base sm:text-lg font-bold text-blue-600 dark:text-blue-400">
            {classKpis.avgGrade}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-800/40">
          <span className="text-[11px] font-medium text-gray-400">Passing Rate</span>
          <p className="mt-1 text-base sm:text-lg font-bold text-emerald-600 dark:text-emerald-400">
            {classKpis.passingRate}%
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-800/40">
          <span className="text-[11px] font-medium text-gray-400">Highest Term Grade</span>
          <p className="mt-1 text-base sm:text-lg font-bold text-purple-600 dark:text-purple-400">
            {classKpis.high}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-800/40 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-medium text-gray-400">OMR Test Item Count</span>
          <p className="mt-1 text-base sm:text-lg font-bold text-amber-600 dark:text-amber-400">
            {targetItems} Items
          </p>
        </div>
      </div>

      {/* Column Management Toolbar & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAddQuiz}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300 transition"
          >
            <Plus className="h-3 w-3" />
            <span>Add Quiz (WW)</span>
          </button>

          <button
            onClick={handleAddActivity}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 transition"
          >
            <Plus className="h-3 w-3" />
            <span>Add Activity (PT)</span>
          </button>
        </div>

        <input
          type="text"
          placeholder="Filter student name or LRN…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 max-w-xs"
        />
      </div>

      {/* Comprehensive E-Class Record Table */}
      <div className="overflow-x-auto -mx-3 sm:mx-0 border border-gray-200 rounded-2xl dark:border-gray-800">
        <table className="w-full text-left text-xs table-auto min-w-[950px]">
          {/* Top Multi-Header (DepEd Grading Standard) */}
          <thead className="bg-gray-100/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th rowSpan={2} className="px-3 py-2 text-center w-12 border-r border-gray-200 dark:border-gray-700 font-bold">
                Roll
              </th>
              <th rowSpan={2} className="px-3 py-2 min-w-[180px] border-r border-gray-200 dark:border-gray-700 font-bold">
                Learner Name
              </th>

              {/* Written Works Group */}
              <th
                colSpan={quizzes.length + 3}
                className="px-3 py-1.5 text-center bg-blue-50/70 dark:bg-blue-950/30 text-blue-800 dark:text-blue-300 border-r border-gray-200 dark:border-gray-700 font-bold text-[11px]"
              >
                Written Works ({Math.round(weights.writtenWorks * 100)}%)
              </th>

              {/* Performance Tasks Group */}
              <th
                colSpan={activities.length + 3}
                className="px-3 py-1.5 text-center bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-r border-gray-200 dark:border-gray-700 font-bold text-[11px]"
              >
                Performance Tasks ({Math.round(weights.performanceTasks * 100)}%)
              </th>

              {/* Quarterly Assessment (OMR Exam) Group */}
              <th
                colSpan={3}
                className="px-3 py-1.5 text-center bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border-r border-gray-200 dark:border-gray-700 font-bold text-[11px]"
              >
                Quarterly Exam ({Math.round(weights.quarterlyAssessment * 100)}%)
              </th>

              {/* Final Term Grade Summary */}
              <th
                colSpan={3}
                className="px-3 py-1.5 text-center bg-purple-50/70 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300 font-bold text-[11px]"
              >
                {activeTerm} Summary
              </th>
            </tr>

            {/* Sub-Header Row with Individual Column Names & Max Scores */}
            <tr className="border-t border-gray-200 dark:border-gray-700 text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400">
              {/* Individual Quizzes */}
              {quizzes.map((q) => (
                <th key={q.id} className="px-2 py-1.5 text-center bg-blue-50/30 dark:bg-blue-950/10">
                  <div className="flex items-center justify-center gap-1">
                    <span>{q.title}</span>
                    {quizzes.length > 1 && (
                      <button
                        onClick={() => handleRemoveQuiz(q.id)}
                        className="text-gray-400 hover:text-red-500"
                        title="Remove column"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="text-[9px] text-blue-600 dark:text-blue-400 font-normal">
                    Max: {q.maxScore}
                  </div>
                </th>
              ))}
              <th className="px-2 py-1 text-center bg-blue-100/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 font-bold">
                Total
              </th>
              <th className="px-2 py-1 text-center bg-blue-100/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                PS %
              </th>
              <th className="px-2 py-1 text-center bg-blue-100/50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 border-r border-gray-200 dark:border-gray-700">
                WS
              </th>

              {/* Individual Activities */}
              {activities.map((a) => (
                <th key={a.id} className="px-2 py-1.5 text-center bg-emerald-50/30 dark:bg-emerald-950/10">
                  <div className="flex items-center justify-center gap-1">
                    <span>{a.title}</span>
                    {activities.length > 1 && (
                      <button
                        onClick={() => handleRemoveActivity(a.id)}
                        className="text-gray-400 hover:text-red-500"
                        title="Remove column"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className="text-[9px] text-emerald-600 dark:text-emerald-400 font-normal">
                    Max: {a.maxScore}
                  </div>
                </th>
              ))}
              <th className="px-2 py-1 text-center bg-emerald-100/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 font-bold">
                Total
              </th>
              <th className="px-2 py-1 text-center bg-emerald-100/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200">
                PS %
              </th>
              <th className="px-2 py-1 text-center bg-emerald-100/50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 border-r border-gray-200 dark:border-gray-700">
                WS
              </th>

              {/* QA Columns */}
              <th className="px-2 py-1.5 text-center bg-amber-50/30 dark:bg-amber-950/10">
                <span>OMR Test</span>
                <div className="text-[9px] text-amber-600 dark:text-amber-400 font-normal">
                  Max: {targetItems}
                </div>
              </th>
              <th className="px-2 py-1 text-center bg-amber-100/50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                PS %
              </th>
              <th className="px-2 py-1 text-center bg-amber-100/50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-r border-gray-200 dark:border-gray-700">
                WS
              </th>

              {/* Final Summary Columns */}
              <th className="px-2.5 py-1 text-center bg-purple-100/40 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200">
                Initial
              </th>
              <th className="px-3 py-1 text-center bg-purple-600 text-white font-black text-xs">
                Grade
              </th>
              <th className="px-2.5 py-1 text-center bg-purple-100/40 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200">
                Remarks
              </th>
            </tr>
          </thead>

          {/* Student Rows Body */}
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={quizzes.length + activities.length + 12} className="py-12 text-center text-gray-400">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                  <span>Loading class gradebook roster from Supabase…</span>
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={quizzes.length + activities.length + 12} className="py-8 text-center text-gray-400">
                  No students found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredRows.map(({ student, calc }, rowIdx) => (
                <tr
                  key={student.id}
                  className="hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors"
                >
                  {/* Roll # */}
                  <td className="px-3 py-2 text-center font-mono text-gray-500 dark:text-gray-400 border-r border-gray-100 dark:border-gray-800">
                    {student.rollNumber}
                  </td>

                  {/* Student Name & LRN */}
                  <td className="px-3 py-2 border-r border-gray-100 dark:border-gray-800">
                    <div className="font-bold text-gray-900 dark:text-white truncate max-w-[200px]">
                      {student.name}
                    </div>
                    <div className="font-mono text-[10px] text-gray-400">
                      LRN: {student.lrn}
                    </div>
                  </td>

                  {/* Quizzes Inputs */}
                  {quizzes.map((q) => (
                    <td key={q.id} className="p-1 text-center bg-blue-50/20 dark:bg-blue-950/5">
                      <input
                        type="number"
                        min="0"
                        max={q.maxScore}
                        value={student.quizzes[q.id] ?? ''}
                        onChange={(e) =>
                          handleScoreChange(student.id, 'quiz', q.id, e.target.value)
                        }
                        className="w-14 text-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 text-xs font-mono font-bold text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-blue-500"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-mono font-bold text-blue-950 dark:text-blue-200 bg-blue-100/30 dark:bg-blue-950/20">
                    {calc.wwTotal}
                  </td>
                  <td className="px-2 py-2 text-center font-mono text-[11px] text-gray-600 dark:text-gray-300 bg-blue-100/30 dark:bg-blue-950/20">
                    {calc.wwPercentage}%
                  </td>
                  <td className="px-2 py-2 text-center font-mono font-bold text-blue-600 dark:text-blue-400 border-r border-gray-100 dark:border-gray-800 bg-blue-100/30 dark:bg-blue-950/20">
                    {calc.wwWeighted}
                  </td>

                  {/* Activities Inputs */}
                  {activities.map((a) => (
                    <td key={a.id} className="p-1 text-center bg-emerald-50/20 dark:bg-emerald-950/5">
                      <input
                        type="number"
                        min="0"
                        max={a.maxScore}
                        value={student.activities[a.id] ?? ''}
                        onChange={(e) =>
                          handleScoreChange(student.id, 'activity', a.id, e.target.value)
                        }
                        className="w-14 text-center rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 text-xs font-mono font-bold text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-emerald-500"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center font-mono font-bold text-emerald-950 dark:text-emerald-200 bg-emerald-100/30 dark:bg-emerald-950/20">
                    {calc.ptTotal}
                  </td>
                  <td className="px-2 py-2 text-center font-mono text-[11px] text-gray-600 dark:text-gray-300 bg-emerald-100/30 dark:bg-emerald-950/20">
                    {calc.ptPercentage}%
                  </td>
                  <td className="px-2 py-2 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400 border-r border-gray-100 dark:border-gray-800 bg-emerald-100/30 dark:bg-emerald-950/20">
                    {calc.ptWeighted}
                  </td>

                  {/* OMR Test Paper Score */}
                  <td className="p-1 text-center bg-amber-50/20 dark:bg-amber-950/5">
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max={targetItems}
                        value={student.testScore}
                        onChange={(e) =>
                          handleScoreChange(student.id, 'test', 'score', e.target.value)
                        }
                        className={cn(
                          'w-14 text-center rounded-md border py-1 text-xs font-mono font-bold focus:ring-1 focus:ring-amber-500',
                          student.isOmrAcquired
                            ? 'border-emerald-500/80 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                        )}
                        title={student.isOmrAcquired ? 'Acquired via Camera OMR Scan' : 'Manual score'}
                      />
                      {student.isOmrAcquired && (
                        <span title="Acquired from OMR Camera Scanner">
                          <Camera className="h-3 w-3 text-emerald-600 shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center font-mono text-[11px] text-gray-600 dark:text-gray-300 bg-amber-100/30 dark:bg-amber-950/20">
                    {calc.qaPercentage}%
                  </td>
                  <td className="px-2 py-2 text-center font-mono font-bold text-amber-600 dark:text-amber-400 border-r border-gray-100 dark:border-gray-800 bg-amber-100/30 dark:bg-amber-950/20">
                    {calc.qaWeighted}
                  </td>

                  {/* Summary: Initial Grade, Transmuted Term Grade, Remarks */}
                  <td className="px-2.5 py-2 text-center font-mono font-semibold text-gray-700 dark:text-gray-300 bg-purple-50/30 dark:bg-purple-950/10">
                    {calc.initialGrade}
                  </td>

                  {/* Official DepEd Transmuted Grade Badge */}
                  <td className="px-3 py-2 text-center bg-purple-50/50 dark:bg-purple-950/20">
                    <span
                      className={cn(
                        'inline-flex items-center justify-center min-w-[32px] px-2 py-0.5 rounded-lg font-black text-xs font-mono shadow-xs',
                        calc.descriptor.isPassed
                          ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                          : 'bg-rose-600 text-white'
                      )}
                    >
                      {calc.transmutedGrade}
                    </span>
                  </td>

                  {/* DepEd Remark Descriptor */}
                  <td className="px-2.5 py-2 text-center text-[11px] font-semibold">
                    <span
                      className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-[10px] font-bold',
                        calc.descriptor.isPassed
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                      )}
                    >
                      {calc.descriptor.descriptor}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* DepEd Transmutation Reference Key Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-gray-700 dark:text-gray-300">DepEd Grading Scale:</span>
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
            90–100 Outstanding
          </span>
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-semibold">
            85–89 Very Satisfactory
          </span>
          <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-800 dark:bg-sky-950 dark:text-sky-300 font-semibold">
            80–84 Satisfactory
          </span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold">
            75–79 Fairly Satisfactory
          </span>
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-semibold">
            Below 75 Did Not Meet Expectations
          </span>
        </div>

        <div className="flex items-center gap-1 font-mono text-[10px]">
          <span>Passing Threshold: Initial 60.0 → Transmuted 75</span>
        </div>
      </div>
    </div>
  );
}
