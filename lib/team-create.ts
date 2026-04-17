/**
 * Team-member creation helper — lib/team-create.ts
 *
 * What it does: Provisions a new team member end-to-end when Supabase email
 *   delivery isn't configured. Creates a Supabase Auth user with a random
 *   password (email_confirm pre-set, so no confirmation link is needed) and
 *   inserts a matching row in Neon's `team_members`. Returns the generated
 *   password so the admin can hand it over out-of-band (e.g. 1Password).
 *
 * What it reads from: Supabase Auth, Neon `team_members` (via Prisma).
 * What it produces: one auth.users row and one team_members row, both
 *   keyed on the same UUID.
 *
 * Edge cases:
 *   - If the Supabase create succeeds but the Neon insert fails, the
 *     Supabase user is rolled back so we don't leave a dangling auth user
 *     that can log in but has no membership row.
 *   - The caller is responsible for role validation; this helper accepts
 *     any string and persists it as-is.
 */

import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { getSupabaseAdminClient } from '@/lib/env';
import type { TeamRole } from '@/types';

export interface CreateTeamMemberResult {
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
  password: string;
}

function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

export async function createTeamMember(params: {
  email: string;
  name: string;
  role: TeamRole;
}): Promise<CreateTeamMemberResult> {
  const email = params.email.trim().toLowerCase();
  const name = params.name.trim();
  const role = params.role;
  const password = generatePassword();

  const admin = getSupabaseAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });
  if (error || !data.user) {
    throw new Error(`Auth user creation failed: ${error?.message ?? 'no user returned'}`);
  }
  const userId = data.user.id;

  try {
    await prisma.teamMember.upsert({
      where: { id: userId },
      update: { name, email, role },
      create: { id: userId, name, email, role },
    });
  } catch (err) {
    // Roll back the Supabase user so we don't leave a dangling auth account
    // that can log in but has no team_members row (which would send them
    // straight to /access-denied with no way to resolve it from the admin UI).
    try {
      await admin.auth.admin.deleteUser(userId);
    } catch (rollbackErr) {
      console.error('[createTeamMember] rollback of Supabase user failed', {
        userId,
        rollbackErr,
      });
    }
    throw err;
  }

  return { userId, email, name, role, password };
}
