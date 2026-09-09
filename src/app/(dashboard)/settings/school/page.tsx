'use client';

import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, Loader2, Save, School, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

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

  const supabase = createClient();

  useEffect(() => {
    async function loadSchoolSettings() {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
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
        }
      } catch (err: any) {
        console.error('Failed to load school settings:', err);
        setError(err.message || 'Failed to load school configuration');
      } finally {
        setLoading(false);
      }
    }

    loadSchoolSettings();
  }, [supabase]);

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

      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err: any) {
      console.error('Failed to save school settings:', err);
      setError(err.message || 'Could not save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          School Academic Settings
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Configure active academic periods, faculty designations, and institutional signing authorities.
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
          {/* Academic Period */}
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

          {/* Faculty & Signatories */}
          <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3 dark:border-gray-800">
              <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                Faculty Profile & Test Signatories
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
