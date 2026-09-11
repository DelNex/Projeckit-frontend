'use client';

import { TosEditor } from '@/components/assessment/TosEditor';
import {
    createKitOmrTemplate,
    generateCanonicalGeometry,
    OmrCameraModal,
    OmrPrintModal,
    OmrScanResult,
} from '@/features/omr';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
    ArrowLeft,
    BarChart3,
    Camera,
    CheckCircle2,
    ChevronRight,
    Edit3,
    FileSpreadsheet,
    KeyRound,
    Loader2,
    Printer,
    RefreshCw,
    Save,
    Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';

function useAssessmentSearchParams() {
  const searchParams = useSearchParams();
  return searchParams;
}

export default function AssessmentWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const resolvedParams = use(params);
  const searchParams = useAssessmentSearchParams();
  const router = useRouter();

  const activeTab = searchParams.get('tab') || 'tos';
  const assessmentId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Live Assessment State
  const [assessment, setAssessment] = useState<{
    id: string;
    title: string;
    subject: string;
    section: string;
    schoolYear: string;
    term: string;
    targetItems: number;
    classSize: number;
    passingMps: number;
    status: string;
    version: number;
  }>({
    id: assessmentId,
    title: '',
    subject: '',
    section: '',
    schoolYear: '',
    term: '',
    targetItems: 50,
    classSize: 60,
    passingMps: 60.0,
    version: 1,
    status: 'DRAFT',
  });

  // Answer Key State
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [numChoices, setNumChoices] = useState<3 | 4 | 5>(4);

  // Scans & Results State
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [lastScanResult, setLastScanResult] = useState<OmrScanResult | null>(null);

  // Item Analysis & TOS State
  const [tosDoc, setTosDoc] = useState<any | null>(null);
  const [isEditingIa, setIsEditingIa] = useState(false);
  const [customRi, setCustomRi] = useState<Record<number, number>>({});
  const [tempDraftRi, setTempDraftRi] = useState<Record<number, number>>({});

  // Dynamic OMR Configuration
  const [itemCount, setItemCount] = useState<number>(50);
  const [classSize, setClassSize] = useState<number>(60);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const supabase = createClient();

  // Load all assessment data from Supabase
  const loadAssessmentData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch assessment
      const { data: aData, error: aErr } = await (supabase as any)
        .from('assessments')
        .select(`
          id,
          title,
          term,
          school_year,
          target_items,
          class_size,
          passing_mps,
          status,
          version,
          subjects ( code, title ),
          sections ( name )
        `)
        .eq('id', assessmentId)
        .single();

      if (aErr) throw aErr;

      const itemsNum = aData.target_items || 50;
      const sizeNum = aData.class_size || 60;

      setAssessment({
        id: aData.id,
        title: aData.title,
        subject: aData.subjects?.title || aData.subjects?.code || 'Empowerment Technologies',
        section: aData.sections?.name || 'Class',
        schoolYear: aData.school_year || '2025-2026',
        term: aData.term || '1st Quarter',
        targetItems: itemsNum,
        classSize: sizeNum,
        passingMps: aData.passing_mps || 60.0,
        status: aData.status || 'DRAFT',
        version: aData.version || 1,
      });

      setItemCount(itemsNum);
      setClassSize(sizeNum);

      // 2. Fetch answer key
      const { data: kData } = await (supabase as any)
        .from('answer_keys')
        .select('*')
        .eq('assessment_id', assessmentId)
        .maybeSingle();

      if (kData && kData.answers && typeof kData.answers === 'object') {
        setAnswers(kData.answers as Record<number, string>);
        // Check if any answers contain 'E' to set 5 choices
        const hasChoiceE = Object.values(kData.answers).some((val) => val === 'E');
        if (hasChoiceE) setNumChoices(5);
      } else {
        setAnswers({});
      }

      // 3. Fetch Scan Results
      const { data: sData } = await (supabase as any)
        .from('scan_results')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false });

      if (sData) setScanResults(sData);

      // 4. Fetch TOS Document for Competency Mapping
      const { data: tData } = await (supabase as any)
        .from('tos_documents')
        .select('*')
        .eq('assessment_id', assessmentId)
        .maybeSingle();

      if (tData) setTosDoc(tData);

    } catch (err: any) {
      console.error('Failed to load assessment details:', err);
      setError(err?.message || 'Failed to load assessment details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessmentData();
  }, [assessmentId]);

  const handleTabChange = (tab: string) => {
    router.replace(`/assessments/${assessmentId}?tab=${tab}`);
  };

  // Preset key application helpers
  const applyPresetAll = (letter: string) => {
    const updated: Record<number, string> = {};
    for (let i = 1; i <= itemCount; i++) {
      updated[i] = letter;
    }
    setAnswers(updated);
  };

  const applyPatternAlternating = () => {
    const choices = numChoices === 3 ? ['A', 'B', 'C'] : numChoices === 5 ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
    const updated: Record<number, string> = {};
    for (let i = 1; i <= itemCount; i++) {
      updated[i] = choices[(i - 1) % choices.length];
    }
    setAnswers(updated);
  };

  const handleClearAll = () => {
    const updated: Record<number, string> = {};
    for (let i = 1; i <= itemCount; i++) {
      updated[i] = '';
    }
    setAnswers(updated);
  };

  // Save Answer Key to Supabase
  const handleSaveKey = async () => {
    setSavingKey(true);
    setSaveSuccessMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();
      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      const { error: keyErr } = await (supabase as any)
        .from('answer_keys')
        .upsert({
          assessment_id: assessmentId,
          tenant_id: tenantId,
          title: `${assessment.title} – Master Key`,
          answers: answers,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id' });

      if (keyErr) throw keyErr;

      setSaveSuccessMsg('Master Answer Key saved to Supabase successfully!');
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Failed to save answer key:', err);
      alert(`Could not save answer key: ${err.message || err}`);
    } finally {
      setSavingKey(false);
    }
  };

  // Handle Scan Result Persistence
  const handleScanCompleted = async (result: OmrScanResult) => {
    setLastScanResult(result);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();
      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      const scanStatus = result.status;

      // Insert scan result record
      const { error: scanErr } = await (supabase as any)
        .from('scan_results')
        .insert({
          assessment_id: assessmentId,
          image_hash: result.imageHash,
          confidence: result.overallConfidence,
          raw_answers: result.rawAnswers,
          normalized_answers: result.normalizedAnswers,
          status: scanStatus,
        });

      if (scanErr) throw scanErr;

      // Calculate score if answer key exists
      let score = 0;
      result.items.forEach((item) => {
        if (item.selectedChoice && answers[item.itemNumber] === item.selectedChoice) {
          score++;
        }
      });
      const percentage = Math.round((score / itemCount) * 1000) / 10;

      // Insert into responses
      await (supabase as any).from('responses').insert({
        assessment_id: assessmentId,
        tenant_id: tenantId,
        score,
        total_items: itemCount,
        percentage,
        status: 'GRADED',
        raw_response: result.normalizedAnswers,
      });

      // Refetch scan results
      const { data: refreshedScans } = await (supabase as any)
        .from('scan_results')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false });

      if (refreshedScans) setScanResults(refreshedScans);

    } catch (e: any) {
      console.error('Failed to persist scan result:', e);
    }
  };

  // Dynamic canonical geometry
  const canonicalGeometry = useMemo(() => {
    return generateCanonicalGeometry({
      assessmentId,
      title: assessment.title,
      subject: assessment.subject,
      section: assessment.section,
      itemCount,
      classSize,
    });
  }, [assessmentId, assessment.title, assessment.subject, assessment.section, itemCount, classSize]);

  // Derived OMR template
  const omrTemplate = useMemo(() => {
    return createKitOmrTemplate({ geometry: canonicalGeometry });
  }, [canonicalGeometry]);

  const choicesList = useMemo(() => {
    if (numChoices === 3) return ['A', 'B', 'C'];
    if (numChoices === 5) return ['A', 'B', 'C', 'D', 'E'];
    return ['A', 'B', 'C', 'D'];
  }, [numChoices]);

  // Core Psychometric Item Analysis Engine
  const itemAnalysisStats = useMemo(() => {
    // 1. Build Item List from TOS Competencies if available
    let itemsList: { itemNumber: number; code: string; description: string; domain: string }[] = [];
    const competencies = tosDoc?.rows || [];
    if (competencies.length > 0) {
      const totalHoursSum = competencies.reduce((sum: number, c: any) => sum + (Number(c.hours) || 0), 0);
      const effectiveHours = totalHoursSum > 0 ? totalHoursSum : 40;
      let currentItemNum = 1;

      competencies.forEach((comp: any, compIdx: number) => {
        const compItemCount = compIdx === competencies.length - 1
          ? (itemCount - itemsList.length)
          : Math.max(1, Math.round(((Number(comp.hours) || 0) / effectiveHours) * itemCount));

        let dom = 'remembering';
        if (comp.domains) {
          const domEntries = Object.entries(comp.domains);
          const topDom = domEntries.sort((a: any, b: any) => Number(b[1]) - Number(a[1]))[0];
          if (topDom && Number(topDom[1]) > 0) dom = topDom[0];
        }

        for (let k = 0; k < compItemCount; k++) {
          if (currentItemNum <= itemCount) {
            itemsList.push({
              itemNumber: currentItemNum,
              code: comp.code || `COMP-${compIdx + 1}`,
              description: comp.description || comp.competency || 'DepEd Competency',
              domain: dom,
            });
            currentItemNum++;
          }
        }
      });

      while (itemsList.length < itemCount) {
        const lastComp = competencies[competencies.length - 1] || { code: 'CS_GENERAL', description: 'General Assessment Item' };
        itemsList.push({
          itemNumber: itemsList.length + 1,
          code: lastComp.code || 'CS_GENERAL',
          description: lastComp.description || lastComp.competency || 'General Assessment Item',
          domain: 'remembering',
        });
      }
    } else {
      const domainKeys = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
      itemsList = Array.from({ length: itemCount }, (_, idx) => ({
        itemNumber: idx + 1,
        code: `CSHS-${idx < 15 ? 'KNOW' : idx < 35 ? 'PROC' : 'REAS'}-${String(idx + 1).padStart(2, '0')}`,
        description: `Assessment Item ${idx + 1} Aligned Competency`,
        domain: domainKeys[idx % domainKeys.length],
      }));
    }

    // 2. Parse scan results examinee responses
    const actualN = scanResults.length;
    const examinees = scanResults.map((scan) => {
      let ansMap: Record<number, string | null> = {};
      if (scan.raw_answers && typeof scan.raw_answers === 'object') {
        ansMap = scan.raw_answers;
      } else if (Array.isArray(scan.normalized_answers)) {
        scan.normalized_answers.forEach((val: string | null, idx: number) => {
          ansMap[idx + 1] = val;
        });
      }
      let score = 0;
      for (let i = 1; i <= itemCount; i++) {
        const stAns = ansMap[i];
        const correct = answers[i];
        if (stAns && correct && stAns.trim().toUpperCase() === correct.trim().toUpperCase()) {
          score++;
        }
      }
      return { ansMap, score };
    });

    const activeRiStore = isEditingIa ? tempDraftRi : customRi;
    const hasCustomRi = Object.keys(activeRiStore).length > 0;
    const N = actualN > 0 ? actualN : (hasCustomRi ? assessment.classSize : 0);

    // Grouping for discrimination index (top 27% and bottom 27%)
    let upperGroup: any[] = [];
    let lowerGroup: any[] = [];
    const groupSize = Math.max(1, Math.floor(actualN * 0.27));
    if (actualN >= 4) {
      const sorted = [...examinees].sort((a, b) => b.score - a.score);
      upperGroup = sorted.slice(0, groupSize);
      lowerGroup = sorted.slice(-groupSize);
    }

    let grandTotalCorrect = 0;
    let sumDifficulty = 0;
    let sumDiscrimination = 0;
    let retainCount = 0;
    let reviseCount = 0;
    let discardCount = 0;

    const rows = itemsList.map((item) => {
      const itemNum = item.itemNumber;
      const key = answers[itemNum] || '—';

      let rawRi = 0;
      if (actualN > 0) {
        rawRi = examinees.filter((e) => {
          const stAns = e.ansMap[itemNum];
          return stAns && answers[itemNum] && stAns.trim().toUpperCase() === answers[itemNum].trim().toUpperCase();
        }).length;
      }

      const userRi = activeRiStore[itemNum];
      const Ri = typeof userRi === 'number' ? Math.min(N > 0 ? N : 100, Math.max(0, userRi)) : rawRi;
      grandTotalCorrect += Ri;

      const pIndex = N > 0 ? Ri / N : 0;
      sumDifficulty += pIndex;

      let difficultyCategory = 'Average';
      if (pIndex >= 0.81) difficultyCategory = 'Very Easy';
      else if (pIndex >= 0.61) difficultyCategory = 'Easy';
      else if (pIndex <= 0.20) difficultyCategory = 'Very Difficult';
      else if (pIndex <= 0.35) difficultyCategory = 'Difficult';

      let dIndex = 0;
      if (actualN >= 4 && groupSize > 0) {
        const rawUpper = upperGroup.filter((e) => {
          const stAns = e.ansMap[itemNum];
          return stAns && answers[itemNum] && stAns.trim().toUpperCase() === answers[itemNum].trim().toUpperCase();
        }).length;
        const rawLower = lowerGroup.filter((e) => {
          const stAns = e.ansMap[itemNum];
          return stAns && answers[itemNum] && stAns.trim().toUpperCase() === answers[itemNum].trim().toUpperCase();
        }).length;
        const rawDi = (rawUpper - rawLower) / groupSize;
        const scaleFactor = rawRi > 0 ? Ri / rawRi : 1;
        dIndex = Math.min(1.0, Math.max(-1.0, rawDi * scaleFactor));
      } else if (N > 0 && hasCustomRi) {
        dIndex = Math.min(0.85, Math.max(-0.20, (pIndex - 0.45) * 1.5));
      } else {
        dIndex = 0;
      }

      sumDiscrimination += dIndex;

      let discriminationCategory = 'Retain';
      let action: 'Retain' | 'Revise' | 'Discard' = 'Retain';

      if (N === 0) {
        action = 'Retain';
        discriminationCategory = '—';
        difficultyCategory = '—';
      } else if (dIndex < 0.20 || pIndex < 0.20) {
        discriminationCategory = 'Poor';
        action = 'Discard';
        discardCount++;
      } else if (dIndex < 0.40 || pIndex > 0.80) {
        discriminationCategory = 'Fair';
        action = 'Revise';
        reviseCount++;
      } else {
        discriminationCategory = 'Good';
        action = 'Retain';
        retainCount++;
      }

      return {
        itemNumber: itemNum,
        code: item.code,
        description: item.description,
        domain: item.domain,
        key,
        Ri,
        pIndex,
        difficultyCategory,
        dIndex,
        discriminationCategory,
        action,
      };
    });

    const meanScore = N > 0 ? grandTotalCorrect / N : 0;
    const mps = itemCount > 0 && N > 0 ? (grandTotalCorrect / (N * itemCount)) * 100 : 0;
    const avgP = itemCount > 0 ? sumDifficulty / itemCount : 0;
    const avgD = itemCount > 0 ? sumDiscrimination / itemCount : 0;

    let masteryLevel: 'High' | 'Moderate' | 'Low' = 'Low';
    if (mps >= 75) masteryLevel = 'High';
    else if (mps >= 60) masteryLevel = 'Moderate';

    // Bloom's 6 Cognitive Domains Mastery
    const domainLabels: Record<string, string> = {
      remembering: 'Remembering',
      understanding: 'Understanding',
      applying: 'Applying',
      analyzing: 'Analyzing',
      evaluating: 'Evaluating',
      creating: 'Creating',
    };

    const domainBreakdown = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'].map((domKey) => {
      const domItems = rows.filter((r) => r.domain === domKey);
      const totalDomRi = domItems.reduce((acc, r) => acc + r.Ri, 0);
      const maxPossible = domItems.length * N;
      const masteryPct = maxPossible > 0 ? (totalDomRi / maxPossible) * 100 : 0;
      return {
        key: domKey,
        label: domainLabels[domKey],
        itemCount: domItems.length,
        masteryPct: Math.round(masteryPct * 10) / 10,
      };
    });

    return {
      N,
      rows,
      grandTotalCorrect,
      meanScore,
      mps,
      masteryLevel,
      retainCount,
      reviseCount,
      discardCount,
      avgP,
      avgD,
      domainBreakdown,
    };
  }, [tosDoc, scanResults, answers, itemCount, assessment.classSize, isEditingIa, tempDraftRi, customRi]);

  // Edit Item Analysis handlers
  const handleStartEditIa = () => {
    setTempDraftRi({ ...customRi });
    setIsEditingIa(true);
  };

  const handleSaveIa = () => {
    setCustomRi({ ...tempDraftRi });
    setIsEditingIa(false);
  };

  const handleCancelEditIa = () => {
    setTempDraftRi({});
    setIsEditingIa(false);
  };

  const handleRiInputChange = (itemNum: number, valueStr: string) => {
    const parsed = parseInt(valueStr, 10);
    const maxVal = itemAnalysisStats.N > 0 ? itemAnalysisStats.N : assessment.classSize || 100;
    const validated = isNaN(parsed) ? 0 : Math.min(maxVal, Math.max(0, parsed));
    setTempDraftRi((prev) => ({
      ...prev,
      [itemNum]: validated,
    }));
  };

  return (
    <div className="space-y-6 min-w-0 w-full overflow-hidden">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Link
            href="/assessments"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-gray-400 truncate">
              <Link href="/assessments" className="hover:underline">Assessments</Link>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span>{assessment.subject}</span>
              <ChevronRight className="h-3 w-3 shrink-0" />
              <span className="text-gray-600 dark:text-gray-300 truncate">{assessment.section}</span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white truncate">
              {assessment.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
            {assessment.status}
          </span>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {itemCount} Items
          </span>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={loadAssessmentData}
            className="inline-flex items-center gap-1 font-bold underline hover:text-red-900"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Responsive Tabs Navigation */}
      <div className="border-b border-gray-200 dark:border-gray-800 min-w-0">
        <nav className="flex gap-1.5 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
          {[
            { id: 'tos', label: '1. Table of Specifications', icon: FileSpreadsheet },
            { id: 'key', label: '2. Answer Key & Scoring', icon: KeyRound },
            { id: 'scan', label: '3. Attendance & OMR Scan', icon: Camera },
            { id: 'results', label: '4. Evaluation & Results', icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-xs font-bold transition whitespace-nowrap',
                  isActive
                    ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
          <span className="text-xs">Loading assessment details from Supabase...</span>
        </div>
      ) : (
        <div className="min-w-0">
          {/* Tab 1: Comprehensive Legacy TOS Component */}
          {activeTab === 'tos' && (
            <TosEditor
              assessmentId={assessmentId}
              initialSubject={assessment.subject}
              initialTerm={assessment.term}
              initialSchoolYear={assessment.schoolYear}
              initialSection={assessment.section}
              initialTargetItems={itemCount}
              initialStatus={assessment.status}
              onSaveSuccess={() => {
                setSaveSuccessMsg('TOS successfully synchronized with assessment!');
                setTimeout(() => setSaveSuccessMsg(null), 3000);
              }}
            />
          )}

          {/* Tab 2: Master Answer Key (Responsive Repair with Presets & Safe Touch Grid) */}
          {activeTab === 'key' && (
            <div className="space-y-5 rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-3 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 min-w-0 overflow-hidden">
              {/* Header & Actions */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4 dark:border-gray-800 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                      Master Answer Key ({itemCount} Test Items)
                    </h2>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Configure correct choices for automated projective OMR grading. Touch or click choices to select.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleSaveKey}
                    disabled={savingKey}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>{savingKey ? 'Saving...' : 'Save Answer Key'}</span>
                  </button>
                </div>
              </div>

              {/* Quick Presets & Choices Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-gray-50/70 border border-gray-100 dark:bg-gray-800/40 dark:border-gray-800 text-xs min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">
                    Presets:
                  </span>
                  {choicesList.map((letter) => (
                    <button
                      key={letter}
                      onClick={() => applyPresetAll(letter)}
                      className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition text-[11px]"
                    >
                      All {letter}
                    </button>
                  ))}
                  <button
                    onClick={applyPatternAlternating}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 bg-white dark:bg-gray-800 dark:border-gray-700 font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition text-[11px] flex items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3" />
                    <span>Pattern ({choicesList.join('')})</span>
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-2.5 py-1 rounded-lg border border-rose-200 bg-white dark:bg-gray-800 dark:border-rose-900/40 font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition text-[11px]"
                  >
                    Clear All
                  </button>
                </div>

                {/* Option Count Switcher (3, 4, or 5 Choices) */}
                <div className="flex items-center gap-1 bg-white dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 text-xs shrink-0">
                  <button
                    onClick={() => setNumChoices(3)}
                    className={cn(
                      'px-2 py-0.5 rounded-lg text-[11px] font-bold transition',
                      numChoices === 3
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    )}
                  >
                    3 Choices (A-C)
                  </button>
                  <button
                    onClick={() => setNumChoices(4)}
                    className={cn(
                      'px-2 py-0.5 rounded-lg text-[11px] font-bold transition',
                      numChoices === 4
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    )}
                  >
                    4 Choices (A-D)
                  </button>
                  <button
                    onClick={() => setNumChoices(5)}
                    className={cn(
                      'px-2 py-0.5 rounded-lg text-[11px] font-bold transition',
                      numChoices === 5
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                    )}
                  >
                    5 Choices (A-E)
                  </button>
                </div>
              </div>

              {/* Status Indicator / Progress Counter */}
              <div className="flex items-center justify-between text-xs px-1 text-gray-500 dark:text-gray-400">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {Object.values(answers).filter(Boolean).length} of {itemCount} answered
                  </span>
                  <span className="text-[11px] text-gray-400">
                    ({Math.round((Object.values(answers).filter(Boolean).length / (itemCount || 1)) * 100)}%)
                  </span>
                </div>
                {Object.values(answers).filter(Boolean).length === itemCount && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> All Keyed
                  </span>
                )}
              </div>

              {/* Fully Responsive Answer Grid (Card Width = f(numChoices), Zero Overlap, Auto-Wrapping) */}
              <div
                className="grid gap-2.5 sm:gap-3 min-w-0 w-full"
                style={{
                  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${
                    numChoices === 3 ? '160px' : numChoices === 5 ? '230px' : '195px'
                  }), 1fr))`,
                }}
              >
                {Array.from({ length: itemCount }, (_, i) => i + 1).map((itemNum) => {
                  const currentLetter = answers[itemNum] || '';
                  return (
                    <div
                      key={itemNum}
                      className={cn(
                        'flex items-center justify-between px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl border transition min-w-0 overflow-hidden w-full',
                        currentLetter
                          ? 'border-blue-500/40 bg-blue-500/10 dark:border-blue-600/40 dark:bg-blue-950/30'
                          : 'border-gray-200/90 bg-gray-50/80 hover:border-gray-300 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700'
                      )}
                    >
                      {/* Question Number Label */}
                      <span className="text-xs font-mono font-bold text-gray-500 dark:text-slate-400 shrink-0 select-none mr-2">
                        {String(itemNum).padStart(2, '0')}.
                      </span>

                      {/* Row of Answer Bubbles (Left-to-Right: A -> B -> C -> [D] -> [E]) */}
                      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                        {choicesList.map((letter) => {
                          const isSelected = currentLetter === letter;
                          return (
                            <button
                              key={letter}
                              type="button"
                              onClick={() => {
                                setAnswers({
                                  ...answers,
                                  [itemNum]: isSelected ? '' : letter,
                                });
                              }}
                              className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all shrink-0 select-none',
                                isSelected
                                  ? 'bg-blue-600 text-white shadow-sm font-black ring-2 ring-blue-500/40 scale-105'
                                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 active:scale-95 dark:bg-slate-800/90 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white'
                              )}
                              aria-label={`Question ${itemNum} option ${letter}`}
                            >
                              {letter}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 3: Attendance & OMR Scan */}
          {activeTab === 'scan' && (
            <div className="space-y-6 rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4 dark:border-gray-800 min-w-0">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                    Learner Attendance &amp; Dynamic OMR Scanning
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Print dynamic master sheets and capture responses via projective homography camera scanner.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => setIsPrintModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 transition"
                  >
                    <Printer className="h-4 w-4 text-blue-500" />
                    <span>Print Master Sheet</span>
                  </button>
                  <button
                    onClick={() => setIsScannerOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 transition"
                  >
                    <Camera className="h-4 w-4" />
                    <span>Launch Scanner</span>
                  </button>
                </div>
              </div>

              {/* Dynamic OMR Geometry Indicators */}
              <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-800/40 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-gray-900 dark:text-white">
                      Dynamic Sheet Configuration (Active: {itemCount} Items • {classSize} Roll Targets)
                    </span>
                    <p className="text-[11px] text-gray-400">
                      Single canonical geometry engine dynamically generates matching quadrilateral reference markers and bubble centers.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    {[10, 20, 50, 60, 63, 70, 90].map((count) => (
                      <button
                        key={count}
                        onClick={() => setItemCount(count)}
                        className={cn(
                          'px-2.5 py-1 rounded-lg font-bold text-[11px] transition',
                          itemCount === count
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white border border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                        )}
                      >
                        {count}q
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Scans History Table */}
              <div className="space-y-3 min-w-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Scanned Answer Sheets ({scanResults.length} Submissions)
                </h3>

                {scanResults.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-gray-200 rounded-2xl dark:border-gray-800 text-gray-400 text-xs">
                    No answer sheets scanned yet. Launch the camera scanner to grade exam sheets.
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full text-left text-xs table-optimized min-w-[500px]">
                      <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40">
                        <tr>
                          <th className="px-4 py-3">Scan ID</th>
                          <th className="px-4 py-3">Confidence</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {scanResults.map((s) => (
                          <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                            <td className="px-4 py-3 font-mono text-[11px] text-gray-600 dark:text-gray-300">
                              {s.image_hash?.slice(0, 16)}...
                            </td>
                            <td className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                              {Math.round((s.confidence || 1.0) * 100)}%
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                                {s.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-gray-400 text-[11px]">
                              {new Date(s.created_at).toLocaleTimeString()}
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

          {/* Tab 4: Evaluation & Results */}
          {activeTab === 'results' && (
            <div className="space-y-6 min-w-0">
              {/* Header & Controls Card */}
              <div className="p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-3">
                  <div>
                    <h1 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      Item Analysis &amp; Psychometric Evaluation
                    </h1>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Review item difficulty ($P_i$) and discrimination ($D_i$), aligned with DepEd TOS standards
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isEditingIa ? (
                      <>
                        <button
                          onClick={handleSaveIa}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-xs transition flex items-center gap-1.5"
                        >
                          <Save className="w-3.5 h-3.5" />
                          Save Changes
                        </button>
                        <button
                          onClick={handleCancelEditIa}
                          className="px-3.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleStartEditIa}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-xs transition flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit Item Analysis
                        </button>
                        <button
                          onClick={() => window.print()}
                          className="px-3.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition flex items-center gap-1.5 print:hidden"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print Report
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Minimal Summary Badges Pill (Legacy Parity) */}
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold">
                      {assessment.schoolYear}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold">
                      {assessment.section}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-blue-600 dark:text-blue-400 font-bold">
                      {assessment.term}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium max-w-xs truncate">
                      {assessment.subject}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
                    <span className="px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold">
                      {itemAnalysisStats.N} Students
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold">
                      ∑ R_i: {itemAnalysisStats.grandTotalCorrect}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-bold">
                      Mean: {itemAnalysisStats.meanScore.toFixed(1)} / {itemCount}
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold">
                      MPS: {itemAnalysisStats.mps.toFixed(1)}%
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-md font-bold ${
                        itemAnalysisStats.masteryLevel === 'High'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : itemAnalysisStats.masteryLevel === 'Moderate'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      }`}
                    >
                      Mastery: {itemAnalysisStats.masteryLevel}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold">
                        {itemAnalysisStats.retainCount} Retain
                      </span>
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-bold">
                        {itemAnalysisStats.reviseCount} Revise
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400 font-bold">
                        {itemAnalysisStats.discardCount} Discard
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cognitive Domain Mastery Distribution (Bloom's Taxonomy) */}
              <div className="p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                      Cognitive Domain Mastery Distribution
                    </h3>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Bloom&apos;s Revised Taxonomy breakdown across {itemCount} assessment items
                    </p>
                  </div>
                  <span className="px-2.5 py-1 text-[11px] font-bold rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    DepEd Target: 60% Passing MPS
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {itemAnalysisStats.domainBreakdown.map((dom) => (
                    <div
                      key={dom.key}
                      className="p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                          {dom.label}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">
                          {dom.itemCount} items
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            dom.masteryPct >= 75
                              ? 'bg-emerald-500'
                              : dom.masteryPct >= 60
                              ? 'bg-blue-500'
                              : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.min(100, dom.masteryPct)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-500 dark:text-gray-400 text-[10px]">
                          Mastery
                        </span>
                        <span
                          className={`font-black ${
                            dom.masteryPct >= 75
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : dom.masteryPct >= 60
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {itemAnalysisStats.N > 0 ? `${dom.masteryPct}%` : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Minimal Non-Overflowing Table Card */}
              <div className="p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-gray-800 shadow-xs space-y-3 min-w-0">
                {itemAnalysisStats.N === 0 && !isEditingIa ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <BarChart3 className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-md">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                        No Scanned Examinee Responses Recorded
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Scan student answer sheets with the OMR scanner, or switch to manual edit mode to enter paper tallies.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => handleTabChange('omr')}
                        className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-xs transition flex items-center gap-1.5"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Go to OMR Scanner
                      </button>
                      <button
                        onClick={handleStartEditIa}
                        className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Enter Paper Tallies
                      </button>
                    </div>
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
                        {itemAnalysisStats.rows.map((row) => (
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
                              {isEditingIa ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={itemAnalysisStats.N > 0 ? itemAnalysisStats.N : 100}
                                  value={tempDraftRi[row.itemNumber] ?? row.Ri}
                                  onChange={(e) => handleRiInputChange(row.itemNumber, e.target.value)}
                                  className="w-14 text-center font-bold px-1 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 focus:ring-2 focus:ring-blue-500 transition-colors"
                                  title={`Correct students (0 to ${itemAnalysisStats.N})`}
                                />
                              ) : (
                                <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">
                                  {row.Ri}
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-center text-xs">
                              <span className="font-extrabold text-gray-900 dark:text-white block text-xs">
                                {itemAnalysisStats.N > 0 ? row.pIndex.toFixed(2) : '—'}
                              </span>
                              <span className="text-[10px] font-medium text-gray-500">
                                {row.difficultyCategory}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center text-xs">
                              <span className="font-extrabold text-gray-900 dark:text-white block text-xs">
                                {itemAnalysisStats.N > 0 ? (row.dIndex > 0 ? `+${row.dIndex.toFixed(2)}` : row.dIndex.toFixed(2)) : '—'}
                              </span>
                              <span className="text-[10px] font-medium text-gray-500">
                                {row.discriminationCategory}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-center">
                              {itemAnalysisStats.N > 0 ? (
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
                              ) : (
                                <span className="text-gray-400 font-semibold text-xs">—</span>
                              )}
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
                            {itemAnalysisStats.grandTotalCorrect}
                          </td>
                          <td className="px-2 py-2.5 text-center font-bold text-gray-900 dark:text-white">
                            P_avg: {itemAnalysisStats.N > 0 ? itemAnalysisStats.avgP.toFixed(2) : '0.00'}
                          </td>
                          <td className="px-2 py-2.5 text-center font-bold text-gray-900 dark:text-white">
                            D_avg: {itemAnalysisStats.N > 0 ? itemAnalysisStats.avgD.toFixed(2) : '0.00'}
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
        </div>
      )}

      {/* OMR Print Modal */}
      {isPrintModalOpen && (
        <OmrPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          geometry={canonicalGeometry}
        />
      )}

      {/* OMR Camera Scanner Modal */}
      {isScannerOpen && (
        <OmrCameraModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          assessmentId={assessmentId}
          template={omrTemplate}
          onScanComplete={handleScanCompleted}
        />
      )}
    </div>
  );
}
