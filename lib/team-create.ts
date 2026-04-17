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
import { Prisma } from '@prisma/client';
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

/**
 * Thrown when the requested email collides with an existing account —
 * either in Supabase Auth (auth.users.email) or in Neon (team_members.email).
 * Callers should translate this to a 409 with a safe, user-facing message
 * instead of exposing the underlying Prisma/Supabase error text.
 */
export class TeamMemberAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`A team member with email ${email} already exists`);
    this.name = 'TeamMemberAlreadyExistsError';
  }
}

function isSupabaseDuplicateEmailError(err: {
  status?: number;
  message?: string;
} | null): boolean {
  if (!err) return false;
  // Supabase returns 422 "User already registered" for email collisions via
  // the admin createUser API.
  if (err.status === 422) return true;
  return /already (been )?registered/i.test(err.message ?? '');
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
    if (isSupabaseDuplicateEmailError(error)) {
      throw new TeamMemberAlreadyExistsError(email);
    }
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
    // Unique-email collision at the DB layer (team_members.email @unique)
    // surfaces as Prisma P2002. Translate to the typed error so the route
    // can return a safe 409 instead of leaking internal SQL details.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new TeamMemberAlreadyExistsError(email);
    }
    throw err;
  }

  return { userId, email, name, role, password };
}
