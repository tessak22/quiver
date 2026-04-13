import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { markAllNotificationsRead } from '@/lib/db/notifications';
import { safeErrorMessage } from '@/lib/utils';

// POST /api/notifications/read-all — mark all of the current user's notifications as read
export async function POST() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await markAllNotificationsRead(auth.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to mark all notifications as read') },
      { status: 500 }
    );
  }
}
