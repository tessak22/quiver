/**
 * Auth Helpers — lib/auth.ts
 *
 * What it does: Provides shared authentication and authorization helpers
 *   for API routes. Replaces the inline auth pattern that was duplicated
 *   across 38 route files.
 *
 * What it reads from: Supabase auth session, team_members table.
 *
 * What it produces:
 *   - getAuthUser(): authenticated Supabase user or null
 *   - requireRole(): authenticated user + team member with minimum role, or null
 *
 * Edge cases:
 *   - Role hierarchy: admin > member > viewer
 *   - requireRole checks both auth AND team membership AND minimum role
 */

import { createClient } from '@/lib/supabase/server';
import { getTeamMember } from '@/lib/db/team';
import type { TeamRole } from '@/types';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface AuthorizedUser extends AuthenticatedUser {
  role: TeamRole;
}

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
};

/**
 * Get the authenticated Supabase user from the current request.
 * Returns null if not authenticated. Does NOT check team membership.
 * Use this for routes that need auth but not role checks (e.g., accept-invite).
 */
export async function getAuthUser(): Promise<AuthenticatedUser | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? '',
  };
}

/**
 * Verify that the request comes from an authenticated team member
 * with at least the specified role.
 *
 * Role hierarchy: viewer < member < admin
 *   - requireRole('viewer')  → any team member
 *   - requireRole('member')  → members and admins
 *   - requireRole('admin')   → admins only
 *
 * Returns null if not authenticated, not a team member, or insufficient role.
 */
export async function requireRole(minRole: TeamRole = 'viewer'): Promise<AuthorizedUser | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const member = await getTeamMember(user.id);
  if (!member) return null;

  const userLevel = ROLE_HIERARCHY[member.role as TeamRole] ?? -1;
  const requiredLevel = ROLE_HIERARCHY[minRole];

  if (userLevel < requiredLevel) return null;

  return {
    id: user.id,
    email: user.email,
    role: member.role as TeamRole,
  };
}
