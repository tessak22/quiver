import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getSession, updateSessionTitle, archiveSession } from '@/lib/db/sessions';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('viewer');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const session = await getSession(params.id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.createdBy !== auth.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ session });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch session') },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  try {
    // Fetch session and verify ownership before any modification
    const existing = await getSession(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (existing.createdBy !== auth.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (body.title !== undefined) {
      const session = await updateSessionTitle(params.id, body.title as string);
      return NextResponse.json({ session });
    }

    if (body.isArchived === true) {
      const session = await archiveSession(params.id);
      return NextResponse.json({ session });
    }

    return NextResponse.json({ error: 'No valid update fields' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update session') },
      { status: 500 }
    );
  }
}
