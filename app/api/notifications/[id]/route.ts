import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { markNotificationRead } from '@/lib/db/notifications';
import { safeErrorMessage } from '@/lib/utils';

// PATCH /api/notifications/[id] — mark a single notification as read
export async function PATCH(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await markNotificationRead(params.id, auth.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to mark notification as read') },
      { status: 500 }
    );
  }
}
