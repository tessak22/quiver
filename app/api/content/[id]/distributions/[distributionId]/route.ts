import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getDistribution, updateDistribution, deleteDistribution } from '@/lib/db/content';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; distributionId: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Verify distribution belongs to this content piece
    const existing = await getDistribution(params.distributionId);

    if (!existing || existing.contentPieceId !== params.id) {
      return NextResponse.json(
        { error: 'Distribution not found for this content piece' },
        { status: 404 }
      );
    }

    const { data: body, error } = await parseJsonBody(request);
    if (error) return error;

    let parsedDate: Date | null | undefined;
    if (body.publishedAt === undefined) {
      parsedDate = undefined;
    } else if (body.publishedAt === null || body.publishedAt === '') {
      parsedDate = null;
    } else {
      const parsed = parseISODate(body.publishedAt);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid publishedAt date format. Use ISO 8601 (e.g. 2026-04-11).' },
          { status: 400 }
        );
      }
      parsedDate = parsed;
    }

    const distribution = await updateDistribution(params.distributionId, {
      channel: body.channel as string | undefined,
      url: body.url as string | undefined,
      publishedAt: parsedDate,
      status: body.status as string | undefined,
      notes: body.notes as string | undefined,
    });

    return NextResponse.json({ distribution });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update distribution') },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; distributionId: string } }
) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Verify distribution belongs to this content piece
    const existing = await getDistribution(params.distributionId);

    if (!existing || existing.contentPieceId !== params.id) {
      return NextResponse.json(
        { error: 'Distribution not found for this content piece' },
        { status: 404 }
      );
    }

    await deleteDistribution(params.distributionId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to delete distribution') },
      { status: 500 }
    );
  }
}
