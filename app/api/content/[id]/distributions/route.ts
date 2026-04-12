import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getContentPiece, addDistribution } from '@/lib/db/content';
import {
  DISTRIBUTION_CHANNEL_VALUES,
  DISTRIBUTION_STATUS_VALUES,
} from '@/types';

const distributionCreateSchema = z.object({
  channel: z.union([z.enum(DISTRIBUTION_CHANNEL_VALUES), z.null()]).optional(),
  url: z.union([z.string(), z.null()]).optional(),
  publishedAt: z.union([z.string(), z.null()]).optional(),
  status: z.union([z.enum(DISTRIBUTION_STATUS_VALUES), z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
});

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

    const parsedBody = distributionCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    if (!parsedBody.data.channel) {
      return NextResponse.json(
        { error: 'Channel is required' },
        { status: 400 }
      );
    }

    let publishedAt: Date | undefined;
    if (parsedBody.data.publishedAt) {
      const parsed = parseISODate(parsedBody.data.publishedAt);
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
      channel: parsedBody.data.channel,
      url: parsedBody.data.url ?? undefined,
      publishedAt,
      status: parsedBody.data.status ?? 'planned',
      notes: parsedBody.data.notes ?? undefined,
    });

    return NextResponse.json({ distribution }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to add distribution') },
      { status: 500 }
    );
  }
}
