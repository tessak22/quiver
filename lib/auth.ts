/**
 * Auth Helpers — lib/auth.ts
 *
 * What it does: Provides shared authentication and authorization helpers
 *   for API routes. Verifies both Supabase auth AND team membership.
 *
 * What it reads from: Supabase auth session, team_members table.
 *
 * What it produces: Authenticated user + team member data, or null if
 *   the user is not authenticated or not a team member.
 */

import { createClient } from '@/lib/supabase/server';
import { getTeamMember } from '@/lib/db/team';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

/**
 * Verify that the request comes from an authenticated team member.
 * Returns the user info if valid, null otherwise.
 *
 * API routes that only need auth (no membership) should use this sparingly —
 * most routes should require team membership.
 */
export async function requireAuth(): Promise<AuthenticatedUser | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const member = await getTeamMember(user.id);
  if (!member) return null;

  return {
    id: user.id,
    email: user.email ?? '',
    role: member.role,
  };
}
