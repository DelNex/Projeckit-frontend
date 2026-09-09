'use client';

import { createClient } from '@/lib/supabase/client';
import {
    Filter,
    Loader2,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    Users,
    X
} from 'lucide-react';
import { useEffect, useState } from 'react';

interface StudentRecord {
  id: string;
  lrn: string;
  name: string;
  section_name: string;
  gender?: string;
  created_at?: string;
  sections?: { id: string; name: string; grade: string } | null;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('ALL');
  const [sectionsList, setSectionsList] = useState<{ id: string; name: string }[]>([]);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [formLrn, setFormLrn] = useState('');
  const [formName, setFormName] = useState('');
  const [formSection, setFormSection] = useState('');

  const supabase = createClient();

  const fetchStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('students')
        .select(`
          id,
          lrn,
          name,
          section_name,
          created_at
        `)
        .order('name', { ascending: true });

      if (err) throw err;
      setStudents(data || []);
    } catch (err: any) {
      console.error('Failed to fetch students:', err);
      setError(err?.message || 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const fetchSections = async () => {
    try {
      const { data } = await supabase.from('sections').select('id, name');
      if (data && data.length > 0) {
        setSectionsList(data);
        if (!formSection) setFormSection(data[0].name);
      }
    } catch (e) {
      console.warn('Error fetching sections:', e);
    }
  };

  useEffect(() => {
    fetchStudents();
    fetchSections();
  }, []);

  const openAddModal = () => {
    setEditingStudent(null);
    setFormLrn('');
    setFormName('');
    if (sectionsList.length > 0) setFormSection(sectionsList[0].name);
    setIsAddModalOpen(true);
  };

  const openEditModal = (student: StudentRecord) => {
    setEditingStudent(student);
    setFormLrn(student.lrn);
    setFormName(student.name);
    setFormSection(student.section_name);
    setIsAddModalOpen(true);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formLrn.trim() || !formName.trim() || !formSection) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user?.id || '')
        .maybeSingle();

      const tenantId = profile?.tenant_id || 'a0000000-0000-0000-0000-000000000001';

      // Get academic config
      const { data: config } = await supabase
        .from('academic_configs')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(1)
        .maybeSingle();

      const configId = config?.id || 'c0000000-0000-0000-0000-000000000001';

      if (editingStudent) {
        // UPDATE
        const { error: updErr } = await supabase
          .from('students')
          .update({
            lrn: formLrn.trim(),
            name: formName.trim(),
            section_name: formSection,
          })
          .eq('id', editingStudent.id);

        if (updErr) throw updErr;
      } else {
        // INSERT
        const { error: insErr } = await supabase
          .from('students')
          .insert({
            tenant_id: tenantId,
            config_id: configId,
            lrn: formLrn.trim(),
            name: formName.trim(),
            section_name: formSection,
          });

        if (insErr) throw insErr;
      }

      setIsAddModalOpen(false);
      await fetchStudents();
    } catch (err: any) {
      console.error('Failed to save student:', err);
      alert(`Error saving student: ${err.message || err}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStudent = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove learner "${name}"?`)) return;

    try {
      const { error: delErr } = await supabase.from('students').delete().eq('id', id);
      if (delErr) throw delErr;
      setStudents((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      console.error('Failed to delete student:', err);
      alert(`Could not delete student: ${err.message || err}`);
    }
  };

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.lrn.includes(searchQuery) ||
      s.section_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSection = sectionFilter === 'ALL' || s.section_name === sectionFilter;
    return matchesSearch && matchesSection;
  });

  return (
    <div className="space-y-6 min-w-0">
      {/* Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">
            Learners Roster
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Authoritative student enrollment records and DepEd Learner Reference Numbers (LRN).
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Add Learner</span>
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300 flex items-center justify-between">
          <span>{error}</span>
          <button 
            onClick={fetchStudents}
            className="inline-flex items-center gap-1 font-bold underline hover:text-red-900"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-3.5 sm:p-4 shadow-2xs dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between paint-isolate min-w-0">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by learner name or 12-digit LRN..."
            className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50/60 pl-10 pr-4 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 dark:border-gray-800 dark:bg-gray-800/50 dark:text-white dark:focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-gray-50/60 px-3 text-xs font-medium text-gray-700 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-300"
          >
            <option value="ALL">All Sections</option>
            {sectionsList.map((sec) => (
              <option key={sec.id} value={sec.name}>{sec.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-2xs dark:border-gray-800 dark:bg-gray-900 overflow-hidden paint-isolate min-w-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-2" />
            <span className="text-xs">Loading learners from Supabase...</span>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <Users className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-2" />
            <p className="text-sm font-bold text-gray-800 dark:text-gray-200">No learners found</p>
            <p className="text-xs text-gray-400 max-w-sm mt-1 mb-4">
              {searchQuery ? 'No learners matched your search query.' : 'Enroll students to begin generating personalized OMR sheets and tracking MPS.'}
            </p>
            {!searchQuery && (
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                <span>Add First Learner</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs table-optimized min-w-[550px]">
              <thead className="border-b border-gray-100 bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/40 dark:text-gray-500">
                <tr>
                  <th className="px-4 sm:px-6 py-4">Learner Name</th>
                  <th className="px-4 sm:px-6 py-4">DepEd LRN</th>
                  <th className="px-4 sm:px-6 py-4">Section</th>
                  <th className="px-4 sm:px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredStudents.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 sm:px-6 py-4 font-semibold text-gray-900 dark:text-white">
                      {s.name}
                    </td>
                    <td className="px-4 sm:px-6 py-4 font-mono text-gray-600 dark:text-gray-300">
                      {s.lrn}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-500 dark:text-gray-400">
                      {s.section_name}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(s)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 transition"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(s.id, s.name)}
                          className="rounded-lg p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-950/30 transition"
                          title="Delete Student"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Learner Modal Dialog */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {editingStudent ? 'Edit Learner' : 'Add New Learner'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudent} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  12-Digit DepEd LRN
                </label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  pattern="\d{12}"
                  placeholder="e.g. 109283746501"
                  value={formLrn}
                  onChange={(e) => setFormLrn(e.target.value.replace(/\D/g, ''))}
                  className="h-10 w-full font-mono rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Full Name (Last, First M.)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Santos, Maria Clara G."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Assigned Section
                </label>
                <select
                  required
                  value={formSection}
                  onChange={(e) => setFormSection(e.target.value)}
                  className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 outline-none focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
                >
                  {sectionsList.map((sec) => (
                    <option key={sec.id} value={sec.name}>{sec.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>{submitting ? 'Saving...' : editingStudent ? 'Update Learner' : 'Add Learner'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
