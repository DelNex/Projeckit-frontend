import { SupabaseClient } from '@supabase/supabase-js';

export interface TenantContext {
  tenantId: string;
  configId: string;
}

export async function getTenantContext(supabase: SupabaseClient<any, any, any>): Promise<TenantContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('You must be signed in to perform this action.');
  }

  const { data: profile, error: profileErr } = await (supabase as any)
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr || !profile?.tenant_id) {
    throw new Error('Your account is not linked to a school yet.');
  }

  const { data: config, error: configErr } = await (supabase as any)
    .from('academic_configs')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .limit(1)
    .maybeSingle();

  if (configErr || !config?.id) {
    throw new Error('Your account is not linked to a school yet.');
  }

  return {
    tenantId: profile.tenant_id,
    configId: config.id,
  };
}
