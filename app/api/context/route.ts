import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import {
  getActiveContext,
  getContextVersions,
  createContextVersion,
} from '@/lib/db/context';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const history = url.searchParams.get('history');

  try {
    if (history === 'true') {
      const versions = await getContextVersions();
      return NextResponse.json({ versions });
    }

    const active = await getActiveContext();
    if (!active) {
      return NextResponse.json({ error: 'No active context found' }, { status: 404 });
    }

    return NextResponse.json({ context: active });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch context') },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data;

  if (!body.changeSummary || typeof body.changeSummary !== 'string' || (body.changeSummary as string).trim().length === 0) {
    return NextResponse.json(
      { error: 'Change summary is required when saving context' },
      { status: 400 }
    );
  }

  try {
    const version = await createContextVersion({
      positioningStatement: (body.positioningStatement as string) ?? null,
      icpDefinition: body.icpDefinition ?? undefined,
      messagingPillars: body.messagingPillars ?? undefined,
      competitiveLandscape: body.competitiveLandscape ?? undefined,
      customerLanguage: body.customerLanguage ?? undefined,
      proofPoints: body.proofPoints ?? undefined,
      activeHypotheses: body.activeHypotheses ?? undefined,
      brandVoice: (body.brandVoice as string) ?? null,
      wordsToUse: (body.wordsToUse as string[]) ?? [],
      wordsToAvoid: (body.wordsToAvoid as string[]) ?? [],
      updatedBy: auth.id,
      updateSource: (body.updateSource as string) ?? 'manual',
      changeSummary: (body.changeSummary as string).trim(),
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create context version') },
      { status: 500 }
    );
  }
}
