'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownToLine, BookOpenCheck, FileSpreadsheet, Loader2, Printer, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface SectionRow { id: string; name: string; grade?: string | null }
interface AssessmentRow { id: string; title: string; section_id: string; tos_id?: string | null; term: string; school_year: string }
interface TosRow {
  id: string; subject: string; term: string; school_year: string; section?: string | null;
  sections?: Array<{ id?: string; name?: string }> | null; assessment_id?: string | null;
  target_items: number; status: string;
}

export default function ReportsPage() {
  const supabase = createClient();
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [tosDocuments, setTosDocuments] = useState<TosRow[]>([]);
  const [selectedSection, setSelectedSection] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const [sectionResult, assessmentResult, tosResult] = await Promise.all([
        supabase.from('sections').select('id, name, grade').order('name'),
        supabase.from('assessments').select('id, title, section_id, tos_id, term, school_year').order('created_at', { ascending: false }),
        supabase.from('tos_documents').select('id, subject, term, school_year, section, sections, assessment_id, target_items, status').order('created_at', { ascending: false }),
      ]);
      const problem = sectionResult.error || assessmentResult.error || tosResult.error;
      if (problem) throw problem;
      const nextSections = sectionResult.data || [];
      setSections(nextSections);
      setAssessments((assessmentResult.data || []) as AssessmentRow[]);
      setTosDocuments((tosResult.data || []) as unknown as TosRow[]);
      setSelectedSection((current) => current || nextSections[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load section reports.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadReports(); }, []);

  const section = sections.find((item) => item.id === selectedSection);
  const sectionAssessments = assessments.filter((item) => item.section_id === selectedSection);
  const assessmentIds = new Set(sectionAssessments.map((item) => item.id));
  const sectionTos = tosDocuments.filter((doc) => {
    if (doc.assessment_id && assessmentIds.has(doc.assessment_id)) return true;
    if (doc.sections?.some((item) => item.id === selectedSection || item.name?.toLowerCase() === section?.name.toLowerCase())) return true;
    return Boolean(doc.section && section && doc.section.toLowerCase().split(/[,;|]/).map((name) => name.trim()).includes(section.name.toLowerCase()));
  });

  const reportCount = sectionTos.length + sectionAssessments.length;
  const linkedAssessmentForTos = (tos: TosRow) => sectionAssessments.find((item) => item.id === tos.assessment_id || item.tos_id === tos.id);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Print center</p>
          <h1 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">Section reports</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">Choose a class section to see its linked TOS, exam workspaces, and item analysis reports.</p>
        </div>
        <button onClick={() => void loadReports()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-sm text-gray-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading reports…</div>
      ) : sections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
          <BookOpenCheck className="mx-auto h-8 w-8 text-gray-400" />
          <h2 className="mt-3 font-bold text-gray-900 dark:text-white">No sections available</h2>
          <p className="mt-1 text-sm text-gray-500">Create a section and link your TOS or assessment to it to see printable reports here.</p>
        </div>
      ) : (
        <>
          <section aria-label="Choose section" className="flex flex-wrap gap-2">
            {sections.map((item) => (
              <button key={item.id} onClick={() => setSelectedSection(item.id)} aria-pressed={selectedSection === item.id}
                className={`rounded-xl border px-4 py-2.5 text-left text-sm transition ${selectedSection === item.id ? 'border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300'}`}>
                <span className="block font-bold">{item.name}</span>
                {item.grade && <span className="text-xs opacity-70">{item.grade}</span>}
              </button>
            ))}
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">{section?.name || 'Section reports'}</h2>
                <p className="text-xs text-gray-500">{reportCount} available report{reportCount === 1 ? '' : 's'}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{sectionAssessments.length} assessment{sectionAssessments.length === 1 ? '' : 's'}</span>
            </div>

            {reportCount === 0 ? (
              <div className="py-12 text-center">
                <FileSpreadsheet className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 font-semibold text-gray-700 dark:text-gray-200">No TOS or assessment linked to this section</p>
                <p className="mt-1 text-xs text-gray-500">Link a TOS to an assessment or select this section when generating the TOS.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {sectionTos.map((doc) => {
                  const linkedAssessment = linkedAssessmentForTos(doc);
                  return (
                    <article key={`tos-${doc.id}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" /><h3 className="truncate font-semibold text-gray-900 dark:text-white">{doc.subject} · Table of Specifications</h3></div>
                        <p className="mt-1 pl-6 text-xs text-gray-500">{doc.term} · {doc.school_year} · {doc.target_items} items · {linkedAssessment ? `Linked to ${linkedAssessment.title}` : `TOS ${doc.status}`}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a href={`/api/reports/docx?type=tos&tosId=${encodeURIComponent(doc.id)}`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-200 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
                          <ArrowDownToLine className="h-4 w-4" /> Download TOS DOCX
                        </a>
                        {linkedAssessment && (
                          <>
                            <a href={`/api/reports/docx?type=test-results&tosId=${encodeURIComponent(doc.id)}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-blue-200 px-3 text-xs font-bold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/30">
                              <ArrowDownToLine className="h-4 w-4" /> Test results DOCX
                            </a>
                            <a href={`/api/reports/docx?type=most-least-learned&tosId=${encodeURIComponent(doc.id)}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 px-3 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/30">
                              <ArrowDownToLine className="h-4 w-4" /> Most/least learned DOCX
                            </a>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
                {sectionAssessments.map((assessment) => (
                  <article key={`assessment-${assessment.id}`} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><BookOpenCheck className="h-4 w-4 shrink-0 text-blue-600" /><h3 className="truncate font-semibold text-gray-900 dark:text-white">{assessment.title} · Item analysis</h3></div>
                      <p className="mt-1 pl-6 text-xs text-gray-500">{assessment.term} · {assessment.school_year} · {section?.name}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={`/api/reports/docx?type=item-analysis&assessmentId=${encodeURIComponent(assessment.id)}`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-violet-200 px-3 text-xs font-bold text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300">
                        <ArrowDownToLine className="h-4 w-4" /> Item analysis DOCX
                      </a>
                      <Link href={`/assessments/${assessment.id}?tab=scan&print=sheet`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
                        <Printer className="h-4 w-4" /> Print OMR sheets
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
