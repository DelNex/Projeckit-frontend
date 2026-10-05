import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
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
    const supabase = await createClient();
    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          display_name: displayName.trim(),
          role: 'teacher',
          status: 'pending',
          recommendation_code: (recommendationCode || '').trim(),
        },
      },
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
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
