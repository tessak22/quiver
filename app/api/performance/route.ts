/**
 * Performance API — app/api/performance/route.ts
 *
 * GET: List performance logs with optional filters (artifactId, campaignId).
 * POST: Create a new performance log entry, then trigger AI synthesis in the
 *   background to propose context updates based on the results.
 *
 * AI synthesis is non-blocking — the log entry is returned immediately while
 * the synthesis runs asynchronously. Synthesis failures are logged
 * so a logging action never fails due to AI issues.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { parseJsonBody, safeErrorMessage, parseISODate } from '@/lib/utils';
import { createPerformanceLog, getPerformanceLogs } from '@/lib/db/performance';
import { synthesizePerformance } from '@/lib/ai/synthesis-core';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const artifactId = url.searchParams.get('artifactId');
  const campaignId = url.searchParams.get('campaignId');

  try {
    const logs = await getPerformanceLogs({
      artifactId: artifactId ?? undefined,
      campaignId: campaignId ?? undefined,
    });

    return NextResponse.json({ logs });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to fetch performance logs') },
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

  if (!body.campaignId) {
    return NextResponse.json({ error: 'Campaign is required' }, { status: 400 });
  }

  // Validate date fields if provided
  const periodStart = typeof body.periodStart === 'string' ? parseISODate(body.periodStart) : undefined;
  const periodEnd = typeof body.periodEnd === 'string' ? parseISODate(body.periodEnd) : undefined;

  if (typeof body.periodStart === 'string' && !periodStart) {
    return NextResponse.json({ error: 'Invalid periodStart date' }, { status: 400 });
  }
  if (typeof body.periodEnd === 'string' && !periodEnd) {
    return NextResponse.json({ error: 'Invalid periodEnd date' }, { status: 400 });
  }

  try {
    // Create the log entry
    const log = await createPerformanceLog({
      artifactId: typeof body.artifactId === 'string' ? body.artifactId : undefined,
      campaignId: body.campaignId as string,
      logType: typeof body.logType === 'string' ? body.logType : 'artifact',
      metrics: isRecord(body.metrics) ? body.metrics : undefined,
      qualitativeNotes: typeof body.qualitativeNotes === 'string' ? body.qualitativeNotes : undefined,
      whatWorked: typeof body.whatWorked === 'string' ? body.whatWorked : undefined,
      whatDidnt: typeof body.whatDidnt === 'string' ? body.whatDidnt : undefined,
      recordedBy: auth.id,
      periodStart: periodStart ?? undefined,
      periodEnd: periodEnd ?? undefined,
    });

    // Trigger AI synthesis in background (non-blocking)
    synthesizePerformance(log.id, {
      whatWorked: typeof body.whatWorked === 'string' ? body.whatWorked : undefined,
      whatDidnt: typeof body.whatDidnt === 'string' ? body.whatDidnt : undefined,
      qualitativeNotes: typeof body.qualitativeNotes === 'string' ? body.qualitativeNotes : undefined,
      metrics: isRecord(body.metrics) ? body.metrics : undefined,
    }).catch((err: unknown) => console.error('[synthesis] Background synthesis failed:', err));

    return NextResponse.json({ log }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to create performance log') },
      { status: 500 }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
