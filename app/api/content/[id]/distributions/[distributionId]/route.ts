import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getDistribution, updateDistribution, deleteDistribution } from '@/lib/db/content';
import {
  DISTRIBUTION_CHANNEL_VALUES,
  DISTRIBUTION_STATUS_VALUES,
} from '@/types';

const distributionUpdateSchema = z.object({
  channel: z.enum(DISTRIBUTION_CHANNEL_VALUES).optional(),
  url: z.union([z.string(), z.null()]).optional(),
  publishedAt: z.union([z.string(), z.null()]).optional(),
  status: z.enum(DISTRIBUTION_STATUS_VALUES).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
});

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

    const parsedBody = distributionUpdateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    let parsedDate: Date | null | undefined;
    if (parsedBody.data.publishedAt === undefined) {
      parsedDate = undefined;
    } else if (parsedBody.data.publishedAt === null || parsedBody.data.publishedAt === '') {
      parsedDate = null;
    } else {
      const parsed = parseISODate(parsedBody.data.publishedAt);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid publishedAt date format. Use ISO 8601 (e.g. 2026-04-11).' },
          { status: 400 }
        );
      }
      parsedDate = parsed;
    }

    const distribution = await updateDistribution(params.distributionId, {
      channel: parsedBody.data.channel,
      url: parsedBody.data.url ?? undefined,
      publishedAt: parsedDate,
      status: parsedBody.data.status,
      notes: parsedBody.data.notes ?? undefined,
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
