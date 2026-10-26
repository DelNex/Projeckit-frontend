'use client';

import {
  DEPED_REGISTRATION_ERROR_MESSAGE,
  getRegistrationErrorMessage,
  isValidDepEdEmail,
} from '@/lib/auth-validation';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { AppFooter } from '@/components/layout/AppFooter';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [recommendationCode, setRecommendationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Client-side DepEd email restriction check
    const cleanEmail = email.trim();
    if (!isValidDepEdEmail(cleanEmail)) {
      setError(getRegistrationErrorMessage());
      return;
    }

    setLoading(true);

    try {
      // 2. Call server-side API for secure registration
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password,
          displayName: displayName.trim(),
          recommendationCode: recommendationCode.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create account');
      }

      setSuccess(true);
    } catch (err: any) {
      setError(friendlyError(err, 'Failed to create account'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-slate-50 px-4 py-8 dark:bg-gray-950 sm:px-6 sm:py-12 lg:px-8">
      <div className="flex w-full flex-1 items-center justify-center">
      <section className="w-full max-w-md space-y-7 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-9">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-blue-700 font-bold text-white text-lg">
            KIT
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            Teacher Registration
          </h2>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Assessment &amp; Academic Analytics
          </p>
        </div>

        {/* Success Alert */}
        {success ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              Registration Submitted!
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Your account has been created with <strong className="text-amber-600 dark:text-amber-400">PENDING</strong> status. An administrator must approve your faculty access before you can log in.
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800"
              >
                <span>Return to Login</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Error Alert */}
            {error && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Registration Form */}
            <form className="mt-6 space-y-4" onSubmit={handleRegister}>
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Full Name / Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Official DepEd Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@deped.gov.ph"
                  className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
                <span className="mt-1 block text-[11px] text-gray-400 dark:text-gray-500">
                  Must be an official account ending in <strong className="text-blue-600 dark:text-blue-400 font-semibold">@deped.gov.ph</strong>
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                    className="block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-11 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 dark:focus:bg-gray-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Recommendation / School Invite Code (Optional)
                </label>
                <input
                  type="text"
                  value={recommendationCode}
                  onChange={(e) => setRecommendationCode(e.target.value)}
                  placeholder="e.g. CSHS-2026-TEACH"
                  className="mt-1.5 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Registering...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Faculty Registration</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center text-xs text-gray-500 dark:text-gray-400">
              Already registered?{' '}
              <Link
                href="/login"
                className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Sign in here
              </Link>
            </div>
          </>
        )}
      </section>
      </div>
      <AppFooter />
    </main>
  );
}
