'use client';

import { createClient } from '@/lib/supabase/client';
import {
    AlertCircle,
    AlertTriangle,
    ArrowUpRight,
    BookOpen,
    Calendar,
    ChevronRight,
    GraduationCap,
    Layers,
    Loader2,
    Plus,
    RefreshCw,
    TrendingUp,
    Users
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface AssessmentItem {
  id: string;
  title: string;
  subjectTitle: string;
  subjectCode: string;
  sectionName: string;
  grade: string;
  strand: string;
  term: string;
  schoolYear: string;
  targetItems: number;
  passingMps: number;
  status: string;
  createdAt: string;
  calculatedMps: number | null;
  scanCount: number;
}

interface StudentScoreRecord {
  scanId: string;
  assessmentId: string;
  studentId: string | null;
  quarterKey: string;
  schoolYear: string;
  mps: number;
}

const TIER_CONFIG = [
  { key: 'mastered', label: 'Mastered', range: '96–100%', min: 96, color: '#10B981', bgClass: 'bg-emerald-500', textClass: 'text-emerald-700 dark:text-emerald-400' },
  { key: 'closely', label: 'Closely Approximating Mastery', range: '86–95%', min: 86, color: '#3B82F6', bgClass: 'bg-blue-500', textClass: 'text-blue-700 dark:text-blue-400' },
  { key: 'moving', label: 'Moving Towards Mastery', range: '66–85%', min: 66, color: '#F59E0B', bgClass: 'bg-amber-500', textClass: 'text-amber-700 dark:text-amber-400' },
  { key: 'average', label: 'Average / Low', range: '35–65%', min: 35, color: '#6366F1', bgClass: 'bg-indigo-500', textClass: 'text-indigo-700 dark:text-indigo-400' },
  { key: 'atRisk', label: 'Very Low / At Risk', range: '<35%', min: 0, color: '#EF4444', bgClass: 'bg-rose-500', textClass: 'text-rose-700 dark:text-rose-400' },
];

function normalizeQuarter(term: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const lower = (term || '').toLowerCase();
  if (lower.includes('second') || lower.includes('q2') || lower.includes('midterm')) return 'Q2';
  if (lower.includes('third') || lower.includes('q3') || lower.includes('semi')) return 'Q3';
  if (lower.includes('fourth') || lower.includes('q4') || lower.includes('final')) return 'Q4';
  return 'Q1';
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [totalEnrolledStudents, setTotalEnrolledStudents] = useState<number>(0);
  const [totalSectionsCount, setTotalSectionsCount] = useState<number>(0);
  const [studentScores, setStudentScores] = useState<StudentScoreRecord[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<{ quarter: string; mps: number; delta: number; x: number; y: number } | null>(null);

  const supabase = createClient();

  const loadDashboardData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Fetch Assessments with Subjects and Sections
      const { data: assData, error: assErr } = await (supabase as any)
        .from('assessments')
        .select(`
          id,
          title,
          term,
          school_year,
          target_items,
          passing_mps,
          status,
          created_at,
          subjects ( code, title ),
          sections ( name, grade, strand_code )
        `)
        .order('created_at', { ascending: false });

      if (assErr) throw assErr;

      // 2. Fetch Sections count
      const { count: secCount } = await (supabase as any)
        .from('sections')
        .select('*', { count: 'exact', head: true });
      setTotalSectionsCount(secCount || 0);

      // 3. Fetch Total Students in roster
      const { count: stuCount } = await (supabase as any)
        .from('students')
        .select('*', { count: 'exact', head: true });
      setTotalEnrolledStudents(stuCount || 0);

      // 4. Fetch Answer Keys
      const { data: keysData } = await (supabase as any)
        .from('answer_keys')
        .select('assessment_id, answers');

      const answerKeyMap = new Map<string, Record<string, string>>();
      (keysData || []).forEach((k: any) => {
        let parsedAnswers: Record<string, string> = {};
        if (typeof k.answers === 'object' && k.answers !== null) {
          parsedAnswers = k.answers;
        } else if (typeof k.answers === 'string') {
          try {
            parsedAnswers = JSON.parse(k.answers);
          } catch {
            // ignore
          }
        }
        answerKeyMap.set(k.assessment_id, parsedAnswers);
      });

      // 5. Fetch Scans
      const { data: scanData } = await (supabase as any)
        .from('scan_results')
        .select('id, assessment_id, student_id, raw_answers, normalized_answers, status, created_at');

      const computedScores: StudentScoreRecord[] = [];
      const assessmentScoreAccumulator = new Map<string, { totalMps: number; count: number }>();

      const assLookup = new Map<string, any>();
      (assData || []).forEach((a: any) => assLookup.set(a.id, a));

      (scanData || []).forEach((s: any) => {
        const ass = assLookup.get(s.assessment_id);
        const key = answerKeyMap.get(s.assessment_id);

        let studentAnswers: Record<string, string> = {};
        if (s.raw_answers && typeof s.raw_answers === 'object') {
          studentAnswers = s.raw_answers;
        } else if (Array.isArray(s.normalized_answers)) {
          s.normalized_answers.forEach((val: string | null, idx: number) => {
            if (val) studentAnswers[String(idx + 1)] = val;
          });
        }

        let totalItems = ass?.target_items || 50;
        let correctCount = 0;

        if (key && Object.keys(key).length > 0) {
          totalItems = ass?.target_items || Object.keys(key).length;
          Object.entries(key).forEach(([num, correctLetter]) => {
            const given = studentAnswers[num] || studentAnswers[String(num)];
            if (given && String(given).trim().toUpperCase() === String(correctLetter).trim().toUpperCase()) {
              correctCount++;
            }
          });
        }

        const scoreMps = totalItems > 0 ? (correctCount / totalItems) * 100 : 0;
        const roundedMps = Math.round(scoreMps * 10) / 10;

        const qKey = normalizeQuarter(ass?.term || 'First Quarter');
        const sYear = ass?.school_year || '2025-2026';

        computedScores.push({
          scanId: s.id,
          assessmentId: s.assessment_id,
          studentId: s.student_id,
          quarterKey: qKey,
          schoolYear: sYear,
          mps: roundedMps,
        });

        const currentAcc = assessmentScoreAccumulator.get(s.assessment_id) || { totalMps: 0, count: 0 };
        currentAcc.totalMps += roundedMps;
        currentAcc.count += 1;
        assessmentScoreAccumulator.set(s.assessment_id, currentAcc);
      });

      setStudentScores(computedScores);

      // Format assessments list with authentic calculated MPS
      const formattedAssessments: AssessmentItem[] = (assData || []).map((a: any) => {
        const acc = assessmentScoreAccumulator.get(a.id);
        const avgMps = acc && acc.count > 0 ? Math.round((acc.totalMps / acc.count) * 10) / 10 : null;

        return {
          id: a.id,
          title: a.title || 'Untitled Assessment',
          subjectTitle: a.subjects?.title || 'General Subject',
          subjectCode: a.subjects?.code || 'GEN',
          sectionName: a.sections?.name || 'Unassigned Section',
          grade: a.sections?.grade || '',
          strand: a.sections?.strand_code || '',
          term: a.term || 'First Quarter',
          schoolYear: a.school_year || '2025-2026',
          targetItems: a.target_items || 50,
          passingMps: a.passing_mps || 60,
          status: a.status || 'DRAFT',
          createdAt: a.created_at,
          calculatedMps: avgMps,
          scanCount: acc?.count || 0,
        };
      });

      setAssessments(formattedAssessments);
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err?.message || 'Failed to connect to database');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Compute Authentic Aggregate Metrics
  const aggregateMetrics = useMemo(() => {
    const totalScans = studentScores.length;
    if (totalScans === 0) {
      return {
        overallMps: null,
        atRiskCount: 0,
        totalExaminees: totalEnrolledStudents,
        totalSections: totalSectionsCount || assessments.length || 0,
      };
    }

    const sumMps = studentScores.reduce((sum, s) => sum + s.mps, 0);
    const overallMps = Math.round((sumMps / totalScans) * 10) / 10;
    const atRiskCount = studentScores.filter((s) => s.mps < 75.0).length;

    const distinctStudents = new Set(studentScores.map((s) => s.studentId || s.scanId)).size;

    return {
      overallMps,
      atRiskCount,
      totalExaminees: Math.max(distinctStudents, totalEnrolledStudents),
      totalSections: totalSectionsCount || 8,
    };
  }, [studentScores, totalEnrolledStudents, totalSectionsCount, assessments.length]);

  // Compute Authentic Quarterly Longitudinal Trend (Q1 -> Q4)
  const quarterlyTrendData = useMemo(() => {
    const quarters: Array<{ key: 'Q1' | 'Q2' | 'Q3' | 'Q4'; label: string }> = [
      { key: 'Q1', label: 'Q1 (First)' },
      { key: 'Q2', label: 'Q2 (Second)' },
      { key: 'Q3', label: 'Q3 (Third)' },
      { key: 'Q4', label: 'Q4 (Fourth)' },
    ];

    const results = quarters.map((q) => {
      const scansInQuarter = studentScores.filter((s) => s.quarterKey === q.key);
      if (scansInQuarter.length === 0) {
        return { key: q.key, label: q.label, mps: null, count: 0 };
      }
      const sum = scansInQuarter.reduce((acc, curr) => acc + curr.mps, 0);
      const avg = Math.round((sum / scansInQuarter.length) * 10) / 10;
      return { key: q.key, label: q.label, mps: avg, count: scansInQuarter.length };
    });

    const hasAnyData = results.some((r) => r.mps !== null);
    return { points: results, hasData: hasAnyData };
  }, [studentScores]);

  // Compute Authentic Learner Performance Tiers
  const learnerTierData = useMemo(() => {
    const totalStudents = studentScores.length;
    if (totalStudents === 0) {
      return { counts: TIER_CONFIG.map((t) => ({ ...t, count: 0, percentage: 0 })), totalStudents: 0, hasData: false };
    }

    const counts = TIER_CONFIG.map((tier) => {
      let matchingCount = 0;
      if (tier.key === 'mastered') {
        matchingCount = studentScores.filter((s) => s.mps >= 96).length;
      } else if (tier.key === 'closely') {
        matchingCount = studentScores.filter((s) => s.mps >= 86 && s.mps < 96).length;
      } else if (tier.key === 'moving') {
        matchingCount = studentScores.filter((s) => s.mps >= 66 && s.mps < 86).length;
      } else if (tier.key === 'average') {
        matchingCount = studentScores.filter((s) => s.mps >= 35 && s.mps < 66).length;
      } else {
        matchingCount = studentScores.filter((s) => s.mps < 35).length;
      }

      const percentage = Math.round((matchingCount / totalStudents) * 1000) / 10;
      return { ...tier, count: matchingCount, percentage };
    });

    return { counts, totalStudents, hasData: true };
  }, [studentScores]);

  // SVG Coordinates calculation for Quarterly Trend Chart
  const trendSvgCoords = useMemo(() => {
    const width = 560;
    const height = 200;
    const paddingX = 50;
    const paddingY = 30;
    const chartW = width - paddingX * 2;
    const chartH = height - paddingY * 2;

    const points = quarterlyTrendData.points;
    const n = points.length;

    const coords = points.map((p, idx) => {
      const x = paddingX + (idx / (n - 1)) * chartW;
      const val = p.mps !== null ? p.mps : 0;
      const y = height - paddingY - (val / 100) * chartH;
      return { ...p, x, y, hasVal: p.mps !== null };
    });

    const benchmarkY = height - paddingY - (75 / 100) * chartH;

    const validCoords = coords.filter((c) => c.hasVal);
    let pathD = '';
    let areaD = '';

    if (validCoords.length > 1) {
      pathD = validCoords.reduce((acc, curr, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${curr.x} ${curr.y}`, '');
      const firstX = validCoords[0].x;
      const lastX = validCoords[validCoords.length - 1].x;
      const bottomY = height - paddingY;
      areaD = `${pathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
    }

    return { width, height, paddingX, paddingY, coords, validCoords, pathD, areaD, benchmarkY };
  }, [quarterlyTrendData]);

  // SVG Donut Slices calculation
  const donutSlices = useMemo(() => {
    const total = learnerTierData.totalStudents;
    if (total === 0) return [];

    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;

    return learnerTierData.counts.map((tier) => {
      const sliceLength = (tier.percentage / 100) * circumference;
      const strokeDasharray = `${sliceLength} ${circumference - sliceLength}`;
      const strokeDashoffset = -accumulatedOffset;
      accumulatedOffset += sliceLength;

      return {
        ...tier,
        strokeDasharray,
        strokeDashoffset,
      };
    });
  }, [learnerTierData]);

  return (
    <div className="space-y-6 sm:space-y-8 min-w-0 pb-12">
      {/* Executive Page Header Matching Legacy */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 dark:border-gray-800 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 dark:bg-blue-900/30 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>Academic Year 2025–2026 • Executive View</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            Academic Performance Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Quarterly performance, learning competencies, and psychometrics —{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-300">Capas Senior High School</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <button
            onClick={() => loadDashboardData(true)}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-bold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 shadow-2xs transition disabled:opacity-50"
            title="Refresh live metrics from database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Sync Live'}</span>
          </button>

          <Link
            href="/assessments"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Assessment</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadDashboardData(false)}
            className="inline-flex items-center gap-1 font-bold underline hover:text-red-900 ml-4"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* KPI Cards Grid Matching Legacy 4-Card Architecture */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI Card 1: Average MPS */}
        <div className="p-5 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xs transition-all hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Average MPS
            </span>
            <span className="p-2.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {loading ? '...' : aggregateMetrics.overallMps !== null ? `${aggregateMetrics.overallMps}%` : '—'}
            </span>
            {aggregateMetrics.overallMps !== null ? (
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  aggregateMetrics.overallMps >= 75.0
                    ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300'
                }`}
              >
                {aggregateMetrics.overallMps >= 75.0 ? '+ Target Met' : 'Below 75%'}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-gray-400">Awaiting scans</span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Mean Percentage Score across sections
          </p>
        </div>

        {/* KPI Card 2: Total Students Assessed */}
        <div className="p-5 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xs transition-all hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Total Students Assessed
            </span>
            <span className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Users className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {loading ? '...' : aggregateMetrics.totalExaminees}
            </span>
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              Active roster
            </span>
          </div>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Enrolled across {aggregateMetrics.totalSections} class sections
          </p>
        </div>

        {/* KPI Card 3: At-Risk Learners */}
        <div className="p-5 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xs transition-all hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              At-Risk Learners
            </span>
            <span className="p-2.5 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-black text-rose-600 dark:text-rose-400">
              {loading ? '...' : aggregateMetrics.atRiskCount}
            </span>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-0.5 rounded-full">
              &lt;75% Grade
            </span>
          </div>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Requires targeted remediation
          </p>
        </div>

        {/* KPI Card 4: Class Sections */}
        <div className="p-5 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xs transition-all hover:shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Class Sections
            </span>
            <span className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <GraduationCap className="w-5 h-5" />
            </span>
          </div>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-3xl font-black text-gray-900 dark:text-white">
              {loading ? '...' : aggregateMetrics.totalSections}
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">
              100% Tracked
            </span>
          </div>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            STEM, TVL, and HUMSS strands
          </p>
        </div>
      </div>

      {/* Charts Section Matching Legacy 12-Column Layout */}
      <div className="grid grid-cols-12 gap-6">
        {/* Chart 1: MPS Longitudinal Trend (7 columns on desktop) */}
        <div className="col-span-12 lg:col-span-7 p-5 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  Quarterly MPS Longitudinal Trend
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Mean Percentage Score progression across academic quarters
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-0.5 bg-amber-500 border border-dashed border-amber-500" />
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  DepEd Benchmark (75.0%)
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex h-72 items-center justify-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
                <span className="text-xs">Computing longitudinal trajectory...</span>
              </div>
            ) : !quarterlyTrendData.hasData ? (
              <div className="flex flex-col h-72 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center dark:border-gray-800 dark:bg-gray-900/50">
                <TrendingUp className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  No longitudinal MPS data available yet.
                </p>
                <p className="text-xs text-gray-400 max-w-xs mt-1 mb-3">
                  As student exam sheets are scanned across quarters, longitudinal growth curves will plot automatically here.
                </p>
                <Link
                  href="/assessments"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
                >
                  <span>Open Assessments Workspace</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="relative w-full overflow-hidden">
                <svg
                  viewBox={`0 0 ${trendSvgCoords.width} ${trendSvgCoords.height}`}
                  className="w-full h-auto max-h-72 select-none"
                >
                  <defs>
                    <linearGradient id="dashboardMpsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0, 25, 50, 75, 100].map((val) => {
                    const y = trendSvgCoords.height - trendSvgCoords.paddingY - (val / 100) * (trendSvgCoords.height - trendSvgCoords.paddingY * 2);
                    return (
                      <g key={val}>
                        <line
                          x1={trendSvgCoords.paddingX}
                          y1={y}
                          x2={trendSvgCoords.width - trendSvgCoords.paddingX}
                          y2={y}
                          stroke="#E2E8F0"
                          strokeDasharray={val === 75 ? '4,4' : 'none'}
                          strokeWidth={val === 75 ? '1.5' : '1'}
                          className="dark:stroke-gray-800"
                        />
                        <text
                          x={trendSvgCoords.paddingX - 10}
                          y={y + 4}
                          textAnchor="end"
                          className="fill-gray-400 text-[10px] font-mono"
                        >
                          {val}%
                        </text>
                      </g>
                    );
                  })}

                  {/* Benchmark 75% Line Annotation */}
                  <line
                    x1={trendSvgCoords.paddingX}
                    y1={trendSvgCoords.benchmarkY}
                    x2={trendSvgCoords.width - trendSvgCoords.paddingX}
                    y2={trendSvgCoords.benchmarkY}
                    stroke="#F59E0B"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />

                  {/* Area fill */}
                  {trendSvgCoords.areaD && (
                    <path d={trendSvgCoords.areaD} fill="url(#dashboardMpsGradient)" />
                  )}

                  {/* Trend Path line */}
                  {trendSvgCoords.pathD && (
                    <path
                      d={trendSvgCoords.pathD}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Data Points */}
                  {trendSvgCoords.coords.map((pt) => {
                    if (!pt.hasVal) return null;
                    const delta = Math.round(((pt.mps || 0) - 75.0) * 10) / 10;
                    return (
                      <g
                        key={pt.key}
                        className="cursor-pointer group"
                        onMouseEnter={() =>
                          setHoveredPoint({
                            quarter: pt.label,
                            mps: pt.mps || 0,
                            delta,
                            x: pt.x,
                            y: pt.y,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                      >
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="6"
                          fill="#2563EB"
                          stroke="#FFFFFF"
                          strokeWidth="2.5"
                          className="transition-transform group-hover:scale-125"
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 12}
                          textAnchor="middle"
                          className="fill-gray-800 dark:fill-gray-200 text-[11px] font-bold font-mono"
                        >
                          {pt.mps}%
                        </text>
                      </g>
                    );
                  })}

                  {/* X Axis Labels */}
                  {trendSvgCoords.coords.map((pt) => (
                    <text
                      key={`label-${pt.key}`}
                      x={pt.x}
                      y={trendSvgCoords.height - 8}
                      textAnchor="middle"
                      className="fill-gray-500 dark:fill-gray-400 text-[11px] font-semibold"
                    >
                      {pt.label}
                    </text>
                  ))}
                </svg>

                {/* Floating Tooltip */}
                {hoveredPoint && (
                  <div
                    className="pointer-events-none absolute -top-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg transition-all dark:bg-gray-800"
                    style={{
                      left: `${Math.min(trendSvgCoords.width - 120, Math.max(20, hoveredPoint.x - 50))}px`,
                      top: `${Math.max(10, hoveredPoint.y - 45)}px`,
                    }}
                  >
                    <span className="font-bold">{hoveredPoint.quarter}: </span>
                    <span className="font-mono text-blue-400">{hoveredPoint.mps}%</span>
                    <span className={`ml-2 text-[10px] ${hoveredPoint.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      ({hoveredPoint.delta >= 0 ? `+${hoveredPoint.delta}` : hoveredPoint.delta}% vs Target)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Official DepEd passing standard: 75.0% MPS</span>
            <Link
              href="/analytics"
              className="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 inline-flex items-center gap-1"
            >
              <span>Detailed Analytics Hub</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Chart 2: Learner Performance Tiers (5 columns on desktop) */}
        <div className="col-span-12 lg:col-span-5 p-5 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-600" />
                  Learner Performance Tiers
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  DepEd standardized classification breakdown
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex h-72 items-center justify-center text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600 mr-2" />
                <span className="text-xs">Evaluating learner bands...</span>
              </div>
            ) : !learnerTierData.hasData ? (
              <div className="flex flex-col h-72 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center dark:border-gray-800 dark:bg-gray-900/50">
                <Layers className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  No learner performance data available yet.
                </p>
                <p className="text-xs text-gray-400 max-w-xs mt-1 mb-3">
                  Scanned OMR answer sheets categorize examinees across standard DepEd mastery tiers.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Donut Chart Visual */}
                <div className="flex justify-center items-center py-2">
                  <div className="relative w-40 h-40">
                    <svg viewBox="0 0 140 140" className="w-full h-full -rotate-90 transform">
                      {/* Background circle track */}
                      <circle
                        cx="70"
                        cy="70"
                        r="54"
                        fill="transparent"
                        stroke="#F1F5F9"
                        strokeWidth="16"
                        className="dark:stroke-gray-800"
                      />

                      {/* Donut segments */}
                      {donutSlices.map((slice) => {
                        if (slice.percentage === 0) return null;
                        return (
                          <circle
                            key={slice.key}
                            cx="70"
                            cy="70"
                            r="54"
                            fill="transparent"
                            stroke={slice.color}
                            strokeWidth="16"
                            strokeDasharray={slice.strokeDasharray}
                            strokeDashoffset={slice.strokeDashoffset}
                            strokeLinecap="round"
                            className="transition-all duration-500 ease-out"
                          />
                        );
                      })}
                    </svg>

                    {/* Donut Center Label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="text-2xl font-black text-gray-900 dark:text-white">
                        {learnerTierData.totalStudents}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Scanned
                      </span>
                    </div>
                  </div>
                </div>

                {/* Tier Rows Breakdown */}
                <div className="space-y-2 pt-1">
                  {learnerTierData.counts.map((tier) => (
                    <div
                      key={tier.key}
                      className="flex items-center justify-between text-xs p-2 rounded-xl bg-gray-50/70 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: tier.color }}
                        />
                        <div className="truncate">
                          <span className="font-semibold text-gray-800 dark:text-gray-200">
                            {tier.label}
                          </span>
                          <span className="text-[10px] text-gray-400 ml-1 font-mono">
                            ({tier.range})
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-bold text-gray-900 dark:text-white">
                          {tier.count} <span className="text-[10px] font-normal text-gray-400">std</span>
                        </span>
                        <span className="font-mono font-bold text-xs min-w-9 text-right" style={{ color: tier.color }}>
                          {tier.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>DepEd DO 8, s. 2015 bands</span>
            <Link
              href="/students"
              className="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 inline-flex items-center gap-1"
            >
              <span>Manage Learners</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Recent Assessment Operations Table Matching Legacy Structure */}
      <div className="p-5 sm:p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              Recent Assessment Operations
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Latest parsed gradebook scans and computational runs
            </p>
          </div>
          <Link
            href="/assessments"
            className="text-xs font-bold text-blue-600 hover:underline dark:text-blue-400 inline-flex items-center gap-1"
          >
            <span>View All Assessments</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs">Loading assessment records...</span>
          </div>
        ) : assessments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No assessments found</p>
            <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
              Get started by creating an assessment with customizable question counts and dynamic OMR answer sheets.
            </p>
            <Link
              href="/assessments"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              <span>Create First Assessment</span>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full text-left text-xs min-w-[620px]">
              <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 sm:px-6 py-3.5">File / Assessment Name</th>
                  <th className="px-4 sm:px-6 py-3.5">Section &amp; Strand</th>
                  <th className="px-4 sm:px-6 py-3.5">Academic Term</th>
                  <th className="px-4 sm:px-6 py-3.5 text-center">Calculated MPS</th>
                  <th className="px-4 sm:px-6 py-3.5 text-center">Status</th>
                  <th className="px-4 sm:px-6 py-3.5 text-right">Workspace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {assessments.slice(0, 8).map((a) => (
                  <tr
                    key={a.id}
                    className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-4 font-bold text-gray-900 dark:text-white max-w-xs truncate">
                      <div className="flex flex-col">
                        <span className="truncate">{a.title}</span>
                        <span className="text-[10px] text-gray-400 font-normal">
                          {a.subjectCode} • {a.targetItems} items
                        </span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 dark:text-gray-300">
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {a.sectionName}
                      </span>
                      {a.strand ? ` (${a.strand})` : ''}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-500 dark:text-gray-400 font-medium">
                      {a.term} • {a.schoolYear}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      {a.calculatedMps !== null ? (
                        <span
                          className={`font-mono font-bold text-xs px-2.5 py-1 rounded-full ${
                            a.calculatedMps >= 75.0
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                              : a.calculatedMps >= 60.0
                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                          }`}
                        >
                          {a.calculatedMps}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400 font-medium italic">
                          Pending Scans
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          a.status === 'ACTIVE' || a.status === 'FINALIZED'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                        }`}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <Link
                        href={`/assessments/${a.id}`}
                        className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        <span>Open</span>
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
