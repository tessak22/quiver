import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getTeamMember,
  getTeamMemberCount,
  createTeamMember,
} from '@/lib/db/team';
import type { TeamRole } from '@/types';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { name } = body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json(
      { error: 'Name is required' },
      { status: 400 }
    );
  }

  // Check if team member already exists
  const existing = await getTeamMember(user.id);

  if (existing) {
    return NextResponse.json({ member: existing });
  }

  // Determine role: first user is admin, subsequent users must have a valid invite
  const memberCount = await getTeamMemberCount();
  let role: TeamRole;
  if (memberCount === 0) {
    // First user becomes admin (onboarding flow)
    role = 'admin';
  } else {
    // Verify this user was actually invited via Supabase inviteUserByEmail.
    // Supabase exposes invited_at as a top-level field on the user object.
    const invitedAt = user.invited_at;
    if (!invitedAt) {
      return NextResponse.json(
        { error: 'No valid invite found. Ask a team admin for an invite.' },
        { status: 403 }
      );
    }

    // Read role from Supabase invite metadata (set during inviteUserByEmail)
    const invitedRole = user.user_metadata?.role;
    role = (invitedRole === 'admin' || invitedRole === 'viewer') ? invitedRole : 'member';
  }

  const member = await createTeamMember({
    id: user.id,
    name: name.trim(),
    email: user.email!,
    role,
  });

  return NextResponse.json({ member });
}
