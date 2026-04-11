import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createContentPiece,
  getContentPieces,
  generateSlug,
  isSlugAvailable,
  getContentPerformanceSignal,
} from '@/lib/db/content';
import { getActiveContext } from '@/lib/db/context';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

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
    const message = err instanceof Error ? err.message : 'Failed to fetch content';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.title || !body.body) {
    return NextResponse.json(
      { error: 'Title and body are required' },
      { status: 400 }
    );
  }

  try {
    // Check slug uniqueness if explicitly provided
    if (typeof body.slug === 'string' && body.slug.trim()) {
      const available = await isSlugAvailable(body.slug as string);
      if (!available) {
        return NextResponse.json(
          { error: 'Slug already taken' },
          { status: 409 }
        );
      }
    }

    const activeContext = await getActiveContext();

    const slug = typeof body.slug === 'string' && body.slug.trim()
      ? body.slug as string
      : await generateSlug(body.title as string);

    const piece = await createContentPiece({
      title: body.title as string,
      slug,
      contentType: (body.contentType as string) ?? 'other',
      status: (body.status as string) ?? 'draft',
      body: body.body as string,
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
      createdBy: user.id,
    });

    return NextResponse.json({ contentPiece: piece }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create content';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
