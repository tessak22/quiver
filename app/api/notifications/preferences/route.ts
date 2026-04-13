import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getNotificationPrefs, updateNotificationPrefs } from '@/lib/db/notifications';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { NOTIFICATION_TYPES } from '@/types';
import type { NotificationPrefs, NotificationType } from '@/types';

// GET /api/notifications/preferences — fetch the current user's notification prefs
export async function GET() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const prefs = await getNotificationPrefs(auth.id);
    return NextResponse.json({ prefs });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch notification preferences') },
      { status: 500 }
    );
  }
}

// PUT /api/notifications/preferences — update one or more preference flags
export async function PUT(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: body, error } = await parseJsonBody(request);
  if (error) return error;

  // Validate: only accept known notification type keys with boolean values
  const updates: NotificationPrefs = {};
  for (const type of NOTIFICATION_TYPES) {
    if (type in body) {
      if (typeof body[type] !== 'boolean') {
        return NextResponse.json(
          { error: `Preference "${type}" must be a boolean` },
          { status: 400 }
        );
      }
      updates[type as NotificationType] = body[type] as boolean;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: 'No valid preference fields provided' },
      { status: 400 }
    );
  }

  try {
    await updateNotificationPrefs(auth.id, updates);
    const prefs = await getNotificationPrefs(auth.id);
    return NextResponse.json({ prefs });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update notification preferences') },
      { status: 500 }
    );
  }
}
