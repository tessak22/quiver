import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDistribution, updateDistribution, deleteDistribution } from '@/lib/db/content';

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const d = new Date(value as string);
  if (isNaN(d.getTime())) {
    throw new Error('Invalid date format');
  }
  return d;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; distributionId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Verify distribution belongs to this content piece
    const existing = await getDistribution(params.distributionId);

    if (!existing || existing.contentPieceId !== params.id) {
      return NextResponse.json(
        { error: 'Distribution not found for this content piece' },
        { status: 404 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    let parsedDate: Date | null | undefined;
    try {
      parsedDate = parseDate(body.publishedAt);
    } catch {
      return NextResponse.json(
        { error: 'Invalid publishedAt date format. Use ISO 8601 (e.g. 2026-04-11).' },
        { status: 400 }
      );
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
    const message = err instanceof Error ? err.message : 'Failed to update distribution';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string; distributionId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

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
    const message = err instanceof Error ? err.message : 'Failed to delete distribution';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
