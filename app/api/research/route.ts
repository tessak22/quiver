import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createResearchEntry,
  getResearchEntries,
} from '@/lib/db/research';
import { processResearchEntry } from '@/lib/ai/research';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const sourceType = url.searchParams.get('sourceType');
  const segment = url.searchParams.get('segment');
  const stage = url.searchParams.get('stage');
  const theme = url.searchParams.get('theme');
  const campaignId = url.searchParams.get('campaignId');
  const productSignal = url.searchParams.get('productSignal');

  try {
    const entries = await getResearchEntries({
      sourceType: sourceType ?? undefined,
      contactSegment: segment ?? undefined,
      contactStage: stage ?? undefined,
      theme: theme ?? undefined,
      campaignId: campaignId ?? undefined,
      productSignal: productSignal === 'true' ? true : undefined,
    });

    return NextResponse.json({ entries });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch research entries';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.title || typeof body.title !== 'string') {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!body.sourceType || typeof body.sourceType !== 'string') {
    return NextResponse.json({ error: 'Source type is required' }, { status: 400 });
  }
  if (!body.rawNotes || typeof body.rawNotes !== 'string') {
    return NextResponse.json({ error: 'Raw notes are required' }, { status: 400 });
  }

  // Validate date if provided
  let researchDate: Date | undefined;
  if (typeof body.researchDate === 'string') {
    const d = new Date(body.researchDate);
    if (isNaN(d.getTime())) {
      return NextResponse.json(
        { error: 'Invalid researchDate format. Use ISO 8601 (e.g. 2026-04-11).' },
        { status: 400 }
      );
    }
    researchDate = d;
  }

  try {
  const entry = await createResearchEntry({
    title: body.title,
    sourceType: body.sourceType,
    contactName: typeof body.contactName === 'string' ? body.contactName : undefined,
    contactCompany: typeof body.contactCompany === 'string' ? body.contactCompany : undefined,
    contactSegment: typeof body.contactSegment === 'string' ? body.contactSegment : undefined,
    contactStage: typeof body.contactStage === 'string' ? body.contactStage : undefined,
    researchDate,
    rawNotes: body.rawNotes,
    productSignal: typeof body.productSignal === 'boolean' ? body.productSignal : false,
    productNote: typeof body.productNote === 'string' ? body.productNote : undefined,
    campaignId: typeof body.campaignId === 'string' ? body.campaignId : undefined,
    createdBy: user.id,
  });

  // Trigger AI processing asynchronously — do NOT await
  void processResearchEntry({
    id: entry.id,
    title: entry.title,
    sourceType: entry.sourceType,
    contactName: entry.contactName,
    contactCompany: entry.contactCompany,
    contactSegment: entry.contactSegment,
    contactStage: entry.contactStage,
    rawNotes: entry.rawNotes,
    campaignId: entry.campaignId,
  });

  return NextResponse.json({ entry, processing: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create research entry';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
