import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyContextUpdates } from '@/lib/db/context';
import {
  getPendingProposals,
  getPerformanceLog,
  updatePerformanceLog,
} from '@/lib/db/performance';
import type { ContextUpdateProposal } from '@/types';

// GET — fetch all pending context update proposals
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const logs = await getPendingProposals();

  return NextResponse.json({ proposals: logs });
}

// PATCH — approve or reject a proposal
export async function PATCH(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: {
    logId?: string;
    action?: string;
    modifiedUpdates?: ContextUpdateProposal[];
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { logId, action, modifiedUpdates } = body;

  if (!logId || !action || !['approved', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Update the log entry status
  await updatePerformanceLog(logId, {
    contextUpdateStatus: action,
    ...(modifiedUpdates ? { proposedContextUpdates: modifiedUpdates } : {}),
  });

  // If approved, apply the updates to create a new context version
  if (action === 'approved') {
    const log = await getPerformanceLog(logId);

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

      // Build the update object from proposals
      const contextData: Record<string, unknown> = {};
      for (const update of updates) {
        contextData[update.field] = update.proposed;
      }

      await applyContextUpdates(
        contextData,
        user.id,
        'AI-proposed update approved from performance log'
      );
    }
  }

  return NextResponse.json({ success: true });
}
