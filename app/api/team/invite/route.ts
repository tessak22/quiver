import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeamMember } from '@/lib/db/team';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { TEAM_ROLES } from '@/types';

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Check if requester is admin
  const requester = await getTeamMember(user.id);

  if (!requester || requester.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only admins can invite team members' },
      { status: 403 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { email, role = 'member' } = body;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  if (!TEAM_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Use service role to send invite
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: `${appUrl}/invite`,
      data: { role },
    }
  );

  if (inviteError) {
    return NextResponse.json(
      { error: inviteError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
