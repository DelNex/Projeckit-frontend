'use client';

import { createClient } from '@/lib/supabase/client';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function ProfileSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('TEACHER');
  const [newPassword, setNewPassword] = useState('');

  const supabase = createClient();

  useEffect(() => {
    async function loadUserProfile() {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setEmail(user.email || '');

          const { data: profile } = await (supabase as any)
            .from('profiles')
            .select('display_name, role, status')
            .eq('id', user.id)
            .maybeSingle();

          setDisplayName(profile?.display_name || user.email?.split('@')[0] || 'Teacher');
          setRole((profile?.role || 'teacher').toUpperCase());
        }
      } catch (err: any) {
        console.error('Failed to load profile:', err);
        setError(err.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }

    loadUserProfile();
  }, [supabase]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Update display name in public.profiles
      const { error: profileErr } = await (supabase as any)
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileErr) throw profileErr;

      // 2. If password provided, update user auth password
      if (newPassword.trim()) {
        if (newPassword.length < 6) {
          throw new Error('Password must be at least 6 characters long');
        }
        const { error: pwdErr } = await supabase.auth.updateUser({
          password: newPassword,
        });
        if (pwdErr) throw pwdErr;
        setNewPassword('');
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setError(err.message || 'Could not update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">
          User Profile Settings
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Manage your account credentials, display name, and security preferences.
        </p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          <span>Profile successfully updated in Supabase!</span>
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
          <span>Loading user profile from Supabase...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800 dark:bg-gray-900 paint-isolate space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Full Name / Display Name
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Email Address
            </label>
            <input
              type="email"
              disabled
              value={email}
              className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-100 px-3.5 py-2.5 text-xs font-medium text-gray-500 outline-none cursor-not-allowed dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400"
            />
            <span className="mt-1 block text-[11px] text-gray-400">
              Institutional email verified via Supabase Auth ({role}).
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Change Password (Optional)
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (minimum 6 characters)"
              className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-blue-600 focus:bg-white dark:border-gray-800 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Update Profile</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
