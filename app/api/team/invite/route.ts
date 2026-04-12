import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody } from '@/lib/utils';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { TEAM_ROLES, type TeamRole } from '@/types';

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
