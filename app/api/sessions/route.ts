import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getSessions } from '@/lib/db/sessions';
import { safeErrorMessage } from '@/lib/utils';
import { SESSION_MODES } from '@/types';
import type { SessionMode } from '@/types';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');
  const campaignId = url.searchParams.get('campaignId');
  const archived = url.searchParams.get('archived') === 'true';

  if (mode && !SESSION_MODES.includes(mode as SessionMode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  try {
    const sessions = await getSessions({
      mode: (mode as SessionMode) ?? undefined,
      campaignId: campaignId ?? undefined,
      isArchived: archived,
    });

    return NextResponse.json({ sessions });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch sessions') },
      { status: 500 }
    );
  }
}
