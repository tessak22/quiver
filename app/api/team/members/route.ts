/**
 * POST /api/team/members — Admin-only direct team member creation.
 *
 * Used when Supabase email delivery isn't configured (the invite flow
 * requires a working email to deliver the magic link). The admin picks
 * email/name/role; the server creates a Supabase Auth user with a
 * generated password and the matching Neon row, then returns the password
 * in the response body exactly once so the admin can share it via a
 * secure channel (e.g. 1Password).
 *
 * Auth: requireRole('admin'). Non-admins get 401.
 * Body:  { email: string, name: string, role?: 'admin'|'member'|'viewer' }
 * 200 body: { userId, email, name, role, password }
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { TEAM_ROLES, type TeamRole } from '@/types';
import { createTeamMember, TeamMemberAlreadyExistsError } from '@/lib/team-create';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const auth = await requireRole('admin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const { email, name, role = 'member' } = parsed.data as {
    email?: unknown;
    name?: unknown;
    role?: unknown;
  };

  if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  if (typeof role !== 'string' || !TEAM_ROLES.includes(role as TeamRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  try {
    const result = await createTeamMember({
      email,
      name,
      role: role as TeamRole,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error('[team/members] create failed', { email, role, error: err });

    if (err instanceof TeamMemberAlreadyExistsError) {
      // Sanitized message — do not leak internal error text to the client
      // on a dupe. `email` is already from the request, so safe to echo.
      return NextResponse.json(
        { error: `A team member with email ${email} already exists` },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create team member') },
      { status: 500 },
    );
  }
}
