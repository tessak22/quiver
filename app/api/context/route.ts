import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getActiveContext,
  getContextVersions,
  createContextVersion,
} from '@/lib/db/context';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const history = url.searchParams.get('history');

  if (history === 'true') {
    const versions = await getContextVersions();
    return NextResponse.json({ versions });
  }

  const active = await getActiveContext();
  if (!active) {
    return NextResponse.json({ error: 'No active context found' }, { status: 404 });
  }

  return NextResponse.json({ context: active });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.changeSummary || typeof body.changeSummary !== 'string' || body.changeSummary.trim().length === 0) {
    return NextResponse.json(
      { error: 'Change summary is required when saving context' },
      { status: 400 }
    );
  }

  const version = await createContextVersion({
    positioningStatement: body.positioningStatement ?? null,
    icpDefinition: body.icpDefinition ?? undefined,
    messagingPillars: body.messagingPillars ?? undefined,
    competitiveLandscape: body.competitiveLandscape ?? undefined,
    customerLanguage: body.customerLanguage ?? undefined,
    proofPoints: body.proofPoints ?? undefined,
    activeHypotheses: body.activeHypotheses ?? undefined,
    brandVoice: body.brandVoice ?? null,
    wordsToUse: body.wordsToUse ?? [],
    wordsToAvoid: body.wordsToAvoid ?? [],
    updatedBy: user.id,
    updateSource: body.updateSource ?? 'manual',
    changeSummary: body.changeSummary.trim(),
  });

  return NextResponse.json({ version });
}
