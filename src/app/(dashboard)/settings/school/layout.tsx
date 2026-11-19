import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function SchoolSettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: claimsResult, error } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (error || !userId) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,status,archived_at,is_platform_admin')
    .eq('id', userId)
    .maybeSingle();

  if (!profile || (profile.role !== 'admin' && !profile.is_platform_admin) || profile.status !== 'approved' || profile.archived_at) {
    redirect('/dashboard');
  }

  return children;
}
