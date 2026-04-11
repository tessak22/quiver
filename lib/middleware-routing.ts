/**
 * Pure routing decision logic for Next.js middleware.
 *
 * Extracted so the middleware and tests share the same code path.
 * The middleware handles Supabase queries and cookies, then calls
 * resolveRoute() with the results. Tests call resolveRoute() directly.
 */

// ---------------------------------------------------------------------------
// Route lists
// ---------------------------------------------------------------------------

export const PUBLIC_ROUTES = ['/login', '/invite', '/shared', '/api/public'];

/** Routes that require auth but NOT team membership (pre-membership flows) */
export const MEMBERSHIP_EXEMPT_ROUTES = [
  '/setup',
  '/api/team/accept-invite',
  '/api/onboarding',
  '/api/auth/logout',
  '/access-denied',
];

/**
 * Routes that bypass the onboarding-complete gate. Subset of membership-exempt
 * routes — /access-denied is intentionally excluded so the onboarding gate
 * still covers it (only non-members are redirected there, so it's unreachable
 * before onboarding anyway). /api/auth/logout is included because users must
 * always be able to sign out.
 */
export const ONBOARDING_EXEMPT_ROUTES = [
  '/setup',
  '/api/team/accept-invite',
  '/api/onboarding',
  '/api/auth/logout',
];

// ---------------------------------------------------------------------------
// Routing context and decision types
// ---------------------------------------------------------------------------

export interface RoutingContext {
  pathname: string;
  user: { id: string } | null;
  isMember: boolean;
  membershipCached: boolean;
  onboardingComplete: boolean;
  activeContextExists: boolean;
  contextQueryFailed: boolean;
}

export type RoutingDecision =
  | { action: 'redirect'; to: string }
  | { action: 'json-error'; error: string; status: number }
  | { action: 'pass' };

// ---------------------------------------------------------------------------
// Pure routing function
// ---------------------------------------------------------------------------

export function resolveRoute(ctx: RoutingContext): RoutingDecision {
  const { pathname, user } = ctx;

  const isPublicRoute = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isShareApi = /^\/api\/sessions\/[^/]+\/share/.test(pathname);

  // Unauthenticated: only public routes and share API
  if (!user && !isPublicRoute && !isShareApi) {
    return { action: 'redirect', to: '/login' };
  }

  // Authenticated on login → dashboard
  if (user && pathname === '/login') {
    return { action: 'redirect', to: '/dashboard' };
  }

  const isMembershipExempt = MEMBERSHIP_EXEMPT_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  // Membership check for non-public, non-exempt, non-share routes
  if (user && !isPublicRoute && !isMembershipExempt && !isShareApi) {
    if (!ctx.membershipCached && !ctx.isMember) {
      if (pathname.startsWith('/api/')) {
        return { action: 'json-error', error: 'Not a team member', status: 403 };
      }
      // Default to /access-denied on query failure to avoid lockout path
      const safeDefault = ctx.activeContextExists || ctx.contextQueryFailed;
      return {
        action: 'redirect',
        to: safeDefault ? '/access-denied' : '/setup',
      };
    }
  }

  // Onboarding check — uses ONBOARDING_EXEMPT_ROUTES (not membership list)
  const isOnboardingExempt = ONBOARDING_EXEMPT_ROUTES.some((route) =>
    pathname.startsWith(route)
  );

  if (user && !isPublicRoute && !isOnboardingExempt && !isShareApi) {
    // On query failure, fall through rather than redirecting to /setup
    if (!ctx.onboardingComplete && !ctx.activeContextExists && !ctx.contextQueryFailed) {
      if (pathname.startsWith('/api/')) {
        return { action: 'json-error', error: 'Onboarding not complete', status: 403 };
      }
      return { action: 'redirect', to: '/setup' };
    }
  }

  return { action: 'pass' };
}
