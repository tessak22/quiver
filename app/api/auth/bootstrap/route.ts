/**
 * First-run account bootstrap — app/api/auth/bootstrap/route.ts
 *
 * What it does: creates the very first account on a fresh self-hosted install,
 *   and only the first. Once any team member exists this endpoint is closed
 *   permanently.
 *
 * Why it exists: the login page only signs people in, and every other way to
 *   create a user — invites, admin team creation — requires an authenticated
 *   admin who does not exist yet. So a fresh fork deployed from the README's
 *   own Deploy button had no way in at all: you landed on /login with no
 *   credentials and no documented path to any, short of creating a user by
 *   hand in the Supabase dashboard.
 *
 * What it reads from: `team_members` (to decide whether the door is still
 *   open) and the Supabase admin API (to create the account).
 *
 * Edge cases:
 *   - GET answers whether bootstrap is available, so the login page can offer
 *     it without guessing. It reveals only that fact, never anything about
 *     existing users.
 *   - Availability is decided by whether any auth user exists, not by whether
 *     a team_members row does. The row is written later, during onboarding, so
 *     counting rows left a window where the account existed and the door still
 *     read as open — and it reopened for good if that row was ever deleted.
 *   - Concurrent requests are serialised with a Postgres advisory lock, so two
 *     callers cannot both pass the check and both create an account. Without
 *     it the check and the create were a read-modify-write with a gap.
 *   - The account is created confirmed, because there is no mail configured on
 *     a fresh install and an unconfirmed first admin cannot sign in.
 *   - It does NOT create the team_members row or make anyone an admin. That is
 *     onboarding's job, which already promotes the first authenticated user,
 *     and duplicating it here would put the same rule in two places.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSupabaseAdminClient } from '@/lib/env';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';

/**
 * Has anyone claimed this install yet?
 *
 * Asks Supabase for auth users rather than counting team_members: the row is
 * written during onboarding, after the account exists, so counting rows both
 * left a window open and reopened permanently if the row was later deleted.
 * One user is enough to close the door.
 */
async function bootstrapAvailable(): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    // Fail closed: an install that cannot be checked is not one to open.
    console.error('[auth/bootstrap] could not check for existing users', error.message);
    return false;
  }
  return data.users.length === 0;
}

/**
 * Arbitrary constant, shared by every caller of this route so they queue
 * behind each other. Held for the transaction, released when it ends.
 */
const BOOTSTRAP_LOCK_KEY = 8_273_461;

export async function GET() {
  try {
    return NextResponse.json({ available: await bootstrapAvailable() });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Could not check setup state') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request);
    if (parsed.error) return parsed.error;

    const body = parsed.data as { email?: unknown; password?: unknown };
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }
    if (password.length < 12) {
      return NextResponse.json(
        { error: 'Use a password of at least 12 characters' },
        { status: 400 }
      );
    }

    // Check and create inside one lock, so two simultaneous callers cannot both
    // find the install unclaimed and both create an account.
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`;

      if (!(await bootstrapAvailable())) return { taken: true as const };

      const admin = getSupabaseAdminClient();
      const { error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      return { taken: false as const, error };
    });

    if (outcome.taken) {
      return NextResponse.json(
        { error: 'This Quiver already has an account. Ask an admin to invite you.' },
        { status: 403 }
      );
    }

    const { error } = outcome;
    if (error) {
      console.error('[auth/bootstrap] could not create the first account', error.message);
      return NextResponse.json(
        { error: 'Could not create the account. Check SUPABASE_SERVICE_ROLE_KEY.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ created: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Could not create the account') },
      { status: 500 }
    );
  }
}
