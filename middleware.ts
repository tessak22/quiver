import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  PUBLIC_ROUTES,
  MEMBERSHIP_EXEMPT_ROUTES,
  ONBOARDING_EXEMPT_ROUTES,
  resolveRoute,
  type RoutingDecision,
} from '@/lib/middleware-routing';

function applyDecision(
  decision: RoutingDecision,
  request: NextRequest,
  supabaseResponse: NextResponse
): NextResponse {
  switch (decision.action) {
    case 'redirect': {
      const url = request.nextUrl.clone();
      url.pathname = decision.to;
      return NextResponse.redirect(url);
    }
    case 'json-error':
      return NextResponse.json(
        { error: decision.error },
        { status: decision.status }
      );
    case 'pass':
      return supabaseResponse;
  }
}

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
  const isShareApi = pathname.match(/^\/api\/sessions\/[^/]+\/share/) !== null;
  const isMembershipExempt = MEMBERSHIP_EXEMPT_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isOnboardingExempt = ONBOARDING_EXEMPT_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // ---------------------------------------------------------------------------
  // Gather data — only query the DB when the route requires it
  // ---------------------------------------------------------------------------

  let isMember = false;
  let membershipCached = false;

  if (user && !isPublicRoute && !isMembershipExempt && !isShareApi) {
    const cachedValue = request.cookies.get('quiver_member')?.value;
    if (cachedValue === user.id) {
      membershipCached = true;
    } else {
      const { data: member } = await supabase
        .from('team_members')
        .select('id')
        .eq('id', user.id)
        .limit(1)
        .single();
      isMember = !!member;
    }
  }

  // Context query — needed for non-member redirect and onboarding gate.
  // Uses maybeSingle() so zero rows returns null/null (not an error).
  let activeContextExists = false;
  let contextQueryFailed = false;

  const needsContextCheck =
    user &&
    !isPublicRoute &&
    !isShareApi &&
    ((!isMembershipExempt && !isMember && !membershipCached) ||
     (!isOnboardingExempt && !request.cookies.get('quiver_onboarded')?.value));

  if (needsContextCheck) {
    const { data: activeContext, error: contextError } = await supabase
      .from('context_versions')
      .select('id')
      .eq('isActive', true)
      .limit(1)
      .maybeSingle();
    activeContextExists = !!activeContext;
    contextQueryFailed = !!contextError;
  }

  const onboardingComplete = !!request.cookies.get('quiver_onboarded')?.value;

  // ---------------------------------------------------------------------------
  // Route decision — single code path shared with tests
  // ---------------------------------------------------------------------------

  const decision = resolveRoute({
    pathname,
    user: user ? { id: user.id } : null,
    isMember,
    membershipCached,
    onboardingComplete,
    activeContextExists,
    contextQueryFailed,
  });

  if (decision.action !== 'pass') {
    return applyDecision(decision, request, supabaseResponse);
  }

  // ---------------------------------------------------------------------------
  // Side effects — only on pass-through (cookies for caching)
  // ---------------------------------------------------------------------------

  // Cache membership for 5 minutes to avoid DB query on every request
  if (user && isMember && !membershipCached) {
    supabaseResponse.cookies.set('quiver_member', user.id, {
      path: '/',
      maxAge: 60 * 5,
      httpOnly: true,
      sameSite: 'lax',
    });
  }

  // Only set the cookie when context was confirmed to exist — not on
  // query error, which would falsely mark onboarding complete for 1 year.
  if (user && !onboardingComplete && activeContextExists) {
    supabaseResponse.cookies.set('quiver_onboarded', 'true', {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      httpOnly: true,
      sameSite: 'lax',
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
