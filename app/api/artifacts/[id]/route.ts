import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { getArtifact, updateArtifact } from '@/lib/db/artifacts';
import { prisma } from '@/lib/db';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { ARTIFACT_TYPES } from '@/types';
// Status changes must go through /api/artifacts/[id]/status
// Archive (grooming) is handled here via { archive: true } — bypasses state machine
// Hard delete is handled via DELETE

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
    const updateData: { title?: string; status?: string; tags?: string[]; content?: string; type?: string; campaignId?: string } = {};

    if (typeof body.title === 'string' && (body.title as string).trim()) {
      updateData.title = (body.title as string).trim();
    }

    // Archive is a grooming action — bypasses state machine, works from any status.
    // Early return intentionally ignores any other fields in the request body (title, tags, etc.).
    // Callers must issue a separate PATCH to update other fields.
    if (body.archive === true) {
      const artifact = await prisma.artifact.update({
        where: { id: params.id },
        data: { status: 'archived' },
      });
      return NextResponse.json({ artifact });
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

    if (typeof body.type === 'string') {
      const trimmedType = (body.type as string).trim();
      if (!ARTIFACT_TYPES.includes(trimmedType as (typeof ARTIFACT_TYPES)[number])) {
        return NextResponse.json({ error: 'Invalid artifact type' }, { status: 400 });
      }
      updateData.type = trimmedType;
    }

    if (typeof body.campaignId === 'string' && (body.campaignId as string).trim()) {
      const campaign = await prisma.campaign.findUnique({ where: { id: body.campaignId as string } });
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 400 });
      }
      updateData.campaignId = body.campaignId as string;
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

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const existing = await getArtifact(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    // FK relations to PerformanceLog and ContentPiece use the Prisma default (SetNull),
    // so those rows remain in the DB with artifactId nulled out — intentionally accepted.
    // Child artifacts (versions) also have parentArtifactId nulled — their history is severed
    // but they remain queryable as standalone artifacts.
    await prisma.artifact.delete({ where: { id: params.id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to delete artifact') },
      { status: 500 }
    );
  }
}
