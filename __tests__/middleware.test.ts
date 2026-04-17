/**
 * Tests for lib/middleware-routing.ts — Route-gating logic
 *
 * Tests the shared resolveRoute() function that both middleware.ts and these
 * tests import. This covers the key scenarios from issue #53: ensuring
 * authenticated non-members are never trapped in a dead-end loop, can always
 * log out, and are routed to the right page based on workspace state.
 */

import { describe, it, expect } from 'vitest';
import {
  PUBLIC_ROUTES,
  MEMBERSHIP_EXEMPT_ROUTES,
  ONBOARDING_EXEMPT_ROUTES,
  matchesRoute,
  resolveRoute,
  type RoutingContext,
} from '@/lib/middleware-routing';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchesRoute helper (boundary-safe prefix matching)', () => {
  it('matches exact path', () => {
    expect(matchesRoute('/api/mcp', '/api/mcp')).toBe(true);
  });

  it('matches subpath with / boundary', () => {
    expect(matchesRoute('/api/mcp/stream', '/api/mcp')).toBe(true);
  });

  it('does NOT match sibling with shared prefix', () => {
    expect(matchesRoute('/api/mcp-admin', '/api/mcp')).toBe(false);
    expect(matchesRoute('/loginfoo', '/login')).toBe(false);
  });

  it('does NOT match unrelated paths', () => {
    expect(matchesRoute('/dashboard', '/api/mcp')).toBe(false);
  });
});

describe('Route classification', () => {
  it('/api/auth/logout is membership-exempt', () => {
    expect(
      MEMBERSHIP_EXEMPT_ROUTES.some((r) => '/api/auth/logout'.startsWith(r))
    ).toBe(true);
  });

  it('/access-denied is membership-exempt', () => {
    expect(
      MEMBERSHIP_EXEMPT_ROUTES.some((r) => '/access-denied'.startsWith(r))
    ).toBe(true);
  });

  it('/login is a public route', () => {
    expect(
      PUBLIC_ROUTES.some((r) => '/login'.startsWith(r))
    ).toBe(true);
  });

  it('/api/mcp is a public route (enforces its own Bearer auth)', () => {
    expect(
      PUBLIC_ROUTES.some((r) => '/api/mcp'.startsWith(r))
    ).toBe(true);
  });

  it('/access-denied is NOT onboarding-exempt', () => {
    expect(
      ONBOARDING_EXEMPT_ROUTES.some((r) => '/access-denied'.startsWith(r))
    ).toBe(false);
  });

  it('/api/auth/logout IS onboarding-exempt', () => {
    expect(
      ONBOARDING_EXEMPT_ROUTES.some((r) => '/api/auth/logout'.startsWith(r))
    ).toBe(true);
  });

  it('/dashboard is not public or membership-exempt', () => {
    expect(
      PUBLIC_ROUTES.some((r) => '/dashboard'.startsWith(r))
    ).toBe(false);
    expect(
      MEMBERSHIP_EXEMPT_ROUTES.some((r) => '/dashboard'.startsWith(r))
    ).toBe(false);
  });
});

