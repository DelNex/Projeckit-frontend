'use client';

import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canResendEmail, setCanResendEmail] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setCanResendEmail(false);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        throw authError;
      }

      if (data.user) {
        // Verify account profile status
        const { data: profile } = await supabase
          .from('profiles')
          .select('status, role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profile?.status === 'pending') {
          await supabase.auth.signOut();
          setError('Your account is currently PENDING administrator approval. Please wait for an administrator to activate your access.');
          return;
        }

        if (profile?.status === 'rejected' || profile?.status === 'suspended') {
          await supabase.auth.signOut();
          setError('Your account has been suspended or rejected. Please contact your school administrator.');
          return;
        }

        router.push('/dashboard');
        router.refresh();
      }
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('email not confirmed')) {
        setError(
          'Your email address is not confirmed yet. If your account has been approved, ask your administrator to confirm it, or resend the confirmation email.'
        );
        setCanResendEmail(true);
      } else if (msg.includes('invalid login credentials')) {
        setError('Invalid email address or password. Please verify your credentials and try again.');
      } else {
        setError(friendlyError(err, 'Invalid email or password. Please try again.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast.error('Please enter your email address to resend the confirmation.');
      return;
    }

    setResendingEmail(true);
    try {
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
      });

      if (resendErr) {
        toast.error(friendlyError(resendErr, 'Failed to resend confirmation email.'));
      } else {
        toast.success('Confirmation email sent! Please check your inbox.');
      }
    } catch (resendError: any) {
      toast.error(friendlyError(resendError, 'Failed to resend confirmation email.'));
    } finally {
      setResendingEmail(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-950 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-gray-200 bg-white p-8 shadow-xl dark:border-gray-800 dark:bg-gray-900 sm:p-10 paint-isolate">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 font-bold text-white shadow-md text-xl">
            KIT
          </div>
          <h2 className="mt-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            Welcome to Project KIT
          </h2>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            Capas Senior High School Assessment &amp; Academic Analytics
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5 text-xs font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1 space-y-2">
                <span>{error}</span>
                {canResendEmail && (
                  <div>
                    <button
                      type="button"
                      onClick={handleResendConfirmation}
                      disabled={resendingEmail}
                      className="inline-flex items-center gap-1.5 font-bold text-blue-600 underline hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50"
                    >
                      {resendingEmail && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Resend confirmation email
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sign In Form */}
        <form className="mt-6 space-y-4" onSubmit={handleLogin}>
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teacher@school.edu.ph"
              className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 dark:border-gray-800 dark:bg-gray-800 dark:text-white dark:focus:border-blue-500 dark:focus:bg-gray-800"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Password
              </label>
            </div>
            <div className="relative mt-1.5">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          Need an account?{' '}
          <Link
            href="/register"
            className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Register as a Teacher
          </Link>
        </div>
      </div>
    </div>
  );
}

