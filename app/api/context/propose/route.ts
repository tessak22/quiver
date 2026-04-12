import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { getActiveContext } from '@/lib/db/context';
import { getSession } from '@/lib/db/sessions';
import { getDefaultCampaign } from '@/lib/db/campaigns';
import { createPerformanceLog } from '@/lib/db/performance';

const VALID_CONTEXT_FIELDS = [
  'positioningStatement',
  'icpDefinition',
  'messagingPillars',
  'competitiveLandscape',
  'customerLanguage',
  'proofPoints',
  'activeHypotheses',
  'brandVoice',
] as const;

type ContextField = (typeof VALID_CONTEXT_FIELDS)[number];

function isValidContextField(value: string): value is ContextField {
  return VALID_CONTEXT_FIELDS.includes(value as ContextField);
}

function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

export async function POST(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as { field?: string; proposedValue?: string; sessionId?: string };

  const { field, proposedValue, sessionId } = body;

  if (!field || !isValidContextField(field)) {
    return NextResponse.json(
      { error: `Invalid context field. Must be one of: ${VALID_CONTEXT_FIELDS.join(', ')}` },
      { status: 400 }
    );
  }

  if (!proposedValue || typeof proposedValue !== 'string' || !proposedValue.trim()) {
    return NextResponse.json(
      { error: 'Proposed value is required' },
      { status: 400 }
    );
  }

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json(
      { error: 'Session ID is required' },
      { status: 400 }
    );
  }

  try {
    // Verify session exists
    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get current active context value
    const activeContext = await getActiveContext();
    const currentValue = activeContext ? safeStringify(activeContext[field]) : '';

    // We need a campaignId for the performance log.
    // Use the session's campaign if available, otherwise use the default campaign.
    let campaignId = session.campaignId;
    if (!campaignId) {
      const defaultCampaign = await getDefaultCampaign();
      if (!defaultCampaign) {
        return NextResponse.json(
          { error: 'No campaign associated with this session and no default campaign exists' },
          { status: 400 }
        );
      }
      campaignId = defaultCampaign.id;
    }

    // Create performance log with proposed context update
    await createPerformanceLog({
      campaignId,
      logType: 'campaign',
      qualitativeNotes: `Context update proposed from session: ${session.title ?? 'Untitled'}`,
      proposedContextUpdates: [
        {
          field,
          current: currentValue,
          proposed: proposedValue.trim(),
          rationale: 'Proposed from session',
        },
      ],
      recordedBy: auth.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create context proposal') },
      { status: 500 }
    );
  }
}
