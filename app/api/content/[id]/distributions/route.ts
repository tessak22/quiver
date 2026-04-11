import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getContentPiece, addDistribution } from '@/lib/db/content';

export async function POST(
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

    if (!body.channel) {
      return NextResponse.json(
        { error: 'Channel is required' },
        { status: 400 }
      );
    }

    let publishedAt: Date | undefined;
    if (body.publishedAt) {
      const d = new Date(body.publishedAt as string);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'Invalid publishedAt date format. Use ISO 8601 (e.g. 2026-04-11).' },
          { status: 400 }
        );
      }
      publishedAt = d;
    }

    const distribution = await addDistribution({
      contentPieceId: params.id,
      channel: body.channel as string,
      url: body.url as string | undefined,
      publishedAt,
      status: (body.status as string) ?? 'planned',
      notes: body.notes as string | undefined,
    });

    return NextResponse.json({ distribution }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add distribution';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
