'use client';

import { TosEditor } from '@/components/assessment/TosEditor';
import { ConfirmationModal } from '@/components/ui/confirmation-modal';
import { useToast } from '@/components/ui/toast';
import { getPhilippineSchoolYear } from '@/lib/academic-calendar';
import { friendlyError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';
import {
    ArrowRight,
    CheckCircle2,
    FileSpreadsheet,
    Loader2,
    Plus,
    Trash2
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface TosDocumentItem {
  id: string;
  assessment_id?: string | null;
  subject: string;
  term: string;
  school_year: string;
  grade?: string;
  strand?: string;
  section?: string;
  target_items: number;
  total_days?: number;
  status: string;
  teacher_name?: string;
  created_at: string;
  rows?: any[];
  assessments?: { id: string; title: string } | null;
}

export default function TosStandalonePage() {
  const { toast } = useToast();
  const supabase = createClient();

  const [tosList, setTosList] = useState<TosDocumentItem[]>([]);
  const [selectedTosId, setSelectedTosId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // New TOS Modal State
  const [isNewTosModalOpen, setIsNewTosModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newTerm, setNewTerm] = useState('1st Term');
  const [newSchoolYear, setNewSchoolYear] = useState(() => getPhilippineSchoolYear());
  const [newTargetItems, setNewTargetItems] = useState(50);
  const [newGrade, setNewGrade] = useState('Grade 11');
  const [newStrand, setNewStrand] = useState('STEM');
  const [newSection, setNewSection] = useState('');

  // Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [tosToDelete, setTosToDelete] = useState<TosDocumentItem | null>(null);

  // Grading Periods
  const [gradingPeriods, setGradingPeriods] = useState<Array<{ id: string; name: string; is_current: boolean }>>([]);

  async function loadTosDocuments() {
    setLoading(true);
    try {
      const [tosRes, gpRes] = await Promise.all([
        (supabase as any)
          .from('tos_documents')
          .select(`
            id,
            assessment_id,
            subject,
            term,
            school_year,
            grade,
            strand,
            section,
            target_items,
            total_days,
            status,
            teacher_name,
            created_at,
            rows,
            assessments ( id, title )
          `)
          .order('created_at', { ascending: false }),
        (supabase as any)
          .from('grading_periods')
          .select('id, name, is_current')
          .eq('is_archived', false)
          .order('position', { ascending: true }),
      ]);

      if (gpRes?.data && gpRes.data.length > 0) {
        setGradingPeriods(gpRes.data);
        const cur = gpRes.data.find((g: any) => g.is_current);
        if (cur) setNewTerm(cur.name);
      }

      if (tosRes?.data) {
        setTosList(tosRes.data);
        if (tosRes.data.length > 0 && !selectedTosId) {
          setSelectedTosId(tosRes.data[0].id);
        }
      }
    } catch (e: any) {
      console.error('Failed to fetch TOS documents:', e);
      toast.error(friendlyError(e, 'Failed to load Table of Specifications list.'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTosDocuments();
  }, []);

  const handleCreateNewTos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim()) {
      toast.error('Please enter a subject name.');
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('tenant_id, display_name')
        .eq('id', user?.id || '')
        .maybeSingle();

      if (!profile?.tenant_id) {
        throw new Error('Your account is not linked to an active school tenant.');
      }

      const initialRows = [
        {
          id: '1',
          code: 'COMP-1',
          description: `${newSubject.trim()} - Core Competency 1`,
          daysTaught: 5,
          days: 5,
          domains: { remembering: 0, understanding: 0, applying: 0, analyzing: 0, evaluating: 0, creating: 0 },
        },
      ];

      const payload = {
        tenant_id: profile.tenant_id,
        subject: newSubject.trim(),
        term: newTerm,
        school_year: newSchoolYear,
        grade: newGrade.trim(),
        strand: newStrand.trim(),
        section: newSection.trim() || undefined,
        target_items: newTargetItems,
        total_days: 5,
        days_taught: 5,
        status: 'DRAFT',
        teacher_name: profile.display_name || 'Subject Teacher',
        created_by: user?.id,
        rows: initialRows,
      };

      const { data: inserted, error: insErr } = await (supabase as any)
        .from('tos_documents')
        .insert(payload)
        .select()
        .single();

      if (insErr) throw insErr;

      toast.success('Table of Specifications created. You can now define competencies and days taught.');
      setIsNewTosModalOpen(false);
      setNewSubject('');
      await loadTosDocuments();
      if (inserted?.id) {
        setSelectedTosId(inserted.id);
      }
    } catch (err: any) {
      console.error('Failed to create TOS:', err);
      toast.error(friendlyError(err, 'Failed to create Table of Specifications.'));
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTos = async () => {
    if (!tosToDelete) return;
    try {
      const { error: delErr } = await (supabase as any)
        .from('tos_documents')
        .delete()
        .eq('id', tosToDelete.id);

      if (delErr) throw delErr;

      toast.success(`TOS for "${tosToDelete.subject}" deleted.`);
      setDeleteModalOpen(false);
      setTosToDelete(null);
      const remaining = tosList.filter((t) => t.id !== tosToDelete.id);
      setTosList(remaining);
      setSelectedTosId(remaining.length > 0 ? remaining[0].id : '');
    } catch (err: any) {
      console.error('Failed to delete TOS:', err);
      toast.error(friendlyError(err, 'Failed to delete Table of Specifications.'));
    }
  };

  const activeTos = tosList.find((t) => t.id === selectedTosId) || (tosList.length > 0 ? tosList[0] : null);

  return (
    <div className="space-y-6 min-w-0">
      {/* Top Banner & TOS Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-blue-200" />
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">
              Table of Specifications (TOS) Workspace
            </h1>
          </div>
          <p className="text-xs text-blue-100 max-w-xl">
            DepEd-standard Table of Specifications: define learning competencies, instructional days taught, and test item allocations first before deriving exams and assessments.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {tosList.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-blue-100 whitespace-nowrap">Active TOS:</span>
              <select
                value={activeTos?.id || ''}
                onChange={(e) => setSelectedTosId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-bold outline-none focus:ring-2 focus:ring-white"
              >
                {tosList.map((t) => (
                  <option key={t.id} value={t.id} className="text-gray-900">
                    {t.subject} ({t.term} · {t.target_items} items)
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => setIsNewTosModalOpen(true)}
            className="px-4 py-2 bg-white text-blue-700 hover:bg-blue-50 font-bold rounded-xl text-xs shadow-xs transition flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>New TOS</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
          <span className="text-xs">Loading Table of Specifications workspace...</span>
        </div>
      ) : tosList.length === 0 ? (
        <div className="p-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl space-y-4">
          <FileSpreadsheet className="h-10 w-10 text-gray-400 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">No Table of Specifications Created Yet</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
              Start by creating your first Table of Specifications. Enter competencies, instructional days taught, and total test items. Once finalized, derive an assessment or generate an exam directly from it.
            </p>
          </div>
          <button
            onClick={() => setIsNewTosModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            <Plus className="h-4 w-4" />
            <span>Create Table of Specifications</span>
          </button>
        </div>
      ) : activeTos ? (
        <div className="space-y-4">
          {/* Linked Assessment CTA Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 rounded-2xl text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0" />
              <span>
                {activeTos.assessment_id ? (
                  <span className="text-gray-700 dark:text-gray-300">
                    Linked Assessment: <strong>{activeTos.assessments?.title || 'Active Assessment'}</strong>
                  </span>
                ) : (
                  <span className="text-gray-700 dark:text-gray-300">
                    This TOS is ready to be used. Derive an exam or create an assessment from it.
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {activeTos.assessment_id ? (
                <Link
                  href={`/assessments/${activeTos.assessment_id}`}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  <span>Open Assessment</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <Link
                  href={`/assessments?new=true&tos_id=${activeTos.id}`}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition flex items-center gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Assessment from this TOS</span>
                </Link>
              )}

              <button
                onClick={() => {
                  setTosToDelete(activeTos);
                  setDeleteModalOpen(true);
                }}
                className="p-1.5 text-gray-400 hover:text-rose-600 transition rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
                title="Delete this TOS"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <TosEditor
            key={activeTos.id}
            tosDocId={activeTos.id}
            assessmentId={activeTos.assessment_id || ''}
            initialSubject={activeTos.subject}
            initialTerm={activeTos.term}
            initialSchoolYear={activeTos.school_year}
            initialGrade={activeTos.grade || ''}
            initialStrand={activeTos.strand || ''}
            initialSection={activeTos.section || ''}
            initialTargetItems={activeTos.target_items || 50}
            initialStatus={activeTos.status || 'DRAFT'}
            teacherName={activeTos.teacher_name || ''}
            onSaveSuccess={loadTosDocuments}
          />
        </div>
      ) : null}

      {/* ── New TOS Modal ── */}
      {isNewTosModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl p-6 shadow-2xl space-y-5 border border-gray-200 dark:border-gray-800">
            <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                Create Table of Specifications (TOS)
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Step 1 of the DepEd curriculum workflow. Derive assessments and personalized answer sheets after finalizing this TOS.
              </p>
            </div>

            <form onSubmit={handleCreateNewTos} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Subject Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. General Mathematics"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Grading Term *
                  </label>
                  {gradingPeriods.length > 0 ? (
                    <select
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold outline-none"
                    >
                      {gradingPeriods.map((gp) => (
                        <option key={gp.id} value={gp.name}>
                          {gp.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    School Year *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSchoolYear}
                    onChange={(e) => setNewSchoolYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-semibold outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Target Items (N)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={newTargetItems}
                    onChange={(e) => setNewTargetItems(Number(e.target.value) || 50)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-center font-bold text-blue-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Grade Level
                  </label>
                  <input
                    type="text"
                    value={newGrade}
                    onChange={(e) => setNewGrade(e.target.value)}
                    placeholder="e.g. Grade 11"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Track / Strand
                  </label>
                  <input
                    type="text"
                    value={newStrand}
                    onChange={(e) => setNewStrand(e.target.value)}
                    placeholder="e.g. STEM"
                    className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsNewTosModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition flex items-center gap-1.5"
                >
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Create TOS</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteTos}
        title="Delete Table of Specifications?"
        description={`Are you sure you want to delete the TOS for "${tosToDelete?.subject}"? This action cannot be undone.`}
        actionType="delete"
        confirmLabel="Delete TOS"
        cancelLabel="Cancel"
      />
    </div>
  );
}
