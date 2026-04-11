import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getTeamMember,
  getAdminCount,
  updateTeamMemberRole,
  deleteTeamMember,
} from '@/lib/db/team';
import { TEAM_ROLES } from '@/types';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const requester = await getTeamMember(user.id);

  if (!requester || requester.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { role } = body;

  if (!TEAM_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Prevent demoting the last admin
  if (params.id === user.id && role !== 'admin') {
    const adminCount = await getAdminCount();
    if (adminCount <= 1) {
      return NextResponse.json(
        { error: 'Cannot demote the last admin' },
        { status: 400 }
      );
    }
  }

  const member = await updateTeamMemberRole(params.id, role);

  return NextResponse.json({ member });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const requester = await getTeamMember(user.id);

  if (!requester || requester.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

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
}
