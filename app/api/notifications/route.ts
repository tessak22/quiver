import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getUserNotifications } from '@/lib/db/notifications';
import { safeErrorMessage } from '@/lib/utils';

// GET /api/notifications — list the current user's notifications
export async function GET() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const notifications = await getUserNotifications(auth.id);
    return NextResponse.json({ notifications });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch notifications') },
      { status: 500 }
    );
  }
}
