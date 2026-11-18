import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // The OMR validation page and its fixture endpoint are development-only.
  // Let CI exercise the scanner without requiring live Supabase credentials
  // or making network calls to the authentication service.
  if (
    process.env.NODE_ENV === 'development' &&
    (request.nextUrl.pathname === '/omr-validation' ||
      request.nextUrl.pathname === '/api/omr-validation-fixture')
  ) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (public images)
     */
    '/((?!_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
