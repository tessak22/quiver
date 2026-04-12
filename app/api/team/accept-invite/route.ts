import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth';
import { parseJsonBody } from '@/lib/utils';
import {
  getTeamMember,
  getTeamMemberCount,
  createTeamMember,
} from '@/lib/db/team';
import type { TeamRole } from '@/types';

export async function POST(request: Request) {
  const auth = await getAuthUser();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!auth.email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const { name } = parsed.data;

  if (!name || typeof name !== 'string' || (name as string).trim().length === 0) {
    return NextResponse.json(
      { error: 'Name is required' },
      { status: 400 }
    );
  }

  // Check if team member already exists
  const existing = await getTeamMember(auth.id);

  if (existing) {
    return NextResponse.json({ member: existing });
  }

  // Determine role: first user is admin, subsequent users must have a valid invite
  const memberCount = await getTeamMemberCount();

  // Access the full Supabase user for invite metadata
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: TeamRole;
  if (memberCount === 0) {
    // First user becomes admin (onboarding flow)
    role = 'admin';
  } else {
    // Verify this user was actually invited via Supabase inviteUserByEmail.
    // Supabase exposes invited_at as a top-level field on the user object.
    const invitedAt = user?.invited_at;
    if (!invitedAt) {
      return NextResponse.json(
        { error: 'No valid invite found. Ask a team admin for an invite.' },
        { status: 403 }
      );
    }

    // Read role from Supabase invite metadata (set during inviteUserByEmail)
    const invitedRole = user?.user_metadata?.role;
    role = (invitedRole === 'admin' || invitedRole === 'viewer') ? invitedRole : 'member';
  }

  const member = await createTeamMember({
    id: auth.id,
    name: (name as string).trim(),
    email: auth.email,
    role,
  });

  return NextResponse.json({ member });
}
