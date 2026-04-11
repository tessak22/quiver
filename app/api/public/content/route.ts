import { NextResponse } from 'next/server';
import { getPublishedContentList } from '@/lib/db/content';
import { publicContentLimiter, getClientIp } from '@/lib/rate-limit';

// -------------------------------------------------------------------------
// GET /api/public/content — paginated listing of published pieces
// -------------------------------------------------------------------------

export async function GET(request: Request) {
  const ip = getClientIp(request);

  if (!publicContentLimiter.check(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 60 requests per minute.' },
      { status: 429 }
    );
  }

  try {
    const url = new URL(request.url);
    const contentType = url.searchParams.get('contentType');
    const limitParam = url.searchParams.get('limit');
    const offsetParam = url.searchParams.get('offset');

    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 20;
    const parsedOffset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 20;
    const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

    const pieces = await getPublishedContentList({
      contentType: contentType ?? undefined,
      limit,
      offset,
    });

    return NextResponse.json({ items: pieces, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch content';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
