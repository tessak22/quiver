import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, parseISODate, safeErrorMessage } from '@/lib/utils';
import {
  createResearchEntry,
  getResearchEntries,
} from '@/lib/db/research';
import { processResearchEntry } from '@/lib/ai/research';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch research entries') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: body, error } = await parseJsonBody(request);
  if (error) return error;

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
  if (body.researchDate !== undefined) {
    const parsed = parseISODate(body.researchDate);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid researchDate format. Use ISO 8601 (e.g. 2026-04-11).' },
        { status: 400 }
      );
    }
    researchDate = parsed;
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
    createdBy: auth.id,
  });

  // Run AI processing after response is sent — waitUntil keeps the
  // serverless function alive until the promise settles, preventing
  // the work from being dropped when the runtime suspends.
  waitUntil(processResearchEntry({
    id: entry.id,
    title: entry.title,
    sourceType: entry.sourceType,
    contactName: entry.contactName,
    contactCompany: entry.contactCompany,
    contactSegment: entry.contactSegment,
    contactStage: entry.contactStage,
    rawNotes: entry.rawNotes,
    campaignId: entry.campaignId,
  }));

  return NextResponse.json({ entry, processing: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create research entry') },
      { status: 500 }
    );
  }
}
