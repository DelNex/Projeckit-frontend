import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { getValidatedFrontendEnv } from '@/lib/env';

interface CookieToSet {
  name: string;
  value: string;
  options?: any;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const env = getValidatedFrontendEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh auth token
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register');
  // Keep every authenticated application route in one explicit list. In
  // particular, TOS and Print & Reports contain school data just like the
  // assessment pages and must not be reachable without a session.
  const protectedRoots = [
    '/dashboard', '/assessments', '/students', '/analytics', '/settings',
    '/admin', '/app-hub', '/tos', '/reports',
  ];
  const isProtectedRoute = protectedRoots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`)
  );

  // If user is not authenticated and trying to access protected routes
  if (!user && isProtectedRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // If user is authenticated and trying to access login/register
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
