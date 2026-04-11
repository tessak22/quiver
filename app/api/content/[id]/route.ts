import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getContentPiece, updateContentPiece, getContentPerformanceSignal } from '@/lib/db/content';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const piece = await getContentPiece(params.id);

    if (!piece) {
      return NextResponse.json({ error: 'Content piece not found' }, { status: 404 });
    }

    return NextResponse.json({
      contentPiece: piece,
      performanceSignal: getContentPerformanceSignal(piece.metricSnapshots),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch content piece';
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

  try {
    const existing = await getContentPiece(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Content piece not found' }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // If status changes to 'published' and publishedAt is null, set it
    const updateData: Record<string, unknown> = {};

    if (body.title !== undefined) updateData.title = body.title;
    if (body.slug !== undefined) updateData.slug = body.slug;
    if (body.contentType !== undefined) updateData.contentType = body.contentType;
    if (body.body !== undefined) updateData.body = body.body;
    if (body.excerpt !== undefined) updateData.excerpt = body.excerpt;
    if (body.metaTitle !== undefined) updateData.metaTitle = body.metaTitle;
    if (body.metaDescription !== undefined) updateData.metaDescription = body.metaDescription;
    if (body.targetKeyword !== undefined) updateData.targetKeyword = body.targetKeyword;
    if (body.secondaryKeywords !== undefined) updateData.secondaryKeywords = body.secondaryKeywords;
    if (body.canonicalUrl !== undefined) updateData.canonicalUrl = body.canonicalUrl;
    if (body.ogTitle !== undefined) updateData.ogTitle = body.ogTitle;
    if (body.ogDescription !== undefined) updateData.ogDescription = body.ogDescription;
    if (body.ogImageUrl !== undefined) updateData.ogImageUrl = body.ogImageUrl;
    if (body.twitterCardType !== undefined) updateData.twitterCardType = body.twitterCardType;
    if (body.campaignId !== undefined) updateData.campaignId = body.campaignId;
    if (body.parentContentId !== undefined) updateData.parentContentId = body.parentContentId;

    if (body.publishedAt !== undefined) {
      if (body.publishedAt === null || body.publishedAt === '') {
        updateData.publishedAt = null;
      } else {
        const d = new Date(body.publishedAt as string);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: 'Invalid publishedAt date format. Use ISO 8601 (e.g. 2026-04-11).' },
            { status: 400 }
          );
        }
        updateData.publishedAt = d;
      }
    }

    if (body.status !== undefined) {
      updateData.status = body.status;
      if (
        body.status === 'published' &&
        !existing.publishedAt &&
        body.publishedAt === undefined
      ) {
        updateData.publishedAt = new Date();
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const piece = await updateContentPiece(params.id, updateData as Parameters<typeof updateContentPiece>[1]);

    return NextResponse.json({
      contentPiece: piece,
      performanceSignal: getContentPerformanceSignal(piece.metricSnapshots),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update content piece';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const existing = await getContentPiece(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Content piece not found' }, { status: 404 });
    }

    // Soft delete — set status to archived
    const piece = await updateContentPiece(params.id, { status: 'archived' });

    return NextResponse.json({
      contentPiece: piece,
      performanceSignal: getContentPerformanceSignal(piece.metricSnapshots),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete content piece';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