describe('Unauthenticated users', () => {
  it('redirects to /login for protected routes', () => {
    const result = resolveRoute({
      pathname: '/dashboard',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/login' });
  });

  it('allows access to public routes', () => {
    const result = resolveRoute({
      pathname: '/login',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows access to share API', () => {
    const result = resolveRoute({
      pathname: '/api/sessions/abc123/share',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows access to /api/mcp (MCP handler enforces its own Bearer auth)', () => {
    const result = resolveRoute({
      pathname: '/api/mcp',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows access to /api/mcp subpaths', () => {
    const result = resolveRoute({
      pathname: '/api/mcp/stream',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'pass' });
  });

  // Prefix-match boundary: a sibling route like /api/mcp-admin must NOT be
  // treated as public just because its path starts with "/api/mcp".
  it('does NOT treat /api/mcp-admin as public (boundary-safe matching)', () => {
    const result = resolveRoute({
      pathname: '/api/mcp-admin',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/login' });
  });

  it('does NOT treat /loginfoo as public (boundary-safe matching)', () => {
    const result = resolveRoute({
      pathname: '/loginfoo',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/login' });
  });
});

describe('Authenticated non-member (issue #53 lockout)', () => {
  const nonMemberBase: RoutingContext = {
    pathname: '/dashboard',
    user: { id: 'user-1' },
    isMember: false,
    membershipCached: false,
    onboardingComplete: false,
    activeContextExists: true,
    contextQueryFailed: false,
  };

  it('redirects to /access-denied when context exists (not /setup dead-end)', () => {
    const result = resolveRoute(nonMemberBase);
    expect(result).toEqual({ action: 'redirect', to: '/access-denied' });
  });

  it('redirects to /setup when no context exists (first-run onboarding)', () => {
    const result = resolveRoute({
      ...nonMemberBase,
      activeContextExists: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/setup' });
  });

  it('can access /api/auth/logout (membership-exempt)', () => {
    const result = resolveRoute({
      ...nonMemberBase,
      pathname: '/api/auth/logout',
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('can access /access-denied page (membership-exempt)', () => {
    const result = resolveRoute({
      ...nonMemberBase,
      pathname: '/access-denied',
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('redirects to /access-denied when context query fails (safe default)', () => {
    const result = resolveRoute({
      ...nonMemberBase,
      activeContextExists: false,
      contextQueryFailed: true,
    });
    expect(result).toEqual({ action: 'redirect', to: '/access-denied' });
  });

  it('returns 403 JSON for non-exempt API routes', () => {
    const result = resolveRoute({
      ...nonMemberBase,
      pathname: '/api/sessions',
    });
    expect(result).toEqual({
      action: 'json-error',
      error: 'Not a team member',
      status: 403,
    });
  });
});

describe('Authenticated member', () => {
  it('allows access to dashboard when onboarding is complete', () => {
    const result = resolveRoute({
      pathname: '/dashboard',
      user: { id: 'user-1' },
      isMember: true,
      membershipCached: false,
      onboardingComplete: true,
      activeContextExists: true,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('allows access when membership is cached', () => {
    const result = resolveRoute({
      pathname: '/dashboard',
      user: { id: 'user-1' },
      isMember: false,
      membershipCached: true,
      onboardingComplete: true,
      activeContextExists: true,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('redirects to /setup when onboarding is not complete and no context', () => {
    const result = resolveRoute({
      pathname: '/dashboard',
      user: { id: 'user-1' },
      isMember: true,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/setup' });
  });

  it('redirects authenticated user away from /login to /dashboard', () => {
    const result = resolveRoute({
      pathname: '/login',
      user: { id: 'user-1' },
      isMember: true,
      membershipCached: false,
      onboardingComplete: true,
      activeContextExists: true,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/dashboard' });
  });
});

describe('Onboarding gate edge cases', () => {
  it('passes through when member has no onboarding cookie but context exists', () => {
    const result = resolveRoute({
      pathname: '/dashboard',
      user: { id: 'user-1' },
      isMember: true,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: true,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('returns 403 JSON for API routes when onboarding is incomplete', () => {
    const result = resolveRoute({
      pathname: '/api/sessions',
      user: { id: 'user-1' },
      isMember: true,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({
      action: 'json-error',
      error: 'Onboarding not complete',
      status: 403,
    });
  });

  it('onboarding gate falls through on context query failure (no dead-end redirect)', () => {
    const result = resolveRoute({
      pathname: '/dashboard',
      user: { id: 'user-1' },
      isMember: true,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: true,
    });
    expect(result).toEqual({ action: 'pass' });
  });

  it('/access-denied is subject to onboarding gate (redirects to /setup when no context)', () => {
    const result = resolveRoute({
      pathname: '/access-denied',
      user: { id: 'user-1' },
      isMember: true,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/setup' });
  });

  it('non-member API routes return 403 regardless of context state', () => {
    const result = resolveRoute({
      pathname: '/api/sessions',
      user: { id: 'user-1' },
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({
      action: 'json-error',
      error: 'Not a team member',
      status: 403,
    });
  });
});

describe('Unauthenticated on exempt routes', () => {
  it('redirects to /login even for membership-exempt routes when not authenticated', () => {
    const result = resolveRoute({
      pathname: '/access-denied',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/login' });
  });

  it('redirects to /login for /setup when not authenticated', () => {
    const result = resolveRoute({
      pathname: '/setup',
      user: null,
      isMember: false,
      membershipCached: false,
      onboardingComplete: false,
      activeContextExists: false,
      contextQueryFailed: false,
    });
    expect(result).toEqual({ action: 'redirect', to: '/login' });
  });
});

describe('Membership-exempt routes', () => {
  const nonMember: Omit<RoutingContext, 'pathname'> = {
    user: { id: 'user-1' },
    isMember: false,
    membershipCached: false,
    onboardingComplete: false,
    activeContextExists: true,
    contextQueryFailed: false,
  };

  it('/setup is accessible without membership', () => {
    const result = resolveRoute({ ...nonMember, pathname: '/setup' });
    expect(result).toEqual({ action: 'pass' });
  });

  it('/api/team/accept-invite is accessible without membership', () => {
    const result = resolveRoute({ ...nonMember, pathname: '/api/team/accept-invite' });
    expect(result).toEqual({ action: 'pass' });
  });

  it('/api/onboarding/complete is accessible without membership', () => {
    const result = resolveRoute({ ...nonMember, pathname: '/api/onboarding/complete' });
    expect(result).toEqual({ action: 'pass' });
  });
});
