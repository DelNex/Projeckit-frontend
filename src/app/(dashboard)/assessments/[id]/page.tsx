'use client';

import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast';
import { useTenant } from '@/context/TenantContext';
import {
    createKitOmrTemplate,
    generateCanonicalGeometry,
    OmrCameraModal,
    OmrPrintModal,
    OmrScanResult,
} from '@/features/omr';
import { uploadScanImage } from '@/features/omr/storage';
import { friendlyError } from '@/lib/errors';
import { getPhilippineSchoolYear } from '@/lib/academic-calendar';
import { projectTosItems } from '@/lib/tos-item-projection';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database.types';
import { cn } from '@/lib/utils';
import { deduplicateItemScans, readScanAnswers } from '@/lib/item-response-analysis';

type ScanResultRow = Database['public']['Tables']['scan_results']['Row'];
type TosDocRow = Database['public']['Tables']['tos_documents']['Row'] & {
  rows?: Array<{
    code?: string;
    days?: number;
    daysTaught?: number;
    days_taught?: number;
    domains?: Record<string, number>;
    description?: string;
    [key: string]: unknown;
  }> | null;
};
type ResponseRow = Database['public']['Tables']['responses']['Row'] & {
  audit_trail?: { studentName?: string; [key: string]: unknown } | null;
};
import {
    ArrowLeft,
    BarChart3,
    Camera,
    CheckCircle2,
    ChevronRight,
    Download,
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
  const { toast } = useToast();

  const rawTab = searchParams.get('tab') || 'scan';
  const activeTab = rawTab === 'grades' ? 'tos' : rawTab;
  const printSheetRequested = searchParams.get('print') === 'sheet';
  const printReportRequested = searchParams.get('print') === 'report';
  const assessmentId = resolvedParams.id;

  const { tenantName, region, division, logoData, schoolYear: tenantSchoolYear, userDisplayName } = useTenant();
  const [currentTeacherName, setCurrentTeacherName] = useState<string>('');
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
    sectionId: string;
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
    sectionId: '',
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
  const [questionItems, setQuestionItems] = useState<Array<{ item_number: number; question: string; options: Record<string, string>; correct_answer: string }>>([]);
  const [savedQuestionItems, setSavedQuestionItems] = useState<Array<{ item_number: number; question: string; options: Record<string, string>; correct_answer: string }>>([]);
  const [numChoices, setNumChoices] = useState<3 | 4 | 5>(4);

  // Track last-saved answer key for dirty checking (Item 13)
  const [savedAnswers, setSavedAnswers] = useState<Record<number, string>>({});
  const [savedNumChoices, setSavedNumChoices] = useState<3 | 4 | 5>(4);
  const [pendingTab, setPendingTab] = useState<string | null>(null);

  const isAnswerKeyDirty = useMemo(() => {
    if (numChoices !== savedNumChoices) return true;
    if (JSON.stringify(questionItems) !== JSON.stringify(savedQuestionItems)) return true;
    const keys = new Set([
      ...Object.keys(answers),
      ...Object.keys(savedAnswers),
    ]);
    for (const k of keys) {
      const n = Number(k);
      if ((answers[n] || '') !== (savedAnswers[n] || '')) return true;
    }
    return false;
  }, [answers, savedAnswers, numChoices, savedNumChoices, questionItems, savedQuestionItems]);

  // Scans & Results State
  const [scanResults, setScanResults] = useState<ScanResultRow[]>([]);
  const [skippedScans, setSkippedScans] = useState(0);

  // Item Analysis & TOS State
  const [tosDoc, setTosDoc] = useState<TosDocRow | null>(null);
  const [isEditingIa, setIsEditingIa] = useState(false);
  const [customRi, setCustomRi] = useState<Record<number, number>>({});
  const [tempDraftRi, setTempDraftRi] = useState<Record<number, number>>({});
  const [selectedAnswerGroup, setSelectedAnswerGroup] = useState<{ itemNumber: number; choice: string } | null>(null);

  // Dynamic OMR Configuration
  const [itemCount, setItemCount] = useState<number>(50);
  const [classSize, setClassSize] = useState<number>(60);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // OMR Answer Key Scanner State
  const [isAnswerKeyScannerOpen, setIsAnswerKeyScannerOpen] = useState(false);
  const [omrDetectedKey, setOmrDetectedKey] = useState<Record<number, string>>({}); // latest OMR-detected key
  const [omrKeyMismatches, setOmrKeyMismatches] = useState<number[]>([]); // items where user manually overrode OMR

  // Students Roster and Responses
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [responsesList, setResponsesList] = useState<ResponseRow[]>([]);

  const supabase = createClient();

  // Load all assessment data from Supabase
  const loadAssessmentData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch assessment
      const { data: aData, error: aErr } = await supabase
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
          questions,
          tos_id,
          subjects ( code, title ),
          sections ( id, name )
        `)
        .eq('id', assessmentId)
        .single();

      if (aErr) throw aErr;
      const itemsNum = aData.target_items || 50;

      const storedQuestions = Array.isArray(aData.questions) ? aData.questions.map((item: any, index: number) => ({
        item_number: Number(item?.item_number ?? item?.question_number ?? item?.number) || index + 1,
        question: typeof item?.question === 'string' ? item.question : '',
        options: Object.fromEntries(['A', 'B', 'C', 'D', 'E'].map((letter) => [letter, typeof item?.options?.[letter] === 'string' ? item.options[letter] : ''])),
        correct_answer: String(item?.correct_answer ?? item?.correctAnswer ?? item?.answer ?? '').trim().toUpperCase(),
      })) : [];
      const loadedQuestions = Array.from({ length: itemsNum }, (_, index) => storedQuestions.find((item) => item.item_number === index + 1) || ({ item_number: index + 1, question: '', options: { A: '', B: '', C: '', D: '', E: '' }, correct_answer: '' }));
      setQuestionItems(loadedQuestions);
      setSavedQuestionItems(loadedQuestions);
      const generatedAnswers: Record<number, string> = Object.fromEntries(
        loadedQuestions.filter((item) => item.correct_answer).map((item) => [item.item_number, item.correct_answer])
      );

      const sizeNum = aData.class_size || 60;

      const subj = Array.isArray(aData.subjects) ? aData.subjects[0] : aData.subjects;
      const sec = Array.isArray(aData.sections) ? aData.sections[0] : aData.sections;

      setAssessment({
        id: aData.id,
        title: aData.title,
        subject: subj?.title || subj?.code || '',
        section: sec?.name || '',
        sectionId: sec?.id || '',
        schoolYear: aData.school_year || tenantSchoolYear || getPhilippineSchoolYear(),
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
      const { data: kData } = await supabase
        .from('answer_keys')
        .select('*')
        .eq('assessment_id', assessmentId)
        .maybeSingle();

      const persistedAnswers = kData?.answers && typeof kData.answers === 'object' && !Array.isArray(kData.answers)
        ? Object.fromEntries(Object.entries(kData.answers as Record<string, unknown>)
          .map(([itemNumber, answer]) => [Number(itemNumber), String(answer ?? '').trim().toUpperCase()])
          .filter(([itemNumber, answer]) => Number.isInteger(itemNumber) && Boolean(answer)))
        : {};
      // An empty answer_keys row is created when the assessment is created. Keep
      // the generated exam's embedded key as the fallback, then apply saved edits.
      const loadedAnswers = { ...generatedAnswers, ...persistedAnswers } as Record<number, string>;
      setAnswers(loadedAnswers);
      setSavedAnswers(loadedAnswers);
      const hasChoiceE = Object.values(loadedAnswers).some((val) => val === 'E');
      if (hasChoiceE) {
        setNumChoices(5);
        setSavedNumChoices(5);
      }

      // 3. Fetch Scan Results
      const { data: sData } = await supabase
        .from('scan_results')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false });

      if (sData) setScanResults(sData);

      // 4. Fetch TOS Document for Competency Mapping
      const { data: tData } = await supabase
        .from('tos_documents')
        .select('*')
        .eq('assessment_id', assessmentId)
        .maybeSingle();

      if (tData) setTosDoc(tData);

      // 5. Fetch Students Roster (for Roll number matching, excluding archived)
      const { data: stdData, error: stdErr } = await supabase
        .from('students')
        .select('id, name, lrn, section_id, section_name, is_archived')
        .order('name', { ascending: true });

      if (stdErr) {
        // Fallback if is_archived column does not exist
        const { data: fbStdData } = await supabase
          .from('students')
          .select('id, name, lrn, section_name')
          .order('name', { ascending: true });
        setStudentsList(fbStdData || []);
      } else if (stdData) {
        setStudentsList(stdData.filter((s) => !s.is_archived));
      }

      // 6. Fetch Responses (Scores)
      const { data: rData } = await supabase
        .from('responses')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('scanned_at', { ascending: false });

      if (rData) setResponsesList(rData);

      // 7. Fetch current teacher's name
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .maybeSingle();
        setCurrentTeacherName(prof?.display_name || userDisplayName || user.email?.split('@')[0] || '');
      }
    } catch (err: any) {
      console.error('Failed to load assessment details:', err);
      setError(friendlyError(err, 'Failed to load assessment details'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAssessmentData();
  }, [assessmentId]);

  useEffect(() => {
    if (loading || !printSheetRequested || activeTab !== 'scan') return;
    setIsPrintModalOpen(true);
    router.replace(`/assessments/${assessmentId}?tab=scan`, { scroll: false });
  }, [loading, printSheetRequested, activeTab, assessmentId, router]);

  useEffect(() => {
    if (loading || !printReportRequested || activeTab !== 'results') return;
    const timer = window.setTimeout(() => {
      window.print();
      router.replace(`/assessments/${assessmentId}?tab=results`, { scroll: false });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loading, printReportRequested, activeTab, assessmentId, router]);

  // Warn before leaving the page with unsaved answer key changes (Item 13)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnswerKeyDirty && activeTab === 'key') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnswerKeyDirty, activeTab]);

  const handleTabChange = (tab: string) => {
    // Guard tab switch when answer key has unsaved changes (Item 13)
    if (isAnswerKeyDirty && activeTab === 'key' && tab !== 'key') {
      setPendingTab(tab);
      return;
    }
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

  const updateQuestionItem = (itemNumber: number, patch: Partial<{ question: string; options: Record<string, string> }>) => {
    setQuestionItems((current) => current.map((item) => item.item_number === itemNumber ? { ...item, ...patch, options: patch.options ? { ...item.options, ...patch.options } : item.options } : item));
  };

  // Apply OMR-detected answers as the answer key (user can override individual items after)
  const handleApplyDetectedAnswerKey = (detected: Record<number, string>) => {
    setOmrDetectedKey(detected);
    setOmrKeyMismatches([]);
    setAnswers((prev) => {
      const merged = { ...prev };
      for (let i = 1; i <= itemCount; i++) {
        if (detected[i]) merged[i] = detected[i];
      }
      return merged;
    });
  };

  // Save Answer Key to Supabase
  const handleSaveKey = async () => {
    setSavingKey(true);
    setSaveSuccessMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();
      if (!profile?.tenant_id) {
        throw new Error('Your account is not linked to a school tenant.');
      }
      const tenantId = profile.tenant_id;

      const hasQuestionContent = questionItems.some((item) => item.question.trim() || Object.values(item.options).some((option) => option.trim()));
      if (hasQuestionContent) {
        const questionPayload = questionItems.map((item) => ({
          ...item,
          correct_answer: answers[item.item_number] || item.correct_answer || '',
        }));
        const questionResponse = await fetch('/api/ai/save-exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assessmentId, tosId: tosDoc?.id || undefined, questions: questionPayload, mode: 'draft' }),
        });
        const questionResult = await questionResponse.json().catch(() => ({}));
        if (!questionResponse.ok) throw new Error(questionResult.error || 'Could not save question text and choices.');
      }

      const { error: keyErr } = await supabase
        .from('answer_keys')
        .upsert({
          assessment_id: assessmentId,
          tenant_id: tenantId,
          title: `${assessment.title} – Master Key`,
          answers: answers,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id' });

      if (keyErr) throw keyErr;

      // Sync saved state so dirty flag resets (Item 13)
      setSavedAnswers({ ...answers });
      setSavedQuestionItems(questionItems.map((item) => ({ ...item, options: { ...item.options } })));
      setSavedNumChoices(numChoices);
      setSaveSuccessMsg('Master Answer Key saved to Supabase successfully!');
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Failed to save answer key:', err);
      toast.error(friendlyError(err, 'Could not save answer key.'));
    } finally {
      setSavingKey(false);
    }
  };

  // Handle Scan Result Persistence
  const handleScanCompleted = async (result: OmrScanResult, assignedStudentId?: string, imageBlob?: Blob | File): Promise<'saved' | 'duplicate'> => {
    try {
      if (scanResults.some((scan) => scan.image_hash === result.imageHash)) {
        setSkippedScans((count) => count + 1);
        return 'duplicate';
      }
      const { data: existingImage, error: duplicateCheckError } = await supabase
        .from('scan_results')
        .select('id')
        .eq('assessment_id', assessmentId)
        .eq('image_hash', result.imageHash)
        .limit(1)
        .maybeSingle();
      if (duplicateCheckError) throw duplicateCheckError;
      if (existingImage) {
        setSkippedScans((count) => count + 1);
        return 'duplicate';
      }
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();
      if (!profile?.tenant_id) {
        throw new Error('Your account is not linked to a school tenant.');
      }
      const tenantId = profile.tenant_id;
      const scanStatus = result.status;

      // Match student from class roster by detected Barcode ID (primary), Roll Number (fallback), or LRN
      const activeRoster = studentsList.filter((student) => {
        if (assessment.sectionId && student.section_id) return student.section_id === assessment.sectionId;
        return assessment.section ? student.section_name?.toLowerCase() === assessment.section.toLowerCase() : true;
      });
      if (activeRoster.length === 0) throw new Error(`No active learners are assigned to ${assessment.section || 'this assessment section'}.`);

      // 1. Identify student from barcode (primary)
      let barcodeMatchedStudent: any = null;
      if (result.detectedStudentId) {
        const barcodeMatches = activeRoster.filter(
          (s) =>
            s.id === result.detectedStudentId ||
            s.id.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6).toUpperCase() ===
              result.detectedStudentId?.toUpperCase()
        );
        if (barcodeMatches.length === 1) barcodeMatchedStudent = barcodeMatches[0];
      }

      // 2. Identify student from roll number (fallback)
      let rollMatchedStudent: any = null;
      if (
        result.detectedRollNumber &&
        result.detectedRollNumber > 0 &&
        result.detectedRollNumber <= activeRoster.length
      ) {
        rollMatchedStudent = activeRoster[result.detectedRollNumber - 1];
      }

      // 3. Conflict resolution & fallback
      let matchedStudent: any = assignedStudentId
        ? activeRoster.find((student) => student.id === assignedStudentId) || null
        : null;
      let hasConflict = Boolean(result.detectedStudentId && !barcodeMatchedStudent);
      hasConflict ||= Boolean(matchedStudent && barcodeMatchedStudent && matchedStudent.id !== barcodeMatchedStudent.id);
      if (matchedStudent && rollMatchedStudent && matchedStudent.id !== rollMatchedStudent.id) hasConflict = true;

      if (barcodeMatchedStudent && rollMatchedStudent) {
        if (barcodeMatchedStudent.id !== rollMatchedStudent.id) {
          hasConflict = true;
          console.warn(
            `[OMR Conflict] Barcode matched ${barcodeMatchedStudent.name} (${barcodeMatchedStudent.id}) but Roll #${result.detectedRollNumber} matched ${rollMatchedStudent.name} (${rollMatchedStudent.id})`
          );
          toast.error(
            `Conflict detected: Barcode says "${barcodeMatchedStudent.name}" but Roll #${result.detectedRollNumber} is "${rollMatchedStudent.name}". Please verify!`
          );
        }
        if (!matchedStudent) matchedStudent = barcodeMatchedStudent;
      } else if (!matchedStudent) {
        matchedStudent = barcodeMatchedStudent || rollMatchedStudent;
      }

      if (!matchedStudent && result.detectedStudentLrn) {
        matchedStudent = activeRoster.find((s) => s.lrn === result.detectedStudentLrn);
      }
      if (!matchedStudent) throw new Error('Learner could not be matched to this section roster. Select the correct learner and retry.');
      if (responsesList.some((response) => response.student_id === matchedStudent.id)) {
        setSkippedScans((count) => count + 1);
        return 'duplicate';
      }
      const { data: existingResponse, error: responseCheckError } = await supabase
        .from('responses')
        .select('id')
        .eq('assessment_id', assessmentId)
        .eq('student_id', matchedStudent.id)
        .maybeSingle();
      if (responseCheckError) throw responseCheckError;
      if (existingResponse) {
        setSkippedScans((count) => count + 1);
        return 'duplicate';
      }
      const needsReview = hasConflict || scanStatus !== 'PROCESSED' || result.hasAmbiguity || result.hasMultipleMarks || result.overallConfidence < 0.75;

      // Calculate score if answer key exists
      let score = 0;
      result.items.forEach((item) => {
        if (item.selectedChoice && answers[item.itemNumber] === item.selectedChoice) {
          score++;
        }
      });
      const percentage = Math.round((score / itemCount) * 1000) / 10;
      let imageStoragePath = result.storagePath || null;
      if (imageBlob && !imageStoragePath) {
        const upload = await uploadScanImage(imageBlob, tenantId, assessmentId, result.imageHash);
        imageStoragePath = upload.path;
        if (upload.error) console.warn('Could not archive scan image:', upload.error);
      }

      // Insert scan result record with student reference
      const { data: savedScan, error: scanErr } = await supabase
        .from('scan_results')
        .insert({
          assessment_id: assessmentId,
          student_id: matchedStudent?.id || null,
          image_storage_path: imageStoragePath,
          image_hash: result.imageHash,
          confidence: result.overallConfidence,
          raw_answers: result.rawAnswers,
          normalized_answers: result.normalizedAnswers,
          status: needsReview ? 'VERIFICATION_REQUIRED' : scanStatus,
          detected_roll_number: result.detectedRollNumber,
        })
        .select('id')
        .single();

      if (scanErr) throw scanErr;

      // Upsert into responses
      const { error: responseErr } = await supabase.from('responses').upsert(
        {
          assessment_id: assessmentId,
          tenant_id: tenantId,
          student_id: matchedStudent?.id || null,
          student_lrn: matchedStudent?.lrn || result.detectedStudentLrn || null,
          section_name: matchedStudent.section_name || assessment.section,
          score,
          total_items: itemCount,
          percentage,
          status: needsReview ? 'VERIFICATION_REQUIRED' : 'GRADED',
          raw_response: result.normalizedAnswers,
          audit_trail: {
            studentName: matchedStudent?.name || (result.detectedRollNumber ? `Roll #${result.detectedRollNumber}` : 'Unassigned Learner'),
            detectedRoll: result.detectedRollNumber,
            detectedBarcodeStudentId: result.detectedStudentId || null,
            rollConflict: hasConflict,
            confidence: result.overallConfidence,
            term: assessment.term,
          },
        },
        { onConflict: 'assessment_id,student_id' }
      );
      if (responseErr) {
        if (savedScan?.id) await supabase.from('scan_results').delete().eq('id', savedScan.id);
        throw responseErr;
      }

      // Refetch scan results and responses
      const { data: refreshedScans } = await supabase
        .from('scan_results')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('created_at', { ascending: false });

      if (refreshedScans) setScanResults(refreshedScans);

      const { data: refreshedResponses } = await supabase
        .from('responses')
        .select('*')
        .eq('assessment_id', assessmentId)
        .order('scanned_at', { ascending: false });

      if (refreshedResponses) setResponsesList(refreshedResponses);

      setSaveSuccessMsg(
        `${needsReview ? 'Saved for review' : 'Scored'} ${matchedStudent.name}${result.detectedRollNumber ? ` (Roll #${result.detectedRollNumber})` : ''}: ${score}/${itemCount} (${percentage}%)`
      );
      setTimeout(() => setSaveSuccessMsg(null), 5000);
      return 'saved';

    } catch (e: any) {
      console.error('Failed to persist scan result:', e);
      throw e;
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
      itemsList = projectTosItems(competencies, itemCount);
    } else {
      const domainKeys = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
      itemsList = Array.from({ length: itemCount }, (_, idx) => ({
        itemNumber: idx + 1,
        code: `ITEM-${String(idx + 1).padStart(3, '0')}`,
        description: `Assessment Item ${idx + 1} Aligned Competency`,
        domain: domainKeys[idx % domainKeys.length],
      }));
    }

    // 2. Parse scan results examinee responses
    const gradedScans = deduplicateItemScans(scanResults);
    const actualN = gradedScans.length;
    const examinees = gradedScans.map((scan) => {
      const ansMap = readScanAnswers(scan);
      let score = 0;
      for (let i = 1; i <= itemCount; i++) {
        const stAns = ansMap[i];
        const correct = answers[i];
        if (stAns && correct && stAns.trim().toUpperCase() === correct.trim().toUpperCase()) {
          score++;
        }
      }
      const student = studentsList.find((entry) => entry.id === scan.student_id);
      return {
        ansMap,
        score,
        studentId: scan.student_id,
        name: student?.name || (scan.detected_roll_number ? `Roll #${scan.detected_roll_number}` : 'Unassigned learner'),
      };
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

      const choiceBreakdown = choicesList.map((choice) => ({
        choice,
        count: actualN ? examinees.filter((examinee) => examinee.ansMap[itemNum] === choice).length : 0,
        correct: choice === String(answers[itemNum] || '').toUpperCase(),
      }));
      const unansweredCount = actualN
        ? examinees.filter((examinee) => !choicesList.includes(examinee.ansMap[itemNum] || '')).length
        : 0;

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
        choiceBreakdown,
        unansweredCount,
        hasScannedCases: actualN > 0,
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
  }, [tosDoc, scanResults, answers, itemCount, assessment.classSize, isEditingIa, tempDraftRi, customRi, choicesList, studentsList]);

  const selectedAnswerLearners = useMemo(() => {
    if (!selectedAnswerGroup) return [];
    return deduplicateItemScans(scanResults).flatMap((scan) => {
      const selected = readScanAnswers(scan)[selectedAnswerGroup.itemNumber] || 'Blank / unreadable';
      if (selected !== selectedAnswerGroup.choice) return [];
      const student = studentsList.find((entry) => entry.id === scan.student_id);
      return [{
        id: scan.student_id || scan.id,
        name: student?.name || (scan.detected_roll_number ? `Roll #${scan.detected_roll_number}` : 'Unassigned learner'),
        lrn: student?.lrn || '',
      }];
    });
  }, [selectedAnswerGroup, scanResults, studentsList]);

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

  const sectionRoster = studentsList.filter((student) => {
    if (assessment.sectionId && student.section_id) return student.section_id === assessment.sectionId;
    return assessment.section ? student.section_name?.toLowerCase() === assessment.section.toLowerCase() : true;
  });
  const rosterForProgress = sectionRoster;
  const scannedStudentIds = new Set(responsesList.map((response) => response.student_id).filter(Boolean));
  const scannedCount = rosterForProgress.filter((student) => scannedStudentIds.has(student.id)).length;
  const unscannedCount = Math.max(0, rosterForProgress.length - scannedCount);
  const reviewCount = scanResults.filter((scan) => scan.status === 'VERIFICATION_REQUIRED').length;

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
            { id: 'scan', label: '1. Scan Responses', icon: Camera },
            { id: 'results', label: '2. Item Analysis', icon: BarChart3 },
            { id: 'tos', label: 'TOS Setup', icon: FileSpreadsheet },
            { id: 'key', label: 'Answer Key Setup', icon: KeyRound },
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
          {/* Table of Specifications setup lives in the shared TOS workspace. */}
          {activeTab === 'tos' && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900">
              <div className="mx-auto max-w-2xl text-center">
                <FileSpreadsheet className="mx-auto h-9 w-9 text-blue-600" />
                <h2 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">Table of Specifications</h2>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Create and maintain the assessment blueprint in the shared TOS workspace. Linked sections and print reports stay together there.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  {tosDoc?.id && <Link href={`/tos?edit=${tosDoc.id}`} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Edit linked TOS</Link>}
                  {tosDoc?.id && <Link href={`/tos?print=${tosDoc.id}`} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">View and print TOS</Link>}
                  <Link href="/tos" className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Open TOS workspace</Link>
                </div>
                {!tosDoc?.id && <p className="mt-4 text-xs text-amber-700">No TOS is linked to this assessment yet. Create one in the workspace and link it to this assessment.</p>}
              </div>
            </div>
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
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={() => setIsAnswerKeyScannerOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-gray-900 dark:text-emerald-400 dark:hover:bg-emerald-950/40 transition"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Scan Key via OMR</span>
                  </button>
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

              {/* OMR Key Applied Banner */}
              {Object.keys(omrDetectedKey).length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs dark:border-emerald-800 dark:bg-emerald-950/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                      OMR Key Applied — {Object.keys(omrDetectedKey).length} answers auto-filled
                    </span>
                    {omrKeyMismatches.length > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700 font-bold dark:bg-amber-950/60 dark:text-amber-300">
                        {omrKeyMismatches.length} overridden
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setOmrDetectedKey({});
                      setOmrKeyMismatches([]);
                    }}
                    className="text-[11px] text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200 underline underline-offset-2"
                  >
                    Clear OMR overlay
                  </button>
                </div>
              )}

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
                        'flex flex-col items-stretch gap-2 px-2.5 py-2 sm:px-3 sm:py-2 rounded-2xl border transition min-w-0 overflow-hidden w-full',
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
                      <details className="w-full border-t border-gray-200/70 pt-2 dark:border-gray-700/70">
                        <summary className="cursor-pointer text-[10px] font-semibold text-blue-700 dark:text-blue-300">{questionItems[itemNum - 1]?.question ? 'Edit question and choices' : 'Add question and choices'}</summary>
                        <div className="mt-2 space-y-2">
                          <label className="block text-[10px] font-bold uppercase tracking-wide text-gray-500">Question {itemNum}
                            <textarea value={questionItems[itemNum - 1]?.question || ''} onChange={(event) => updateQuestionItem(itemNum, { question: event.target.value })} rows={3} placeholder="Enter the question text" className="mt-1 w-full rounded-lg border border-gray-200 bg-white p-2 text-xs font-normal normal-case tracking-normal text-gray-800 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                          </label>
                          {choicesList.map((letter) => (
                            <label key={letter} className="flex items-center gap-2 text-[11px] font-bold text-gray-500">
                              <span className="w-4">{letter}</span>
                              <input value={questionItems[itemNum - 1]?.options[letter] || ''} onChange={(event) => updateQuestionItem(itemNum, { options: { [letter]: event.target.value } })} placeholder={`Choice ${letter}`} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-normal text-gray-800 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                            </label>
                          ))}
                          <p className="text-[10px] text-gray-400">Select the correct answer using the bubbles above. This key is used for scan scoring.</p>
                        </div>
                      </details>
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
                    Scan responses for item analysis
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Scan the sheet code and roll number, read marked choices, then confirm learner matching and uncertain marks before saving.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => setIsPrintModalOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-xs hover:bg-gray-50 transition dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print OMR Sheets</span>
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

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Sheets scanned', value: scannedCount, note: `${rosterForProgress.length} learners in section` },
                  { label: 'Not scanned', value: unscannedCount, note: 'Based on the active roster' },
                  { label: 'Needs review', value: reviewCount, note: 'Low confidence or uncertain marks' },
                  { label: 'Skipped duplicates', value: skippedScans, note: 'Repeat sheets were not saved' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-800 dark:bg-gray-800/40">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{item.label}</p>
                    <p className="mt-1 text-xl font-black text-gray-900 dark:text-white">{item.value}</p>
                    <p className="text-[10px] text-gray-500">{item.note}</p>
                  </div>
                ))}
              </div>

              <ol className="grid gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px] text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200 sm:grid-cols-3">
                <li><strong>1. Identify:</strong> read the sheet barcode and shaded roll number.</li>
                <li><strong>2. Read:</strong> detect each selected answer choice.</li>
                <li><strong>3. Confirm:</strong> skip duplicate sheets and review uncertain scans before saving.</li>
              </ol>

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
                    <table className="w-full text-left text-xs table-optimized min-w-[650px]">
                      <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40">
                        <tr>
                          <th className="px-4 py-3">Learner Name</th>
                          <th className="px-4 py-3 text-center">Roll / LRN</th>
                          <th className="px-4 py-3 text-center">Acquired Test Score</th>
                          <th className="px-4 py-3 text-center">Confidence</th>
                          <th className="px-4 py-3 text-center">Status</th>
                          <th className="px-4 py-3 text-right">Timestamp</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {scanResults.map((s) => {
                          const matchedResp = responsesList.find((r) => r.student_id === s.student_id);
                          const matchedStd = studentsList.find((std) => std.id === s.student_id);
                          const studentName =
                            matchedResp?.audit_trail?.studentName ||
                            matchedStd?.name ||
                            (s.detected_roll_number ? `Roll #${s.detected_roll_number}` : 'Unassigned Learner');

                          return (
                            <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                              <td className="px-4 py-3">
                                <div className="font-bold text-gray-900 dark:text-white">
                                  {studentName}
                                </div>
                                <div className="font-mono text-[10px] text-gray-400">
                                  {s.image_hash?.slice(0, 16)}...
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center font-mono text-[11px] text-gray-600 dark:text-gray-300">
                                {s.detected_roll_number ? `#${s.detected_roll_number}` : matchedStd?.lrn || '—'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {matchedResp?.score !== undefined ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    <span>{matchedResp.score} / {itemCount} ({matchedResp.percentage}%)</span>
                                  </span>
                                ) : (
                                  <span className="font-mono text-gray-400 text-[11px]">Scored</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center font-semibold text-blue-600 dark:text-blue-400">
                                {Math.round((s.confidence || 1.0) * 100)}%
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                                  s.status === 'VERIFICATION_REQUIRED'
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                )}>
                                  {s.status === 'VERIFICATION_REQUIRED' ? 'Needs review' : s.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right text-gray-400 text-[11px]">
                                {new Date(s.created_at).toLocaleTimeString()}
                              </td>
                            </tr>
                          );
                        })}
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
                    {reviewCount > 0 && <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">{reviewCount} scan{reviewCount === 1 ? '' : 's'} need verification and are excluded from these statistics until corrected.</p>}
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/reports/docx?type=item-analysis&assessmentId=${encodeURIComponent(assessmentId)}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300"
                    >
                      <Download className="h-3.5 w-3.5" /> Download DOCX
                    </a>
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
                                {questionItems.find((question) => question.item_number === row.itemNumber)?.question || row.description}
                              </span>
                              <div className="mt-1 flex flex-wrap gap-1" aria-label={`Answer choice counts for item ${row.itemNumber}`}>
                                {row.choiceBreakdown.map((choice) => (
                                  <button
                                    key={choice.choice}
                                    type="button"
                                    onClick={() => setSelectedAnswerGroup({ itemNumber: row.itemNumber, choice: choice.choice })}
                                    disabled={!row.hasScannedCases}
                                    title={`${choice.choice} is ${choice.correct ? 'correct' : 'incorrect'}; ${choice.count} learners selected it. Click to see learners.`}
                                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-50 ${choice.correct
                                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'}`}
                                  >
                                    {choice.choice} · {choice.count} {choice.correct ? '✓' : '×'}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setSelectedAnswerGroup({ itemNumber: row.itemNumber, choice: 'Blank / unreadable' })}
                                  disabled={!row.hasScannedCases || row.unansweredCount === 0}
                                  title={`${row.unansweredCount} unanswered or unreadable; click to see learners.`}
                                  className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                                >
                                  Blank · {row.unansweredCount}
                                </button>
                              </div>
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

      {selectedAnswerGroup && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedAnswerGroup(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="answer-choice-learners-title" className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <header className="flex items-start justify-between gap-4 border-b border-gray-100 p-5 dark:border-gray-800">
              <div>
                <h2 id="answer-choice-learners-title" className="text-base font-bold text-gray-900 dark:text-white">
                  Item {selectedAnswerGroup.itemNumber} · {selectedAnswerGroup.choice}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedAnswerGroup.choice === String(answers[selectedAnswerGroup.itemNumber] || '').toUpperCase()
                    ? 'Correct answer selected by these learners'
                    : 'Incorrect or blank answer selected by these learners'}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedAnswerGroup(null)} className="rounded-lg px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">Close</button>
            </header>
            <div className="overflow-y-auto p-5">
              <p className="mb-3 text-xs font-semibold text-gray-600 dark:text-gray-300">
                {selectedAnswerLearners.length} learner{selectedAnswerLearners.length === 1 ? '' : 's'} · Answer key: {answers[selectedAnswerGroup.itemNumber] || 'not set'}
              </p>
              {selectedAnswerLearners.length ? (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 dark:divide-gray-800 dark:border-gray-800">
                  {selectedAnswerLearners.map((learner) => (
                    <li key={learner.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{learner.name}</span>
                      {learner.lrn && <span className="font-mono text-xs text-gray-500">{learner.lrn}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-800">No identified learner scans selected this answer.</p>
              )}
            </div>
          </section>
        </div>
      )}

      {/* OMR Print Modal */}
      {isPrintModalOpen && (
        <OmrPrintModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          geometry={canonicalGeometry}
          students={rosterForProgress}
          assessment={{
            id: assessmentId,
            title: assessment.title,
            subject: assessment.subject,
            section: assessment.section,
            term: assessment.term,
            school_year: assessment.schoolYear,
          }}
          teacherName={currentTeacherName}
          schoolName={tenantName}
          region={region}
          division={division}
          logoData={logoData}
        />
      )}

      {/* OMR Camera Scanner Modal */}
      {isScannerOpen && (
        <OmrCameraModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          assessmentId={assessmentId}
          template={omrTemplate}
          students={rosterForProgress}
          onScanComplete={handleScanCompleted}
        />
      )}

      {/* OMR Answer Key Scanner Modal */}
      {isAnswerKeyScannerOpen && (
        <OmrCameraModal
          isOpen={isAnswerKeyScannerOpen}
          onClose={() => setIsAnswerKeyScannerOpen(false)}
          assessmentId={assessmentId}
          template={omrTemplate}
          mode="answer_key"
          onApplyAnswerKey={(detected) => {
            handleApplyDetectedAnswerKey(detected);
            setIsAnswerKeyScannerOpen(false);
          }}
        />
      )}

      {/* Unsaved answer key changes discard modal (Item 13) */}
      <ConfirmationModal
        isOpen={pendingTab !== null}
        onClose={() => setPendingTab(null)}
        onConfirm={() => {
          if (pendingTab) {
            // Revert to saved state and navigate
            setAnswers({ ...savedAnswers });
            setQuestionItems(savedQuestionItems.map((item) => ({ ...item, options: { ...item.options } })));
            setNumChoices(savedNumChoices);
            router.replace(`/assessments/${assessmentId}?tab=${pendingTab}`);
            setPendingTab(null);
          }
        }}
        title="Discard unsaved changes?"
        description="Your answer key has unsaved changes. Switching tabs will discard them."
        actionType="neutral"
        confirmLabel="Discard Changes"
        cancelLabel="Keep Editing"
      />
    </div>
  );
}
