import { NextResponse } from 'next/server';
import { getPublishedContentBySlug } from '@/lib/db/content';
import { publicContentLimiter, getClientIp } from '@/lib/rate-limit';

// -------------------------------------------------------------------------
// GET /api/public/content/[slug] — single published content piece
// -------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const ip = getClientIp(request);

  if (!publicContentLimiter.check(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 60 requests per minute.' },
      { status: 429 }
    );
  }

  try {
    const piece = await getPublishedContentBySlug(params.slug);

    if (!piece || piece.status !== 'published') {
      return NextResponse.json(
        { error: 'Content not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      slug: piece.slug,
      title: piece.title,
      contentType: piece.contentType,
      body: piece.body,
      excerpt: piece.excerpt,
      meta: {
        title: piece.metaTitle,
        description: piece.metaDescription,
        canonicalUrl: piece.canonicalUrl,
      },
      og: {
        title: piece.ogTitle,
        description: piece.ogDescription,
        imageUrl: piece.ogImageUrl,
        twitterCardType: piece.twitterCardType,
      },
      publishedAt: piece.publishedAt,
      updatedAt: piece.updatedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch content';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
