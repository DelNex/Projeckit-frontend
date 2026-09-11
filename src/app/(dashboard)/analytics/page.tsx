'use client';

import { createClient } from '@/lib/supabase/client';
import {
    BarChart3,
    CheckSquare,
    ChevronRight,
    FileSpreadsheet,
    Layers,
    LineChart,
    Loader2,
    Printer,
    RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

type TabKey = 'sectional' | 'longitudinal' | 'cognitive' | 'item-analysis' | 'reports';

interface SectionItem {
  id: string;
  name: string;
  grade: string;
  strand: string;
  studentCount: number;
}

interface SubjectItem {
  id: string;
  code: string;
  title: string;
  targetItems: number;
}

interface AssessmentItem {
  id: string;
  title: string;
  subjectTitle: string;
  sectionName: string;
  grade: string;
  strand: string;
  schoolYear: string;
  term: string;
  targetItems: number;
  classSize: number;
  passingMps: number;
}

interface ScanRecord {
  id: string;
  assessmentId: string;
  studentId: string | null;
  confidence: number;
  rawAnswers: Record<number, string | null>;
  normalizedAnswers: (string | null)[];
}

interface TosDocRecord {
  assessmentId: string;
  rows: any[];
}

function AnalyticsContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get('tab') as TabKey) || 'sectional';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Raw Database Entities
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [assessments, setAssessments] = useState<AssessmentItem[]>([]);
  const [scanResults, setScanResults] = useState<ScanRecord[]>([]);
  const [answerKeys, setAnswerKeys] = useState<Record<string, Record<number, string>>>({});
  const [tosDocuments, setTosDocuments] = useState<Record<string, TosDocRecord>>({});

  // Academic Context Filter Picklists (Matching Legacy Frontend)
  const [selectedSchoolYear, setSelectedSchoolYear] = useState<string>('all');
  const [selectedGrade, setSelectedGrade] = useState<string>('all');
  const [selectedStrand, setSelectedStrand] = useState<string>('all');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedQuarter, setSelectedQuarter] = useState<string>('all');
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  // Selected Assessment for Item Analysis tab
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>('');

  // 1. Fetch All Authentic Data from Supabase
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Sections
      const { data: secData } = await (supabase as any)
        .from('sections')
        .select('id, name, grade, strand_code, student_count')
        .order('name');

      const parsedSections: SectionItem[] = (secData || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        grade: s.grade || '',
        strand: s.strand_code || '',
        studentCount: s.student_count || 40,
      }));
      setSections(parsedSections);

      // 2. Subjects
      const { data: subData } = await (supabase as any)
        .from('subjects')
        .select('id, code, title, target_items')
        .order('title');

      const parsedSubjects: SubjectItem[] = (subData || []).map((s: any) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        targetItems: s.target_items || 50,
      }));
      setSubjects(parsedSubjects);

      // 3. Assessments
      const { data: assData } = await (supabase as any)
        .from('assessments')
        .select(`
          id,
          title,
          term,
          school_year,
          target_items,
          class_size,
          passing_mps,
          subjects ( title, code ),
          sections ( name, grade, strand_code )
        `)
        .order('created_at', { ascending: false });

      const parsedAssessments: AssessmentItem[] = (assData || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        subjectTitle: a.subjects?.title || a.subjects?.code || 'General',
        sectionName: a.sections?.name || 'Class',
        grade: a.sections?.grade || '',
        strand: a.sections?.strand_code || '',
        schoolYear: a.school_year || '2025-2026',
        term: a.term || 'First Quarter',
        targetItems: a.target_items || 50,
        classSize: a.class_size || 40,
        passingMps: a.passing_mps || 60,
      }));
      setAssessments(parsedAssessments);

      if (parsedAssessments.length > 0 && !selectedAssessmentId) {
        setSelectedAssessmentId(parsedAssessments[0].id);
      }

      // 4. Scan Results
      const { data: scanData } = await (supabase as any)
        .from('scan_results')
        .select('id, assessment_id, student_id, confidence, raw_answers, normalized_answers, status')
        .order('created_at', { ascending: false });

      const parsedScans: ScanRecord[] = (scanData || []).map((s: any) => {
        let ansMap: Record<number, string | null> = {};
        if (s.raw_answers && typeof s.raw_answers === 'object') {
          ansMap = s.raw_answers;
        } else if (Array.isArray(s.normalized_answers)) {
          s.normalized_answers.forEach((val: string | null, idx: number) => {
            ansMap[idx + 1] = val;
          });
        }
        return {
          id: s.id,
          assessmentId: s.assessment_id,
          studentId: s.student_id,
          confidence: s.confidence || 0,
          rawAnswers: ansMap,
          normalizedAnswers: Array.isArray(s.normalized_answers) ? s.normalized_answers : [],
        };
      });
      setScanResults(parsedScans);

      // 5. Answer Keys
      const { data: keyData } = await (supabase as any)
        .from('answer_keys')
        .select('assessment_id, answers');

      const keysMap: Record<string, Record<number, string>> = {};
      (keyData || []).forEach((k: any) => {
        if (k.assessment_id && k.answers && typeof k.answers === 'object') {
          keysMap[k.assessment_id] = k.answers;
        }
      });
      setAnswerKeys(keysMap);

      // 6. TOS Documents
      const { data: tosData } = await (supabase as any)
        .from('tos_documents')
        .select('assessment_id, rows');

      const tosMap: Record<string, TosDocRecord> = {};
      (tosData || []).forEach((t: any) => {
        if (t.assessment_id && Array.isArray(t.rows)) {
          tosMap[t.assessment_id] = { assessmentId: t.assessment_id, rows: t.rows };
        }
      });
      setTosDocuments(tosMap);
    } catch (err: any) {
      console.error('Failed to load analytics data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  // Filter sections dropdown dynamically based on selected strand & grade
  const filteredSectionOptions = useMemo(() => {
    return sections.filter((sec) => {
      if (selectedStrand !== 'all') {
        const secStrand = (sec.strand || '').toLowerCase().replace(/\s+-\s+/g, '-').trim();
        const queryStrand = selectedStrand.toLowerCase().replace(/\s+-\s+/g, '-').trim();
        if (!secStrand.includes(queryStrand) && !queryStrand.includes(secStrand)) return false;
      }
      if (selectedGrade !== 'all') {
        const gradeNum = selectedGrade.replace(/\D/g, '');
        const secGradeNum = (sec.grade || '').replace(/\D/g, '');
        if (gradeNum && secGradeNum && gradeNum !== secGradeNum) return false;
      }
      return true;
    });
  }, [sections, selectedStrand, selectedGrade]);

  // Filter assessments based on active academic picklists
  const filteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      if (selectedSchoolYear !== 'all' && a.schoolYear !== selectedSchoolYear) return false;
      if (selectedQuarter !== 'all') {
        const qtrNorm = selectedQuarter.toLowerCase().replace(/\s+/g, '');
        const aQtrNorm = (a.term || '').toLowerCase().replace(/\s+/g, '');
        if (!aQtrNorm.includes(qtrNorm) && !qtrNorm.includes(aQtrNorm)) return false;
      }
      if (selectedSubject !== 'all' && a.subjectTitle !== selectedSubject) return false;
      if (selectedSection !== 'all' && a.sectionName !== selectedSection) return false;
      if (selectedGrade !== 'all') {
        const gNum = selectedGrade.replace(/\D/g, '');
        const aGNum = (a.grade || '').replace(/\D/g, '');
        if (gNum && aGNum && gNum !== aGNum) return false;
      }
      if (selectedStrand !== 'all') {
        const sNorm = selectedStrand.toLowerCase().replace(/\s+-\s+/g, '-').trim();
        const aSNorm = (a.strand || '').toLowerCase().replace(/\s+-\s+/g, '-').trim();
        if (!aSNorm.includes(sNorm) && !sNorm.includes(aSNorm)) return false;
      }
      return true;
    });
  }, [assessments, selectedSchoolYear, selectedQuarter, selectedSubject, selectedSection, selectedGrade, selectedStrand]);

  // Calculate live aggregate MPS and Mastery for the Summary Badges
  const aggregateMetrics = useMemo(() => {
    let totalCorrect = 0;
    let totalPossible = 0;
    let totalScans = 0;

    filteredAssessments.forEach((ass) => {
      const assScans = scanResults.filter((s) => s.assessmentId === ass.id);
      const key = answerKeys[ass.id] || {};
      if (assScans.length === 0) return;

      totalScans += assScans.length;

      assScans.forEach((scan) => {
        for (let i = 1; i <= ass.targetItems; i++) {
          const studentAns = scan.rawAnswers[i];
          const correct = key[i];
          if (studentAns && correct && studentAns.trim().toUpperCase() === correct.trim().toUpperCase()) {
            totalCorrect++;
          }
        }
        totalPossible += ass.targetItems;
      });
    });

    const mps = totalPossible > 0 ? (totalCorrect / totalPossible) * 100 : null;
    let mastery: 'High' | 'Moderate' | 'Low' | null = null;
    if (mps !== null) {
      if (mps >= 75) mastery = 'High';
      else if (mps >= 60) mastery = 'Moderate';
      else mastery = 'Low';
    }

    return {
      totalScans,
      mps: mps !== null ? Math.round(mps * 10) / 10 : null,
      mastery,
    };
  }, [filteredAssessments, scanResults, answerKeys]);

  // Sectional Achievement Data (Real calculations grouped by section)
  const sectionalData = useMemo(() => {
    const sectionsToEvaluate = selectedSection === 'all'
      ? filteredSectionOptions
      : filteredSectionOptions.filter((s) => s.name === selectedSection);

    return sectionsToEvaluate.map((sec) => {
      const secAssessments = filteredAssessments.filter((a) => a.sectionName === sec.name);
      let secCorrect = 0;
      let secPossible = 0;
      let secScansCount = 0;

      secAssessments.forEach((ass) => {
        const assScans = scanResults.filter((s) => s.assessmentId === ass.id);
        const key = answerKeys[ass.id] || {};
        secScansCount += assScans.length;

        assScans.forEach((scan) => {
          for (let i = 1; i <= ass.targetItems; i++) {
            const studentAns = scan.rawAnswers[i];
            const correct = key[i];
            if (studentAns && correct && studentAns.trim().toUpperCase() === correct.trim().toUpperCase()) {
              secCorrect++;
            }
          }
          secPossible += ass.targetItems;
        });
      });

      const mps = secPossible > 0 ? Math.round(((secCorrect / secPossible) * 100) * 10) / 10 : null;

      return {
        sectionName: sec.name,
        strand: sec.strand,
        scansCount: secScansCount,
        studentCount: sec.studentCount,
        mps,
      };
    });
  }, [filteredSectionOptions, selectedSection, filteredAssessments, scanResults, answerKeys]);

  const hasSectionalData = useMemo(() => {
    return sectionalData.some((s) => s.mps !== null);
  }, [sectionalData]);

  // Longitudinal Growth Data (Real quarterly breakdown across school years)
  const longitudinalData = useMemo(() => {
    const years = ['2024–2025', '2025–2026', '2026–2027'];
    const quarters = ['First Quarter', 'Second Quarter', 'Third Quarter', 'Fourth Quarter'];

    return years.map((yr) => {
      const yrSeries = quarters.map((qtr) => {
        const qtrAssessments = assessments.filter((a) => {
          if (a.schoolYear !== yr && a.schoolYear !== yr.replace('–', '-')) return false;
          const aQtrNorm = (a.term || '').toLowerCase().replace(/\s+/g, '');
          const qtrNorm = qtr.toLowerCase().replace(/\s+/g, '');
          if (!aQtrNorm.includes(qtrNorm) && !qtrNorm.includes(aQtrNorm)) return false;
          if (selectedSubject !== 'all' && a.subjectTitle !== selectedSubject) return false;
          if (selectedSection !== 'all' && a.sectionName !== selectedSection) return false;
          return true;
        });

        let totalCorrect = 0;
        let totalPossible = 0;

        qtrAssessments.forEach((ass) => {
          const assScans = scanResults.filter((s) => s.assessmentId === ass.id);
          const key = answerKeys[ass.id] || {};
          assScans.forEach((scan) => {
            for (let i = 1; i <= ass.targetItems; i++) {
              const studentAns = scan.rawAnswers[i];
              const correct = key[i];
              if (studentAns && correct && studentAns.trim().toUpperCase() === correct.trim().toUpperCase()) {
                totalCorrect++;
              }
            }
            totalPossible += ass.targetItems;
          });
        });

        return totalPossible > 0 ? Math.round(((totalCorrect / totalPossible) * 100) * 10) / 10 : null;
      });

      return {
        schoolYear: yr,
        quarterScores: yrSeries,
      };
    });
  }, [assessments, scanResults, answerKeys, selectedSubject, selectedSection]);

  const hasLongitudinalData = useMemo(() => {
    return longitudinalData.some((yr) => yr.quarterScores.some((s) => s !== null));
  }, [longitudinalData]);

  // Selected Assessment for Item Analysis & Cognitive Domain
  const activeAssessment = useMemo(() => {
    return assessments.find((a) => a.id === selectedAssessmentId) || assessments[0] || null;
  }, [assessments, selectedAssessmentId]);

  // Psychometric Item Analysis Matrix for active assessment
  const itemAnalysisRows = useMemo(() => {
    if (!activeAssessment) return [];

    const assId = activeAssessment.id;
    const targetItems = activeAssessment.targetItems;
    const key = answerKeys[assId] || {};
    const assScans = scanResults.filter((s) => s.assessmentId === assId);
    const N = assScans.length;

    // Get TOS rows if available
    const tos = tosDocuments[assId]?.rows || [];
    let itemsStructure: { itemNumber: number; code: string; description: string; domain: string }[] = [];

    if (tos.length > 0) {
      const totalHours = tos.reduce((sum, c) => sum + (Number(c.hours) || 0), 0);
      const effectiveHours = totalHours > 0 ? totalHours : 40;
      let currentItemNum = 1;

      tos.forEach((comp, compIdx) => {
        const count = compIdx === tos.length - 1
          ? (targetItems - itemsStructure.length)
          : Math.max(1, Math.round(((Number(comp.hours) || 0) / effectiveHours) * targetItems));

        let dom = 'remembering';
        if (comp.domains) {
          const domEntries = Object.entries(comp.domains);
          const topDom = domEntries.sort((a: any, b: any) => Number(b[1]) - Number(a[1]))[0];
          if (topDom && Number(topDom[1]) > 0) dom = topDom[0];
        }

        for (let k = 0; k < count; k++) {
          if (currentItemNum <= targetItems) {
            itemsStructure.push({
              itemNumber: currentItemNum,
              code: comp.code || `COMP-${compIdx + 1}`,
              description: comp.description || comp.competency || 'TOS Competency',
              domain: dom,
            });
            currentItemNum++;
          }
        }
      });

      while (itemsStructure.length < targetItems) {
        const lastComp = tos[tos.length - 1] || { code: 'CS_GENERAL', description: 'General Item' };
        itemsStructure.push({
          itemNumber: itemsStructure.length + 1,
          code: lastComp.code || 'CS_GENERAL',
          description: lastComp.description || lastComp.competency || 'General Item',
          domain: 'remembering',
        });
      }
    } else {
      const domainKeys = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
      itemsStructure = Array.from({ length: targetItems }, (_, i) => ({
        itemNumber: i + 1,
        code: `CSHS-${i < 15 ? 'KNOW' : i < 35 ? 'PROC' : 'REAS'}-${String(i + 1).padStart(2, '0')}`,
        description: `Assessment Item ${i + 1} Aligned Competency`,
        domain: domainKeys[i % domainKeys.length],
      }));
    }

    const examineeScores = assScans.map((scan) => {
      let score = 0;
      for (let i = 1; i <= targetItems; i++) {
        const studentAns = scan.rawAnswers[i];
        const correct = key[i];
        if (studentAns && correct && studentAns.trim().toUpperCase() === correct.trim().toUpperCase()) {
          score++;
        }
      }
      return { scan, score };
    });

    let upperGroup: any[] = [];
    let lowerGroup: any[] = [];
    const groupSize = Math.max(1, Math.floor(N * 0.27));
    if (N >= 4) {
      const sorted = [...examineeScores].sort((a, b) => b.score - a.score);
      upperGroup = sorted.slice(0, groupSize);
      lowerGroup = sorted.slice(-groupSize);
    }

    return itemsStructure.map((item) => {
      const itemNum = item.itemNumber;
      const correctAns = key[itemNum] || '—';

      let Ri = 0;
      if (N > 0) {
        Ri = examineeScores.filter((e) => {
          const ans = e.scan.rawAnswers[itemNum];
          return ans && key[itemNum] && ans.trim().toUpperCase() === key[itemNum].trim().toUpperCase();
        }).length;
      }

      const pIndex = N > 0 ? Ri / N : 0;
      let difficultyCategory = 'Average';
      if (pIndex >= 0.81) difficultyCategory = 'Very Easy';
      else if (pIndex >= 0.61) difficultyCategory = 'Easy';
      else if (pIndex <= 0.20) difficultyCategory = 'Very Difficult';
      else if (pIndex <= 0.35) difficultyCategory = 'Difficult';

      let dIndex = 0;
      if (N >= 4 && groupSize > 0) {
        const rawUpper = upperGroup.filter((e) => {
          const ans = e.scan.rawAnswers[itemNum];
          return ans && key[itemNum] && ans.trim().toUpperCase() === key[itemNum].trim().toUpperCase();
        }).length;
        const rawLower = lowerGroup.filter((e) => {
          const ans = e.scan.rawAnswers[itemNum];
          return ans && key[itemNum] && ans.trim().toUpperCase() === key[itemNum].trim().toUpperCase();
        }).length;
        dIndex = Math.min(1.0, Math.max(-1.0, (rawUpper - rawLower) / groupSize));
      }

      let discriminationCategory = 'Retain';
      let action: 'Retain' | 'Revise' | 'Discard' = 'Retain';

      if (N === 0) {
        action = 'Retain';
        discriminationCategory = '—';
        difficultyCategory = '—';
      } else if (dIndex < 0.20 || pIndex < 0.20) {
        discriminationCategory = 'Poor';
        action = 'Discard';
      } else if (dIndex < 0.40 || pIndex > 0.80) {
        discriminationCategory = 'Fair';
        action = 'Revise';
      } else {
        discriminationCategory = 'Good';
        action = 'Retain';
      }

      return {
        itemNumber: itemNum,
        code: item.code,
        description: item.description,
        domain: item.domain,
        key: correctAns,
        Ri,
        N,
        pIndex,
        difficultyCategory,
        dIndex,
        discriminationCategory,
        action,
      };
    });
  }, [activeAssessment, answerKeys, scanResults, tosDocuments]);

  // Cognitive Domain Summary
  const cognitiveData = useMemo(() => {
    if (itemAnalysisRows.length === 0) return [];

    const domainLabels: Record<string, string> = {
      remembering: 'Remembering',
      understanding: 'Understanding',
      applying: 'Applying',
      analyzing: 'Analyzing',
      evaluating: 'Evaluating',
      creating: 'Creating',
    };

    const N = itemAnalysisRows[0]?.N || 0;

    return ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'].map((dKey) => {
      const items = itemAnalysisRows.filter((r) => r.domain === dKey);
      const totalRi = items.reduce((sum, r) => sum + r.Ri, 0);
      const maxPossible = items.length * N;
      const masteryPct = maxPossible > 0 ? (totalRi / maxPossible) * 100 : null;

      return {
        key: dKey,
        label: domainLabels[dKey],
        itemCount: items.length,
        masteryPct: masteryPct !== null ? Math.round(masteryPct * 10) / 10 : null,
      };
    });
  }, [itemAnalysisRows]);

  const hasCognitiveData = useMemo(() => {
    return cognitiveData.some((d) => d.masteryPct !== null);
  }, [cognitiveData]);

  // Consolidated Section Reports Table Data
  const consolidatedReportsData = useMemo(() => {
    const secList = selectedSection === 'all'
      ? filteredSectionOptions
      : filteredSectionOptions.filter((s) => s.name === selectedSection);

    return secList.map((sec) => {
      const secAssessments = filteredAssessments.filter((a) => a.sectionName === sec.name);
      let studentScores: number[] = [];
      let totalItemsAll = 0;

      secAssessments.forEach((ass) => {
        const assScans = scanResults.filter((s) => s.assessmentId === ass.id);
        const key = answerKeys[ass.id] || {};
        totalItemsAll = ass.targetItems;

        assScans.forEach((scan) => {
          let score = 0;
          for (let i = 1; i <= ass.targetItems; i++) {
            const studentAns = scan.rawAnswers[i];
            const correct = key[i];
            if (studentAns && correct && studentAns.trim().toUpperCase() === correct.trim().toUpperCase()) {
              score++;
            }
          }
          studentScores.push(score);
        });
      });

      const n = studentScores.length;
      if (n === 0) {
        return {
          sectionName: sec.name,
          enrolledStudents: sec.studentCount,
          scannedStudents: 0,
          meanScore: null,
          standardDeviation: null,
          mps: null,
          outstandingCount: 0,
          didNotMeetCount: 0,
        };
      }

      const sum = studentScores.reduce((a, b) => a + b, 0);
      const mean = sum / n;
      const variance = studentScores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / n;
      const stdDev = Math.sqrt(variance);
      const mps = totalItemsAll > 0 ? (mean / totalItemsAll) * 100 : 0;

      const outstanding = studentScores.filter((sc) => totalItemsAll > 0 && (sc / totalItemsAll) >= 0.90).length;
      const didNotMeet = studentScores.filter((sc) => totalItemsAll > 0 && (sc / totalItemsAll) < 0.75).length;

      return {
        sectionName: sec.name,
        enrolledStudents: sec.studentCount,
        scannedStudents: n,
        meanScore: Math.round(mean * 10) / 10,
        standardDeviation: Math.round(stdDev * 100) / 100,
        mps: Math.round(mps * 10) / 10,
        outstandingCount: outstanding,
        didNotMeetCount: didNotMeet,
      };
    });
  }, [filteredSectionOptions, selectedSection, filteredAssessments, scanResults, answerKeys]);

  const hasReportsData = useMemo(() => {
    return consolidatedReportsData.some((r) => r.scannedStudents > 0);
  }, [consolidatedReportsData]);

  if (loading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-xs font-semibold text-gray-400">Loading academic analytics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6 min-w-0">
      {/* Page Header & Scope Selector Bar (Matching Legacy Frontend) */}
      <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Performance Analytics</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Compare achievement across classes and school years aligned with DepEd standards
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
              Refresh
            </button>
            {activeTab === 'reports' && (
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-xs transition flex items-center gap-1.5 print:hidden"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </button>
            )}
          </div>
        </div>

        {/* Academic Context Filter Picklists (Matching Item Analysis Design) */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedSchoolYear}
              onChange={(e) => setSelectedSchoolYear(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
            >
              <option value="all">All School Years</option>
              <option value="2025–2026">2025–2026</option>
              <option value="2026–2027">2026–2027</option>
              <option value="2024–2025">2024–2025</option>
            </select>

            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
            >
              <option value="all">All Grades</option>
              <option value="Grade 11">Grade 11</option>
              <option value="Grade 12">Grade 12</option>
            </select>

            <select
              value={selectedStrand}
              onChange={(e) => setSelectedStrand(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
            >
              <option value="all">All Strands</option>
              <option value="TVL - ICT">TVL - ICT</option>
              <option value="STEM">STEM</option>
              <option value="ABM">ABM</option>
              <option value="HUMSS">HUMSS</option>
              <option value="GAS">GAS</option>
            </select>

            <select
              value={selectedSection}
              onChange={(e) => setSelectedSection(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold"
            >
              <option value="all">All Sections</option>
              {filteredSectionOptions.map((sec) => (
                <option key={sec.id} value={sec.name}>
                  {sec.name} ({sec.strand})
                </option>
              ))}
            </select>

            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold"
            >
              <option value="all">All Quarters</option>
              <option value="First Quarter">Q1</option>
              <option value="Second Quarter">Q2</option>
              <option value="Third Quarter">Q3</option>
              <option value="Fourth Quarter">Q4</option>
            </select>

            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold max-w-xs"
            >
              <option value="all">All Subjects</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.title}>
                  {sub.title}
                </option>
              ))}
            </select>
          </div>

          {/* Live Performance Summary Badges (Matching Legacy Frontend) */}
          <div className="flex items-center gap-2 text-[11px] font-medium">
            <span className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold">
              Class Scope: {selectedSection === 'all' ? 'All Sections' : selectedSection}
            </span>
            <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold">
              Mean MPS: {aggregateMetrics.mps !== null ? `${aggregateMetrics.mps}%` : 'N/A'}
            </span>
            <span
              className={`px-2.5 py-1 rounded-md font-bold ${
                aggregateMetrics.mastery === 'High'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                  : aggregateMetrics.mastery === 'Moderate'
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                  : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
              }`}
            >
              Mastery: {aggregateMetrics.mastery !== null ? aggregateMetrics.mastery : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation Bar (Matching Legacy Navigation) */}
      <div className="border-b border-gray-200 dark:border-gray-800 print:hidden">
        <nav className="flex space-x-3 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('sectional')}
            className={`py-2.5 px-4 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'sectional'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Class / Sectional Achievement (MPS %)
          </button>
          <button
            onClick={() => setActiveTab('longitudinal')}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'longitudinal'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Year-over-Year Growth Trends
          </button>
          <button
            onClick={() => setActiveTab('cognitive')}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'cognitive'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Cognitive Domain Mastery
          </button>
          <button
            onClick={() => setActiveTab('item-analysis')}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'item-analysis'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Psychometric Item Analysis Matrix
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`py-2.5 px-4 text-xs font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'reports'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'
            }`}
          >
            Consolidated DepEd Reports
          </button>
        </nav>
      </div>

      {/* Tab 1: Sectional Achievement */}
      {activeTab === 'sectional' && (
        <div className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Class Sectional Achievement Comparison (MPS %)
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Mean Percentage Scores across tracked academic classes in {selectedStrand === 'all' ? 'All Strands' : selectedStrand}
              </p>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              Target Benchmark: 75.0% MPS
            </span>
          </div>

          {!hasSectionalData ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <BarChart3 className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  No assessment data available yet
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Complete assessments and record student responses to see MPS comparison charts here.
                </p>
              </div>
              <Link
                href="/assessments"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-xs transition flex items-center gap-1.5"
              >
                Go to Assessments
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {sectionalData.map((sec) => (
                <div key={sec.sectionName} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-gray-800 dark:text-gray-200">
                      {sec.sectionName} ({sec.strand})
                    </span>
                    <span className="font-mono font-bold text-gray-900 dark:text-white">
                      {sec.mps !== null ? `${sec.mps}%` : 'No Scans'}
                    </span>
                  </div>
                  <div className="relative w-full bg-gray-100 dark:bg-gray-800 rounded-full h-5 overflow-hidden flex items-center">
                    {/* Benchmark line at 75% */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
                      style={{ left: '75%' }}
                      title="DepEd Target: 75%"
                    />
                    <div
                      className={`h-full rounded-full transition-all flex items-center justify-end pr-2 text-[10px] font-bold text-white ${
                        sec.mps !== null && sec.mps >= 75
                          ? 'bg-emerald-500'
                          : sec.mps !== null && sec.mps >= 60
                          ? 'bg-blue-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, sec.mps || 0)}%` }}
                    >
                      {sec.mps !== null && sec.mps >= 15 ? `${sec.mps}%` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Longitudinal Growth Trends */}
      {activeTab === 'longitudinal' && (
        <div className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Year-over-Year Longitudinal MPS Growth Trends
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Multi-year academic achievement trajectory across school years (2024–2027)
              </p>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
              Scope: {selectedSection === 'all' ? 'Consolidated Cohort' : selectedSection}
            </span>
          </div>

          {!hasLongitudinalData ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <LineChart className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  No longitudinal data available yet
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Complete assessments across multiple quarters and school years to see growth trends here.
                </p>
              </div>
              <Link
                href="/assessments"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-xs transition flex items-center gap-1.5"
              >
                Go to Assessments
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {longitudinalData.map((yr) => (
                  <div
                    key={yr.schoolYear}
                    className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2">
                      <span className="font-bold text-xs text-gray-900 dark:text-white">
                        S.Y. {yr.schoolYear}
                      </span>
                      <span className="text-[10px] text-gray-400 font-medium">MPS Trajectory</span>
                    </div>
                    <div className="space-y-2">
                      {['Q1', 'Q2', 'Q3', 'Q4'].map((qtrName, qIdx) => {
                        const score = yr.quarterScores[qIdx];
                        return (
                          <div key={qtrName} className="flex items-center justify-between text-xs">
                            <span className="text-gray-500 font-medium">{qtrName}</span>
                            <span className="font-mono font-bold text-gray-900 dark:text-white">
                              {score !== null ? `${score}%` : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Cognitive Domain Mastery */}
      {activeTab === 'cognitive' && (
        <div className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Cognitive Domain Mastery Distribution
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Bloom&apos;s 6 cognitive dimensions mapped to curriculum competencies
              </p>
            </div>
            {assessments.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-gray-500">Assessment:</label>
                <select
                  value={selectedAssessmentId}
                  onChange={(e) => setSelectedAssessmentId(e.target.value)}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} ({a.sectionName})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {!hasCognitiveData ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                  No cognitive domain mapping available
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  There are no TOS competencies mapped or scan responses for the selected assessment. Add competencies in the TOS editor inside an assessment.
                </p>
              </div>
              <Link
                href="/assessments"
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-xs transition flex items-center gap-1.5"
              >
                Go to Assessments
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cognitiveData.map((d) => (
                <div
                  key={d.key}
                  className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/40 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">{d.label}</span>
                    <span className="text-[11px] text-gray-400">{d.itemCount} items</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        d.masteryPct !== null && d.masteryPct >= 75
                          ? 'bg-emerald-500'
                          : d.masteryPct !== null && d.masteryPct >= 60
                          ? 'bg-blue-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(100, d.masteryPct || 0)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 text-[10px]">Mastery Rate</span>
                    <span
                      className={`font-mono font-bold ${
                        d.masteryPct !== null && d.masteryPct >= 75
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : d.masteryPct !== null && d.masteryPct >= 60
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {d.masteryPct !== null ? `${d.masteryPct}%` : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Psychometric Item Analysis Matrix (Legacy Parity) */}
      {activeTab === 'item-analysis' && (
        <div className="space-y-4">
          <div className="p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                  Psychometric Item Analysis Matrix
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Item difficulty ($P_i$) and discrimination ($D_i$) aligned with DepEd standard actions
                </p>
              </div>
              {assessments.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500">Assessment:</label>
                  <select
                    value={selectedAssessmentId}
                    onChange={(e) => setSelectedAssessmentId(e.target.value)}
                    className="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {assessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({a.sectionName} — {a.targetItems} items)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
            {itemAnalysisRows.length === 0 || itemAnalysisRows[0]?.N === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <CheckSquare className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                    No scan responses recorded for this assessment
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Scan examinee response sheets in the assessment workspace to evaluate item difficulty and discrimination.
                  </p>
                </div>
                {activeAssessment && (
                  <Link
                    href={`/assessments/${activeAssessment.id}?tab=omr`}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-xs transition flex items-center gap-1.5"
                  >
                    Open OMR Scanner
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse table-fixed min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                      <th className="px-2 py-2.5 w-12 text-center font-bold text-gray-700 dark:text-gray-300">#</th>
                      <th className="px-3 py-2.5 font-bold text-gray-700 dark:text-gray-300">TOS Competency &amp; Learning Code</th>
                      <th className="px-2 py-2.5 w-16 text-center font-bold text-gray-700 dark:text-gray-300">Key</th>
                      <th className="px-2 py-2.5 w-24 text-center font-bold text-emerald-600 dark:text-emerald-400">Correct (R_i)</th>
                      <th className="px-2 py-2.5 w-28 text-center font-bold text-gray-700 dark:text-gray-300">Difficulty (P_i)</th>
                      <th className="px-2 py-2.5 w-28 text-center font-bold text-gray-700 dark:text-gray-300">Discrimination (D_i)</th>
                      <th className="px-2 py-2.5 w-24 text-center font-bold text-gray-700 dark:text-gray-300">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
                    {itemAnalysisRows.map((row) => (
                      <tr
                        key={row.itemNumber}
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-2 py-2 text-center font-bold text-gray-900 dark:text-white text-xs">
                          {row.itemNumber}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 block text-[11px]">
                            {row.code}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 font-normal text-[11px] truncate block max-w-sm">
                            {row.description}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/40 text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                            {row.key}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">
                            {row.Ri}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center text-xs">
                          <span className="font-extrabold text-gray-900 dark:text-white block text-xs">
                            {row.pIndex.toFixed(2)}
                          </span>
                          <span className="text-[10px] font-medium text-gray-500">
                            {row.difficultyCategory}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center text-xs">
                          <span className="font-extrabold text-gray-900 dark:text-white block text-xs">
                            {row.dIndex > 0 ? `+${row.dIndex.toFixed(2)}` : row.dIndex.toFixed(2)}
                          </span>
                          <span className="text-[10px] font-medium text-gray-500">
                            {row.discriminationCategory}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span
                            className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full ${
                              row.action === 'Retain'
                                ? 'bg-emerald-500 text-white'
                                : row.action === 'Revise'
                                ? 'bg-amber-500 text-white'
                                : 'bg-rose-500 text-white'
                            }`}
                          >
                            {row.action}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-800/80 font-bold border-t border-gray-200 dark:border-gray-700 text-xs">
                      <td className="px-2 py-2.5 text-center text-gray-400">Total</td>
                      <td className="px-3 py-2.5 text-gray-500 uppercase">Class Column Totals &amp; Means</td>
                      <td className="px-2 py-2.5 text-center text-gray-400">—</td>
                      <td className="px-2 py-2.5 text-center text-emerald-600 font-extrabold text-sm">
                        {itemAnalysisRows.reduce((sum, r) => sum + r.Ri, 0)}
                      </td>
                      <td className="px-2 py-2.5 text-center font-bold text-gray-900 dark:text-white">
                        P_avg: {(itemAnalysisRows.reduce((sum, r) => sum + r.pIndex, 0) / (itemAnalysisRows.length || 1)).toFixed(2)}
                      </td>
                      <td className="px-2 py-2.5 text-center font-bold text-gray-900 dark:text-white">
                        D_avg: {(itemAnalysisRows.reduce((sum, r) => sum + r.dIndex, 0) / (itemAnalysisRows.length || 1)).toFixed(2)}
                      </td>
                      <td className="px-2 py-2.5 text-center text-gray-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Consolidated DepEd Reports */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          {/* Official Capas SHS DepEd Header Banner */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 text-center space-y-2">
            <h2 className="text-[11px] font-bold tracking-widest text-gray-500 uppercase dark:text-gray-400">
              Department of Education — Region III — Division of Tarlac Province
            </h2>
            <h3 className="text-base font-black text-blue-600 dark:text-blue-400">
              CAPAS SENIOR HIGH SCHOOL
            </h3>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
              Quarterly Knowledge Insight Tool (KIT) Consolidated Academic Performance Report
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-6 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <div><strong>School Year:</strong> {selectedSchoolYear === 'all' ? '2025–2026' : selectedSchoolYear}</div>
              <div><strong>Strand:</strong> {selectedStrand === 'all' ? 'All Strands' : selectedStrand}</div>
              <div><strong>Quarter:</strong> {selectedQuarter === 'all' ? 'Consolidated' : selectedQuarter}</div>
            </div>
          </div>

          <div className="p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xs">
            {!hasReportsData ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <FileSpreadsheet className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                    No section reports available yet
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Verify and process OMR scan batches to generate section-level academic mastery aggregates.
                  </p>
                </div>
                <Link
                  href="/assessments"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-xs transition flex items-center gap-1.5"
                >
                  Go to Assessments
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse table-fixed min-w-[640px]">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-800/60 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                      <th className="px-3 py-2.5 font-bold text-gray-700 dark:text-gray-300">Section Name</th>
                      <th className="px-2 py-2.5 w-20 text-center font-bold text-gray-700 dark:text-gray-300">Enrolled</th>
                      <th className="px-2 py-2.5 w-20 text-center font-bold text-gray-700 dark:text-gray-300">Scanned</th>
                      <th className="px-2 py-2.5 w-24 text-center font-bold text-blue-600 dark:text-blue-400">Mean (X̄)</th>
                      <th className="px-2 py-2.5 w-24 text-center font-bold text-gray-700 dark:text-gray-300">Std Dev (S)</th>
                      <th className="px-2 py-2.5 w-24 text-center font-bold text-gray-700 dark:text-gray-300">MPS %</th>
                      <th className="px-2 py-2.5 w-28 text-center font-bold text-emerald-600 dark:text-emerald-400">Outstanding</th>
                      <th className="px-2 py-2.5 w-28 text-center font-bold text-rose-600 dark:text-rose-400">Did Not Meet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-xs">
                    {consolidatedReportsData.map((row) => (
                      <tr
                        key={row.sectionName}
                        className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/50 transition-colors"
                      >
                        <td className="px-3 py-2 font-bold text-gray-900 dark:text-white">
                          {row.sectionName}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-gray-600 dark:text-gray-300">
                          {row.enrolledStudents}
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-bold text-gray-900 dark:text-white">
                          {row.scannedStudents}
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.meanScore !== null ? row.meanScore.toFixed(1) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-gray-600 dark:text-gray-300">
                          {row.standardDeviation !== null ? row.standardDeviation.toFixed(2) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-mono font-bold">
                          {row.mps !== null ? (
                            <span className={row.mps >= 75 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                              {row.mps.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          {row.outstandingCount}
                        </td>
                        <td className="px-2 py-2 text-center font-mono text-rose-600 dark:text-rose-400 font-semibold">
                          {row.didNotMeetCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <div className="h-96 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mr-3" />
          <span className="text-xs font-semibold text-gray-500">Loading analytics workspace...</span>
        </div>
      }
    >
      <AnalyticsContent />
    </Suspense>
  );
}