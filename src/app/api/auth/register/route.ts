import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DEPED_REGISTRATION_ERROR_MESSAGE,
  isValidDepEdEmail,
} from '@/lib/auth-validation';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, displayName, recommendationCode } = body;

    // 1. Strict Server-Side DepEd Email Restriction
    if (!isValidDepEdEmail(email)) {
      return NextResponse.json(
        { error: DEPED_REGISTRATION_ERROR_MESSAGE },
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
    if (data.user && recommendationCode && typeof recommendationCode === 'string' && recommendationCode.trim()) {
      try {
        const adminClient = createAdminClient();
        const cleanCode = recommendationCode.trim();
        const { data: matchedTenant } = await adminClient
          .from('tenants')
          .select('id')
          .ilike('code', cleanCode)
          .maybeSingle();

        if (matchedTenant?.id) {
          await adminClient
            .from('profiles')
            .update({ tenant_id: matchedTenant.id })
            .eq('id', data.user.id);
        }
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
