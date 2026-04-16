import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getContentPiece, updateContentPiece, deleteContentPiece, getContentPerformanceSignal } from '@/lib/db/content';
import {
  CONTENT_STATUS_VALUES,
  CONTENT_TYPE_VALUES,
} from '@/types';

const contentUpdateSchema = z.object({
  title: z.string().optional(),
  slug: z.string().optional(),
  contentType: z.enum(CONTENT_TYPE_VALUES).optional(),
  body: z.string().optional(),
  excerpt: z.union([z.string(), z.null()]).optional(),
  metaTitle: z.union([z.string(), z.null()]).optional(),
  metaDescription: z.union([z.string(), z.null()]).optional(),
  targetKeyword: z.union([z.string(), z.null()]).optional(),
  secondaryKeywords: z.union([z.array(z.string()), z.null()]).optional(),
  canonicalUrl: z.union([z.string(), z.null()]).optional(),
  ogTitle: z.union([z.string(), z.null()]).optional(),
  ogDescription: z.union([z.string(), z.null()]).optional(),
  ogImageUrl: z.union([z.string(), z.null()]).optional(),
  twitterCardType: z.union([z.string(), z.null()]).optional(),
  campaignId: z.union([z.string(), z.null()]).optional(),
  parentContentId: z.union([z.string(), z.null()]).optional(),
  publishedAt: z.union([z.string(), z.null()]).optional(),
  status: z.enum(CONTENT_STATUS_VALUES).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch content piece') },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const existing = await getContentPiece(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Content piece not found' }, { status: 404 });
    }

    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    const parsedBody = contentUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    // If status changes to 'published' and publishedAt is null, set it
    const updateData: Parameters<typeof updateContentPiece>[1] = {};

    if (parsedBody.data.title !== undefined) updateData.title = parsedBody.data.title;
    if (parsedBody.data.slug !== undefined) updateData.slug = parsedBody.data.slug;
    if (parsedBody.data.contentType !== undefined) updateData.contentType = parsedBody.data.contentType;
    if (parsedBody.data.body !== undefined) updateData.body = parsedBody.data.body;
    if (parsedBody.data.excerpt !== undefined) updateData.excerpt = parsedBody.data.excerpt;
    if (parsedBody.data.metaTitle !== undefined) updateData.metaTitle = parsedBody.data.metaTitle;
    if (parsedBody.data.metaDescription !== undefined) updateData.metaDescription = parsedBody.data.metaDescription;
    if (parsedBody.data.targetKeyword !== undefined) updateData.targetKeyword = parsedBody.data.targetKeyword;
    if (parsedBody.data.secondaryKeywords !== undefined) updateData.secondaryKeywords = parsedBody.data.secondaryKeywords ?? [];
    if (parsedBody.data.canonicalUrl !== undefined) updateData.canonicalUrl = parsedBody.data.canonicalUrl;
    if (parsedBody.data.ogTitle !== undefined) updateData.ogTitle = parsedBody.data.ogTitle;
    if (parsedBody.data.ogDescription !== undefined) updateData.ogDescription = parsedBody.data.ogDescription;
    if (parsedBody.data.ogImageUrl !== undefined) updateData.ogImageUrl = parsedBody.data.ogImageUrl;
    if (parsedBody.data.twitterCardType !== undefined) updateData.twitterCardType = parsedBody.data.twitterCardType;
    if (parsedBody.data.campaignId !== undefined) updateData.campaignId = parsedBody.data.campaignId;
    if (parsedBody.data.parentContentId !== undefined) updateData.parentContentId = parsedBody.data.parentContentId;

    if (parsedBody.data.publishedAt !== undefined) {
      if (parsedBody.data.publishedAt === null || parsedBody.data.publishedAt === '') {
        updateData.publishedAt = null;
      } else {
        const parsed = parseISODate(parsedBody.data.publishedAt);
        if (!parsed) {
          return NextResponse.json(
            { error: 'Invalid publishedAt date format. Use ISO 8601 (e.g. 2026-04-11).' },
            { status: 400 }
          );
        }
        updateData.publishedAt = parsed;
      }
    }

    if (parsedBody.data.status !== undefined) {
      updateData.status = parsedBody.data.status;
      if (
        parsedBody.data.status === 'published' &&
        !existing.publishedAt &&
        parsedBody.data.publishedAt === undefined
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

    const piece = await updateContentPiece(params.id, updateData);

    return NextResponse.json({
      contentPiece: piece,
      performanceSignal: getContentPerformanceSignal(piece.metricSnapshots),
    });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update content piece') },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const existing = await getContentPiece(params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Content piece not found' }, { status: 404 });
    }

    await deleteContentPiece(params.id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to delete content piece') },
      { status: 500 }
    );
  }
}
