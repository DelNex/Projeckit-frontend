import { updateSession } from '@/lib/supabase/middleware';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // The scheduled worker has its own constant-time CRON_SECRET check and does
  // not use browser sessions. Avoid a redundant Supabase auth check on every tick.
  if (request.nextUrl.pathname === '/api/internal/exam-worker') {
    return NextResponse.next({ request });
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

