import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/utils';
import { TEAM_ROLES, type TeamRole } from '@/types';
import { inviteTeamMemberByEmail } from '@/lib/invites';
import { safeErrorMessage } from '@/lib/utils';

export async function POST(request: Request) {
  const auth = await requireRole('admin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const { email, role = 'member' } = parsed.data;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  if (!TEAM_ROLES.includes(role as TeamRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  try {
    const invite = await inviteTeamMemberByEmail(email, role as TeamRole);

    if (!invite.success) {
      console.error('[team/invite] Invite failed', {
        email,
        role,
        error: invite.error,
      });
      return NextResponse.json(
        { error: invite.error ?? `Failed to invite ${email}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[team/invite] Unexpected invite failure', {
      email,
      role,
      error: err,
    });
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to send invite') },
      { status: 500 }
    );
  }
}
