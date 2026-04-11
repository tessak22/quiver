import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeamMemberRole } from '@/lib/db/team';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const member = await getTeamMemberRole(user.id);

  if (!member) {
    return NextResponse.json({ error: 'Not a team member' }, { status: 403 });
  }

  return NextResponse.json({ id: member.id, role: member.role });
}
