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
 *   - The emptiness check is server-side on every call. A second request after
 *     the first account exists is refused even if the client still thinks the
 *     door is open.
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

/** The install has not been claimed yet when there are no team members. */
async function bootstrapAvailable(): Promise<boolean> {
  return (await prisma.teamMember.count()) === 0;
}

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
    if (!(await bootstrapAvailable())) {
      return NextResponse.json(
        { error: 'This Quiver already has an account. Ask an admin to invite you.' },
        { status: 403 }
      );
    }

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

    const admin = getSupabaseAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
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
