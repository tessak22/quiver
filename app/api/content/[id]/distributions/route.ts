import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getContentPiece, addDistribution } from '@/lib/db/content';

export async function POST(
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

    if (!body.channel) {
      return NextResponse.json(
        { error: 'Channel is required' },
        { status: 400 }
      );
    }

    let publishedAt: Date | undefined;
    if (body.publishedAt) {
      const parsed = parseISODate(body.publishedAt);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid publishedAt date format. Use ISO 8601 (e.g. 2026-04-11).' },
          { status: 400 }
        );
      }
      publishedAt = parsed;
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
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to add distribution') },
      { status: 500 }
    );
  }
}
