import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getArtifact, updateArtifact } from '@/lib/db/artifacts';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
// Status changes must go through /api/artifacts/[id]/status

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('viewer');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const artifact = await getArtifact(params.id);

    if (!artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    return NextResponse.json({ artifact });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch artifact') },
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

  try {
    // Verify artifact exists
    const existing = await getArtifact(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    const parsed = await parseJsonBody(request);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // Build the update payload from allowed fields
    const updateData: { title?: string; status?: string; tags?: string[]; content?: string } = {};

    if (typeof body.title === 'string' && (body.title as string).trim()) {
      updateData.title = (body.title as string).trim();
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
      const validTags = (body.tags as unknown[]).every((t: unknown) => typeof t === 'string');
      if (!validTags) {
        return NextResponse.json(
          { error: 'Tags must be an array of strings' },
          { status: 400 }
        );
      }
      updateData.tags = body.tags as string[];
    }

    if (typeof body.content === 'string') {
      updateData.content = body.content as string;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const artifact = await updateArtifact(params.id, updateData);

    return NextResponse.json({ artifact });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update artifact') },
      { status: 500 }
    );
  }
}
