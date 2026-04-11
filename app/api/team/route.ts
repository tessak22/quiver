import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeamMembers } from '@/lib/db/team';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const members = await getTeamMembers();

  return NextResponse.json({ members });
}
