import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import {
  getActiveContext,
  getContextVersions,
  createContextVersion,
} from '@/lib/db/context';
import { CONTEXT_UPDATE_SOURCE_VALUES } from '@/types';

const contextCreateSchema = z.object({
  positioningStatement: z.union([z.string(), z.null()]).optional(),
  icpDefinition: z.unknown().optional(),
  messagingPillars: z.unknown().optional(),
  competitiveLandscape: z.unknown().optional(),
  customerLanguage: z.unknown().optional(),
  proofPoints: z.unknown().optional(),
  activeHypotheses: z.unknown().optional(),
  brandVoice: z.union([z.string(), z.null()]).optional(),
  wordsToUse: z.union([z.array(z.string()), z.null()]).optional(),
  wordsToAvoid: z.union([z.array(z.string()), z.null()]).optional(),
  updateSource: z.union([z.enum(CONTEXT_UPDATE_SOURCE_VALUES), z.null()]).optional(),
  changeSummary: z.string().trim().min(1, 'Change summary is required when saving context'),
});

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
  const body = contextCreateSchema.safeParse(parsed.data);
  if (!body.success) {
    return NextResponse.json(
      { error: body.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 }
    );
  }

  try {
    const version = await createContextVersion({
      positioningStatement: body.data.positioningStatement ?? null,
      icpDefinition: body.data.icpDefinition ?? undefined,
      messagingPillars: body.data.messagingPillars ?? undefined,
      competitiveLandscape: body.data.competitiveLandscape ?? undefined,
      customerLanguage: body.data.customerLanguage ?? undefined,
      proofPoints: body.data.proofPoints ?? undefined,
      activeHypotheses: body.data.activeHypotheses ?? undefined,
      brandVoice: body.data.brandVoice ?? null,
      wordsToUse: body.data.wordsToUse ?? [],
      wordsToAvoid: body.data.wordsToAvoid ?? [],
      updatedBy: auth.id,
      updateSource: body.data.updateSource ?? 'manual',
      changeSummary: body.data.changeSummary,
    });

    return NextResponse.json({ version }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create context version') },
      { status: 500 }
    );
  }
}
