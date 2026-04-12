import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import {
  createContentPiece,
  getContentPieces,
  generateSlug,
  isSlugAvailable,
  getContentPerformanceSignal,
} from '@/lib/db/content';
import { getActiveContext } from '@/lib/db/context';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const contentType = url.searchParams.get('contentType');
    const campaignId = url.searchParams.get('campaignId');

    const pieces = await getContentPieces({
      status: status ?? undefined,
      contentType: contentType ?? undefined,
      campaignId: campaignId ?? undefined,
    });

    const results = pieces.map((piece) => ({
      ...piece,
      distributionCount: piece.distributions.length,
      latestSnapshot: piece.metricSnapshots[0] ?? null,
      performanceSignal: getContentPerformanceSignal(piece.metricSnapshots),
    }));

    return NextResponse.json({ contentPieces: results });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch content') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: body, error } = await parseJsonBody(request);
  if (error) return error;

  // Validate required fields
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (typeof body.body !== 'string') {
    return NextResponse.json({ error: 'Body is required' }, { status: 400 });
  }

  // Validate optional string fields
  if (body.contentType !== undefined && typeof body.contentType !== 'string') {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
  }
  if (body.excerpt !== undefined && typeof body.excerpt !== 'string') {
    return NextResponse.json({ error: 'Invalid excerpt' }, { status: 400 });
  }
  if (body.slug !== undefined && typeof body.slug !== 'string') {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
  }
  if (body.metaTitle !== undefined && typeof body.metaTitle !== 'string') {
    return NextResponse.json({ error: 'Invalid metaTitle' }, { status: 400 });
  }
  if (body.metaDescription !== undefined && typeof body.metaDescription !== 'string') {
    return NextResponse.json({ error: 'Invalid metaDescription' }, { status: 400 });
  }
  if (body.targetKeyword !== undefined && typeof body.targetKeyword !== 'string') {
    return NextResponse.json({ error: 'Invalid targetKeyword' }, { status: 400 });
  }
  if (body.canonicalUrl !== undefined && typeof body.canonicalUrl !== 'string') {
    return NextResponse.json({ error: 'Invalid canonicalUrl' }, { status: 400 });
  }
  if (body.ogTitle !== undefined && typeof body.ogTitle !== 'string') {
    return NextResponse.json({ error: 'Invalid ogTitle' }, { status: 400 });
  }
  if (body.ogDescription !== undefined && typeof body.ogDescription !== 'string') {
    return NextResponse.json({ error: 'Invalid ogDescription' }, { status: 400 });
  }
  if (body.ogImageUrl !== undefined && typeof body.ogImageUrl !== 'string') {
    return NextResponse.json({ error: 'Invalid ogImageUrl' }, { status: 400 });
  }
  if (body.twitterCardType !== undefined && typeof body.twitterCardType !== 'string') {
    return NextResponse.json({ error: 'Invalid twitterCardType' }, { status: 400 });
  }

  // Validate optional array field
  if (body.secondaryKeywords !== undefined) {
    if (!Array.isArray(body.secondaryKeywords) || !body.secondaryKeywords.every((k: unknown) => typeof k === 'string')) {
      return NextResponse.json({ error: 'secondaryKeywords must be an array of strings' }, { status: 400 });
    }
  }

  try {
    // Check slug uniqueness if explicitly provided
    if (typeof body.slug === 'string' && body.slug.trim()) {
      const available = await isSlugAvailable(body.slug);
      if (!available) {
        return NextResponse.json(
          { error: 'Slug already taken' },
          { status: 409 }
        );
      }
    }

    const activeContext = await getActiveContext();

    const slug = typeof body.slug === 'string' && body.slug.trim()
      ? body.slug
      : await generateSlug(body.title);

    const piece = await createContentPiece({
      title: body.title,
      slug,
      contentType: (body.contentType as string) ?? 'other',
      status: (body.status as string) ?? 'draft',
      body: body.body,
      excerpt: body.excerpt as string | undefined,
      metaTitle: body.metaTitle as string | undefined,
      metaDescription: body.metaDescription as string | undefined,
      targetKeyword: body.targetKeyword as string | undefined,
      secondaryKeywords: body.secondaryKeywords as string[] | undefined,
      canonicalUrl: body.canonicalUrl as string | undefined,
      ogTitle: body.ogTitle as string | undefined,
      ogDescription: body.ogDescription as string | undefined,
      ogImageUrl: body.ogImageUrl as string | undefined,
      twitterCardType: body.twitterCardType as string | undefined,
      publishedAt: body.status === 'published' ? new Date() : undefined,
      campaignId: body.campaignId as string | undefined,
      parentContentId: body.parentContentId as string | undefined,
      artifactId: body.artifactId as string | undefined,
      contextVersionId: activeContext?.id,
      createdBy: auth.id,
    });

    return NextResponse.json({ contentPiece: piece }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create content') },
      { status: 500 }
    );
  }
}
