import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import {
  getAdminCount,
  getTeamMember,
  updateTeamMemberRole,
  deleteTeamMember,
} from '@/lib/db/team';
import { TEAM_ROLES, type TeamRole } from '@/types';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('admin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const { role } = parsed.data;

  if (!TEAM_ROLES.includes(role as TeamRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const validRole = role as TeamRole;

  try {
    // Prevent demoting the last admin
    if (params.id === auth.id && validRole !== 'admin') {
      const adminCount = await getAdminCount();
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the last admin' },
          { status: 400 }
        );
      }
    }

    const member = await updateTeamMemberRole(params.id, validRole);

    return NextResponse.json({ member });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update team member role') },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('admin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Can't remove yourself if you're the last admin
    const target = await getTeamMember(params.id);

    if (target?.role === 'admin') {
      const adminCount = await getAdminCount();
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last admin' },
          { status: 400 }
        );
      }
    }

    await deleteTeamMember(params.id);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to remove team member') },
      { status: 500 }
    );
  }
}
