import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transitionArtifactStatus, getArtifact } from '@/lib/db/artifacts';

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
  const { status } = body;

  try {
    await transitionArtifactStatus(params.id, status, user.id);
    // Return the full artifact with relations for UI update
    const artifact = await getArtifact(params.id);
    return NextResponse.json({ artifact });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update status' },
      { status: 400 }
    );
  }
}
