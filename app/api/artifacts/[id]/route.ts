import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getArtifact, updateArtifact } from '@/lib/db/artifacts';
// Status changes must go through /api/artifacts/[id]/status

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const artifact = await getArtifact(params.id);

  if (!artifact) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  return NextResponse.json({ artifact });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Verify artifact exists
  const existing = await getArtifact(params.id);
  if (!existing) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Build the update payload from allowed fields
  const updateData: { title?: string; status?: string; tags?: string[]; content?: string } = {};

  if (typeof body.title === 'string' && body.title.trim()) {
    updateData.title = body.title.trim();
  }

  // Status changes must go through /api/artifacts/[id]/status for transition
  // enforcement and close-the-loop reminder side effects
  if (typeof body.status === 'string') {
    return NextResponse.json(
      { error: 'Use PATCH /api/artifacts/{id}/status for status transitions' },
      { status: 400 }
    );
  }

  if (Array.isArray(body.tags)) {
    const validTags = body.tags.every((t: unknown) => typeof t === 'string');
    if (!validTags) {
      return NextResponse.json(
        { error: 'Tags must be an array of strings' },
        { status: 400 }
      );
    }
    updateData.tags = body.tags as string[];
  }

  if (typeof body.content === 'string') {
    updateData.content = body.content;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { error: 'No valid fields to update' },
      { status: 400 }
    );
  }

  const artifact = await updateArtifact(params.id, updateData);

  return NextResponse.json({ artifact });
}
