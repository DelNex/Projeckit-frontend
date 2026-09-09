'use client';

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
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';

interface TosItem {
  id: string;
  competency: string;
  hours: number;
  items: number;
  cognitive: string;
}

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
  const [savingTos, setSavingTos] = useState(false);
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
    title: 'Loading Assessment...',
    subject: '...',
    section: '...',
    schoolYear: '2025-2026',
    term: '1st Quarter',
    targetItems: 50,
    classSize: 60,
    passingMps: 60.0,
    version: 1,
    status: 'DRAFT',
  });

  // TOS Items State
  const [tosRows, setTosRows] = useState<TosItem[]>([]);

  // Answer Key State
  const [answers, setAnswers] = useState<Record<number, string>>({});

  // Scans & Results State
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [lastScanResult, setLastScanResult] = useState<OmrScanResult | null>(null);

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
        subject: aData.subjects?.code || 'GEN',
        section: aData.sections?.name || 'Class',
        schoolYear: aData.school_year,
        term: aData.term,
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
      } else {
        const initial: Record<number, string> = {};
        for (let i = 1; i <= itemsNum; i++) initial[i] = 'A';
        setAnswers(initial);
      }

      // 3. Fetch TOS document
      const { data: tosData } = await (supabase as any)
        .from('tos_documents')
        .select('*')
        .eq('assessment_id', assessmentId)
        .maybeSingle();

      if (tosData && Array.isArray(tosData.rows) && tosData.rows.length > 0) {
        setTosRows(tosData.rows as unknown as TosItem[]);
      } else {
        setTosRows([
          { id: '1', competency: 'Core Competency 1: Foundational knowledge & comprehension', hours: 8, items: 15, cognitive: 'Remembering' },
          { id: '2', competency: 'Core Competency 2: Practical applications & problem solving', hours: 12, items: 20, cognitive: 'Applying' },
          { id: '3', competency: 'Core Competency 3: Critical evaluation & analytical synthesis', hours: 10, items: 15, cognitive: 'Analyzing' },
        ]);
      }

      // 4. Fetch Scan Results
      const { data: sData } = await (supabase as any)
        .from('scan_results')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false });

      if (sData) setScanResults(sData);

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

  // Save Answer Key to Supabase
  const handleSaveKey = async () => {
    setSavingKey(true);
    setSaveSuccessMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any).from('profiles').select('tenant_id').eq('id', user?.id || '').maybeSingle();
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

      setSaveSuccessMsg('Answer key successfully saved to Supabase!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to save answer key:', err);
      alert(`Could not save answer key: ${err.message || err}`);
    } finally {
      setSavingKey(false);
    }
  };

  // Save TOS to Supabase
  const handleSaveTos = async () => {
    setSavingTos(true);
    setSaveSuccessMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any).from('profiles').select('tenant_id').eq('id', user?.id || '').maybeSingle();
      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      const { error: tosErr } = await (supabase as any)
        .from('tos_documents')
        .upsert({
          assessment_id: assessmentId,
          tenant_id: tenantId,
          subject: assessment.subject,
          term: assessment.term,
          school_year: assessment.schoolYear,
          section: assessment.section,
          target_items: itemCount,
          rows: tosRows,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id' });

      if (tosErr) throw tosErr;

      setSaveSuccessMsg('Table of Specifications successfully saved to Supabase!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to save TOS:', err);
      alert(`Could not save TOS: ${err.message || err}`);
    } finally {
      setSavingTos(false);
    }
  };

  // Handle Scan Result Persistence
  const handleScanCompleted = async (result: OmrScanResult) => {
    setLastScanResult(result);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any).from('profiles').select('tenant_id').eq('id', user?.id || '').maybeSingle();
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

  // Dynamic canonical geometry: single source of truth for sheet, template, and scanner
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

  // Derived OMR template consuming canonical geometry
  const omrTemplate = useMemo(() => {
    return createKitOmrTemplate({ geometry: canonicalGeometry });
  }, [canonicalGeometry]);

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <Link
            href="/assessments"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"
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
            {assessment.targetItems} Items
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
        <>
          {/* Tab 1: TOS Document */}
          {activeTab === 'tos' && (
            <div className="space-y-6 rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 paint-isolate min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Table of Specifications (TOS)
                  </h2>
                  <p className="text-xs text-gray-400">
                    Map learning competencies, instructional hours, and item counts directly to DepEd guidelines.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setTosRows([
                        ...tosRows,
                        { id: Date.now().toString(), competency: 'New Learning Competency', hours: 4, items: 5, cognitive: 'Applying' }
                      ]);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Row</span>
                  </button>
                  <button
                    onClick={handleSaveTos}
                    disabled={savingTos}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingTos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>{savingTos ? 'Saving...' : 'Save TOS'}</span>
                  </button>
                </div>
              </div>

              {/* Responsive TOS Table */}
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-left text-xs table-optimized min-w-[620px]">
                  <thead className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
                    <tr>
                      <th className="w-12 px-4 py-3 text-center">#</th>
                      <th className="px-4 py-3">Learning Competency</th>
                      <th className="w-24 px-4 py-3 text-center">Hours</th>
                      <th className="w-24 px-4 py-3 text-center">Items</th>
                      <th className="w-32 px-4 py-3 text-center">Cognitive Level</th>
                      <th className="w-12 px-4 py-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {tosRows.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                        <td className="px-4 py-3 font-mono font-bold text-gray-400 text-center">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={row.competency}
                            onChange={(e) => {
                              const updated = [...tosRows];
                              updated[idx].competency = e.target.value;
                              setTosRows(updated);
                            }}
                            className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-xs text-gray-900 outline-none hover:border-gray-200 focus:border-blue-500 focus:bg-white dark:text-white dark:focus:bg-gray-800"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            value={row.hours}
                            onChange={(e) => {
                              const updated = [...tosRows];
                              updated[idx].hours = Number(e.target.value);
                              setTosRows(updated);
                            }}
                            className="w-16 text-center rounded-lg border border-gray-200 bg-gray-50/50 px-1 py-1 text-xs font-semibold dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            value={row.items}
                            onChange={(e) => {
                              const updated = [...tosRows];
                              updated[idx].items = Number(e.target.value);
                              setTosRows(updated);
                            }}
                            className="w-16 text-center rounded-lg border border-gray-200 bg-gray-50/50 px-1 py-1 text-xs font-semibold text-blue-600 dark:border-gray-800 dark:bg-gray-800 dark:text-blue-400"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <select
                            value={row.cognitive}
                            onChange={(e) => {
                              const updated = [...tosRows];
                              updated[idx].cognitive = e.target.value;
                              setTosRows(updated);
                            }}
                            className="rounded-lg border border-gray-200 bg-gray-50/50 px-2 py-1 text-[11px] font-semibold text-gray-700 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-300"
                          >
                            <option value="Remembering">Remembering</option>
                            <option value="Understanding">Understanding</option>
                            <option value="Applying">Applying</option>
                            <option value="Analyzing">Analyzing</option>
                            <option value="Evaluating">Evaluating</option>
                            <option value="Creating">Creating</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setTosRows(tosRows.filter((_, i) => i !== idx))}
                            className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-bold text-gray-900 dark:border-gray-800 dark:bg-gray-800/60 dark:text-white">
                      <td colSpan={2} className="px-4 py-3 text-right">Totals:</td>
                      <td className="px-4 py-3 text-center">
                        {tosRows.reduce((a, c) => a + c.hours, 0)} hrs
                      </td>
                      <td className="px-4 py-3 text-center text-blue-600 dark:text-blue-400">
                        {tosRows.reduce((a, c) => a + c.items, 0)} items
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Tab 2: Answer Key */}
          {activeTab === 'key' && (
            <div className="space-y-6 rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 paint-isolate min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Master Answer Key ({itemCount} Items)
                  </h2>
                  <p className="text-xs text-gray-400">
                    Select the authoritative correct answer for automated OMR grading.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveKey}
                    disabled={savingKey}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    <span>{savingKey ? 'Saving...' : 'Save Answer Key'}</span>
                  </button>
                </div>
              </div>

              {/* Responsive Key Matrix */}
              <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-10 gap-2.5">
                {Array.from({ length: itemCount }, (_, i) => i + 1).map((itemNum) => {
                  const currentLetter = answers[itemNum] || '';
                  return (
                    <div
                      key={itemNum}
                      className="flex flex-col items-center rounded-2xl border border-gray-100 bg-gray-50/60 p-2 dark:border-gray-800 dark:bg-gray-800/40"
                    >
                      <span className="text-[10px] font-bold text-gray-400">Q{itemNum}</span>
                      <div className="mt-1.5 flex gap-1">
                        {['A', 'B', 'C', 'D'].map((letter) => (
                          <button
                            key={letter}
                            onClick={() => setAnswers({ ...answers, [itemNum]: letter })}
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold transition-all',
                              currentLetter === letter
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700'
                            )}
                          >
                            {letter}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tab 3: Attendance & OMR Scan */}
          {activeTab === 'scan' && (
            <div className="space-y-6 rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 paint-isolate min-w-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Learner Attendance &amp; Dynamic OMR Scanning
                  </h2>
                  <p className="text-xs text-gray-400">
                    Print dynamic master sheets and capture responses via projective homography camera scanner.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
              <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-800/40">
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
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  Scanned Answer Sheets ({scanResults.length} Submissions)
                </h3>

                {scanResults.length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-gray-200 rounded-2xl dark:border-gray-800 text-gray-400 text-xs">
                    No answer sheets scanned yet. Launch the camera scanner to grade exam sheets.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
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
            <div className="space-y-6 rounded-2xl sm:rounded-3xl border border-gray-200 bg-white p-4 sm:p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 paint-isolate min-w-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4 dark:border-gray-800">
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">
                    Evaluation &amp; MPS Analysis
                  </h2>
                  <p className="text-xs text-gray-400">
                    Comprehensive mean percentage score, mastery levels, and item analysis.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                  <span className="text-xs text-gray-400">Total Scanned</span>
                  <p className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                    {scanResults.length}
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                  <span className="text-xs text-gray-400">Passing Benchmark</span>
                  <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1">
                    {assessment.passingMps}%
                  </p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                  <span className="text-xs text-gray-400">Evaluated Status</span>
                  <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {scanResults.length > 0 ? 'Active' : 'Awaiting Scans'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
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
