import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getContentPiece, addMetricSnapshot, getMetricSnapshots } from '@/lib/db/content';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const parsedLimit = limitParam ? parseInt(limitParam, 10) : 24;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 24;

    const snapshots = await getMetricSnapshots(params.id, limit);

    return NextResponse.json({ snapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch metric snapshots';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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

    let snapshotDate = new Date();
    if (body.snapshotDate) {
      const d = new Date(body.snapshotDate as string);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { error: 'Invalid snapshotDate format. Use ISO 8601 (e.g. 2026-04-11).' },
          { status: 400 }
        );
      }
      snapshotDate = d;
    }

    const snapshot = await addMetricSnapshot({
      contentPieceId: params.id,
      snapshotDate,
      pageviews: body.pageviews as number | undefined,
      uniqueVisitors: body.uniqueVisitors as number | undefined,
      avgTimeOnPage: body.avgTimeOnPage as number | undefined,
      bounceRate: body.bounceRate as number | undefined,
      organicClicks: body.organicClicks as number | undefined,
      impressions: body.impressions as number | undefined,
      avgPosition: body.avgPosition as number | undefined,
      ctr: body.ctr as number | undefined,
      socialShares: body.socialShares as number | undefined,
      backlinks: body.backlinks as number | undefined,
      comments: body.comments as number | undefined,
      signups: body.signups as number | undefined,
      conversionRate: body.conversionRate as number | undefined,
      source: (body.source as string) ?? 'manual',
      notes: body.notes as string | undefined,
      recordedBy: user.id,
    });

    return NextResponse.json({ snapshot }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add metric snapshot';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
