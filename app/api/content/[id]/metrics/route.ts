import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import { getContentPiece, addMetricSnapshot, getMetricSnapshots } from '@/lib/db/content';
import { CONTENT_METRIC_SOURCE_VALUES } from '@/types';

const metricSnapshotCreateSchema = z.object({
  snapshotDate: z.union([z.string(), z.null()]).optional(),
  pageviews: z.number().optional(),
  uniqueVisitors: z.number().optional(),
  avgTimeOnPage: z.number().optional(),
  bounceRate: z.number().optional(),
  organicClicks: z.number().optional(),
  impressions: z.number().optional(),
  avgPosition: z.number().optional(),
  ctr: z.number().optional(),
  socialShares: z.number().optional(),
  backlinks: z.number().optional(),
  comments: z.number().optional(),
  signups: z.number().optional(),
  conversionRate: z.number().optional(),
  source: z.union([z.enum(CONTENT_METRIC_SOURCE_VALUES), z.null()]).optional(),
  notes: z.union([z.string(), z.null()]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 24;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 24;

    const snapshots = await getMetricSnapshots(params.id, limit);

    return NextResponse.json({ snapshots });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch metric snapshots') },
      { status: 500 }
    );
  }
}

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

    const parsedBody = metricSnapshotCreateSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: parsedBody.error.issues[0]?.message ?? 'Invalid request body' },
        { status: 400 }
      );
    }

    let snapshotDate = new Date();
    if (parsedBody.data.snapshotDate) {
      const parsed = parseISODate(parsedBody.data.snapshotDate);
      if (!parsed) {
        return NextResponse.json(
          { error: 'Invalid snapshotDate format. Use ISO 8601 (e.g. 2026-04-11).' },
          { status: 400 }
        );
      }
      snapshotDate = parsed;
    }

    const snapshot = await addMetricSnapshot({
      contentPieceId: params.id,
      snapshotDate,
      pageviews: parsedBody.data.pageviews,
      uniqueVisitors: parsedBody.data.uniqueVisitors,
      avgTimeOnPage: parsedBody.data.avgTimeOnPage,
      bounceRate: parsedBody.data.bounceRate,
      organicClicks: parsedBody.data.organicClicks,
      impressions: parsedBody.data.impressions,
      avgPosition: parsedBody.data.avgPosition,
      ctr: parsedBody.data.ctr,
      socialShares: parsedBody.data.socialShares,
      backlinks: parsedBody.data.backlinks,
      comments: parsedBody.data.comments,
      signups: parsedBody.data.signups,
      conversionRate: parsedBody.data.conversionRate,
      source: parsedBody.data.source ?? 'manual',
      notes: parsedBody.data.notes ?? undefined,
      recordedBy: auth.id,
    });

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to add metric snapshot') },
      { status: 500 }
    );
  }
}
