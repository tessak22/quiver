import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/utils';
import { getReminders } from '@/lib/db/artifacts';

export async function GET() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const reminders = await getReminders();
    return NextResponse.json({ reminders });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch reminders') },
      { status: 500 }
    );
  }
}
