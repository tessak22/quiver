import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, updateSessionTitle, archiveSession } from '@/lib/db/sessions';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const session = await getSession(params.id);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({ session });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (body.title !== undefined) {
    const session = await updateSessionTitle(params.id, body.title);
    return NextResponse.json({ session });
  }

  if (body.isArchived === true) {
    const session = await archiveSession(params.id);
    return NextResponse.json({ session });
  }

  return NextResponse.json({ error: 'No valid update fields' }, { status: 400 });
}
