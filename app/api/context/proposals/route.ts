import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage } from '@/lib/utils';
import { applyContextUpdates } from '@/lib/db/context';
import {
  getPendingProposals,
  getPerformanceLog,
  updatePerformanceLog,
} from '@/lib/db/performance';
import type { ContextUpdateProposal } from '@/types';

/** Whitelist of valid context fields that proposals can update. */
const VALID_CONTEXT_FIELDS = new Set([
  'productName',
  'oneLiner',
  'icpDefinition',
  'coreProblem',
  'valuePillars',
  'competitorAnalysis',
  'positioningStatement',
  'keyMetrics',
  'channels',
  'toneVoice',
  'seasonalNotes',
]);

// GET — fetch all pending context update proposals
export async function GET() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const logs = await getPendingProposals();
    return NextResponse.json({ proposals: logs });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch proposals') },
      { status: 500 }
    );
  }
}

// PATCH — approve or reject a proposal
export async function PATCH(request: Request) {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = await parseJsonBody(request);
  if (parsed.error) return parsed.error;
  const body = parsed.data as {
    logId?: string;
    action?: string;
    modifiedUpdates?: ContextUpdateProposal[];
  };

  const { logId, action, modifiedUpdates } = body;

  if (!logId || !action || !['approved', 'rejected'].includes(action as string)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    // Update the log entry status
    await updatePerformanceLog(logId as string, {
      contextUpdateStatus: action,
      ...(modifiedUpdates ? { proposedContextUpdates: modifiedUpdates } : {}),
    });

    // If approved, apply the updates to create a new context version
    if (action === 'approved') {
      const log = await getPerformanceLog(logId as string);

      if (log?.proposedContextUpdates) {
        const raw = modifiedUpdates || log.proposedContextUpdates;

        // Runtime validation: ensure proposals is an array of objects with field + proposed
        if (!Array.isArray(raw)) {
          return NextResponse.json(
            { error: 'Proposed context updates must be an array' },
            { status: 400 }
          );
        }

        const updates = (raw as unknown[]).filter(
          (item): item is ContextUpdateProposal =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as Record<string, unknown>).field === 'string' &&
            'proposed' in (item as Record<string, unknown>)
        );

        // Build the update object from proposals, validating field names
        const contextData: Record<string, unknown> = {};
        for (const update of updates) {
          if (!VALID_CONTEXT_FIELDS.has(update.field)) {
            // Skip proposals with invalid field names
            continue;
          }
          contextData[update.field] = update.proposed;
        }

        if (Object.keys(contextData).length > 0) {
          await applyContextUpdates(
            contextData,
            auth.id,
            'AI-proposed update approved from performance log'
          );
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to update proposal') },
      { status: 500 }
    );
  }
}
