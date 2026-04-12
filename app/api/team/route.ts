import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/utils';
import { getTeamMembers } from '@/lib/db/team';

export async function GET() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const members = await getTeamMembers();
    return NextResponse.json({ members });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch team members') },
      { status: 500 }
    );
  }
}
