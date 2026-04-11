import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_ROUTES = ['/login', '/invite', '/shared'];

// Routes that require auth but NOT team membership (pre-membership flows)
const MEMBERSHIP_EXEMPT_ROUTES = ['/setup', '/api/team/accept-invite', '/api/onboarding'];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Unauthenticated users can only access public routes
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Authenticated users on login page should go to dashboard
  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Verify team membership on all non-public, non-exempt routes.
  // Uses a short-lived cookie (5 min) to avoid hitting the DB on every request.
  // Removed users lose access within 5 minutes.
  const isMembershipExempt = MEMBERSHIP_EXEMPT_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (user && !isPublicRoute && !isMembershipExempt) {
    const membershipCached = request.cookies.get('quiver_member')?.value;

    if (!membershipCached) {
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('id', user.id)
        .limit(1)
        .single();

      if (!member) {
        // Authenticated but not a team member
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Not a team member' },
            { status: 403 }
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = '/setup';
        return NextResponse.redirect(url);
      }

      // Cache membership for 5 minutes to avoid DB query on every request
      supabaseResponse.cookies.set('quiver_member', 'true', {
        path: '/',
        maxAge: 60 * 5,
        httpOnly: true,
        sameSite: 'lax',
      });
    }
  }

  // Check if onboarding is complete (cookie set after onboarding)
  // If not complete and not on setup page, redirect to setup
  if (user && !isPublicRoute && !isMembershipExempt && pathname !== '/setup') {
    const onboardingComplete = request.cookies.get('quiver_onboarded')?.value;
    if (!onboardingComplete) {
      // Check DB only if cookie not set — this runs once per session
      const { data: activeContext } = await supabase
        .from('context_versions')
        .select('id')
        .eq('isActive', true)
        .limit(1)
        .single();

      if (!activeContext) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'Onboarding not complete' },
            { status: 403 }
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = '/setup';
        return NextResponse.redirect(url);
      }

      // Context exists — set cookie so we don't check again
      supabaseResponse.cookies.set('quiver_onboarded', 'true', {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 year
        httpOnly: true,
        sameSite: 'lax',
      });
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
