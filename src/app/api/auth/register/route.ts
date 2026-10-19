import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPublicRegistrationAllowed } from '@/lib/server/school-settings';
import {
  DEPED_REGISTRATION_ERROR_MESSAGE,
  getRegistrationErrorMessage,
  isValidDepEdEmail,
} from '@/lib/auth-validation';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, displayName, recommendationCode } = body;

    // 1. Strict Server-Side DepEd Email Restriction
    if (!isValidDepEdEmail(email)) {
      return NextResponse.json(
        { error: getRegistrationErrorMessage() },
        { status: 400 }
      );
    }

    // 2. Validate Password
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters in length.' },
        { status: 400 }
      );
    }

    // 3. Validate Display Name
    if (!displayName || typeof displayName !== 'string' || !displayName.trim()) {
      return NextResponse.json(
        { error: 'Full Name / Display Name is required.' },
        { status: 400 }
      );
    }

    let matchedTenantId: string | null = null;
    if (recommendationCode && typeof recommendationCode === 'string' && recommendationCode.trim()) {
      const adminClient = createAdminClient();
      const { data: matchedTenant, error: tenantLookupError } = await adminClient
        .from('tenants').select('id').eq('code', recommendationCode.trim()).maybeSingle();
      if (tenantLookupError) {
        return NextResponse.json({ error: 'Could not verify the school code. Please try again.' }, { status: 503 });
      }
      if (matchedTenant?.id) {
        matchedTenantId = matchedTenant.id;
        const { data: schoolSettings, error: settingsError } = await adminClient
          .from('school_settings').select('allow_public_registration')
          .eq('tenant_id', matchedTenantId).maybeSingle();
        if (settingsError) {
          return NextResponse.json({ error: 'Could not verify the school registration settings. Please try again.' }, { status: 503 });
        }
        if (!isPublicRegistrationAllowed(schoolSettings?.allow_public_registration)) {
          return NextResponse.json({ error: 'Public registration is turned off for this school. Contact your school administrator.' }, { status: 403 });
        }
      }
    }

    // 4. Create User in Supabase Auth
    // Note: Never pass role or status in metadata (closed sign-up hole)
    const supabase = await createClient();
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: displayName.trim(),
        },
      },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    // 5. Look up school tenant if recommendation / school code is provided
    if (data.user && matchedTenantId) {
      try {
        const adminClient = createAdminClient();
        await adminClient.from('profiles').update({ tenant_id: matchedTenantId }).eq('id', data.user.id);
      } catch (tenantLookupErr) {
        console.error('Failed to link school tenant during registration:', tenantLookupErr);
        // Do not fail registration; tenant_id remains null for admin review
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Registration submitted successfully with pending status.',
      user: data.user,
    });
  } catch (err: any) {
    console.error('Server-side registration error:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error during registration.' },
      { status: 500 }
    );
  }
}
