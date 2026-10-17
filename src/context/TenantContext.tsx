'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface TenantContextValue {
  tenantId: string | null;
  tenantName: string;
  tenantCode: string | null;
  region: string;
  division: string;
  logoData: string;
  configId: string | null;
  schoolYear: string;
  term: string;
  userDisplayName: string;
  userRole: string;
  userEmail: string;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>('');
  const [tenantCode, setTenantCode] = useState<string | null>(null);
  const [region, setRegion] = useState<string>('');
  const [division, setDivision] = useState<string>('');
  const [logoData, setLogoData] = useState<string>('');
  const [configId, setConfigId] = useState<string | null>(null);
  const [schoolYear, setSchoolYear] = useState<string>('');
  const [term, setTerm] = useState<string>('');
  const [userDisplayName, setUserDisplayName] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('teacher');
  const [userEmail, setUserEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const loadTenant = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) {
        setTenantId(null);
        setTenantName('');
        setTenantCode(null);
        setConfigId(null);
        setSchoolYear('');
        setTerm('');
        setUserDisplayName('');
        setUserRole('teacher');
        setUserEmail('');
        return;
      }

      setUserEmail(user.email || '');

      // 1. Fetch user profile
      const { data: profile, error: profErr } = await (supabase as any)
        .from('profiles')
        .select('id, tenant_id, display_name, role, status')
        .eq('id', user.id)
        .maybeSingle();

      if (profErr) {
        throw profErr;
      }

      const displayName = profile?.display_name || user.email?.split('@')[0] || 'Teacher';
      setUserDisplayName(displayName);
      setUserRole(profile?.role || 'teacher');

      if (!profile?.tenant_id) {
        setTenantId(null);
        setTenantName('');
        setTenantCode(null);
        setConfigId(null);
        return;
      }

      const currentTenantId = profile.tenant_id;
      setTenantId(currentTenantId);

      // 2. Fetch tenant record
      const { data: tenant, error: tenantErr } = await (supabase as any)
        .from('tenants')
        .select('id, name, code, region, division, logo_data')
        .eq('id', currentTenantId)
        .maybeSingle();

      if (tenantErr) {
        console.warn('Failed to load tenant details:', tenantErr);
      } else if (tenant) {
        setTenantName(tenant.name || '');
        setTenantCode(tenant.code || null);
        setRegion(tenant.region || '');
        setDivision(tenant.division || '');
        setLogoData(tenant.logo_data || '');
      }

      // 3. Fetch active academic config
      const { data: config, error: configErr } = await (supabase as any)
        .from('academic_configs')
        .select('id, school_year, term, region, division, logo_data')
        .eq('tenant_id', currentTenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (configErr) {
        console.warn('Failed to load active academic config:', configErr);
      } else if (config) {
        setConfigId(config.id);
        setSchoolYear(config.school_year || '');
        setTerm(config.term || '');
        if (!tenant?.region && config.region) setRegion(config.region);
        if (!tenant?.division && config.division) setDivision(config.division);
        if (!tenant?.logo_data && config.logo_data) setLogoData(config.logo_data);
      }
    } catch (err: any) {
      console.error('[TenantContext] Error loading school context:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadTenant();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadTenant();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadTenant, supabase]);

  const value = useMemo<TenantContextValue>(() => ({
    tenantId,
    tenantName,
    tenantCode,
    region,
    division,
    logoData,
    configId,
    schoolYear,
    term,
    userDisplayName,
    userRole,
    userEmail,
    isLoading,
    error,
    refetch: loadTenant,
  }), [
    tenantId,
    tenantName,
    tenantCode,
    region,
    division,
    logoData,
    configId,
    schoolYear,
    term,
    userDisplayName,
    userRole,
    userEmail,
    isLoading,
    error,
    loadTenant,
  ]);

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    return {
      tenantId: null,
      tenantName: '',
      tenantCode: null,
      region: '',
      division: '',
      logoData: '',
      configId: null,
      schoolYear: '',
      term: '',
      userDisplayName: '',
      userRole: 'teacher',
      userEmail: '',
      isLoading: false,
      error: null,
      refetch: async () => {},
    };
  }
  return ctx;
}

