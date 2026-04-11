/**
 * Performance API — app/api/performance/route.ts
 *
 * GET: List performance logs with optional filters (artifactId, campaignId).
 * POST: Create a new performance log entry, then trigger AI synthesis in the
 *   background to propose context updates based on the results.
 *
 * AI synthesis is non-blocking — the log entry is returned immediately while
 * the synthesis runs asynchronously. Synthesis failures are silently caught
 * so a logging action never fails due to AI issues.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createPerformanceLog, getPerformanceLogs } from '@/lib/db/performance';
import { synthesizePerformance } from '@/lib/ai/synthesis-core';

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(request.url);
  const artifactId = url.searchParams.get('artifactId');
  const campaignId = url.searchParams.get('campaignId');

  const logs = await getPerformanceLogs({
    artifactId: artifactId ?? undefined,
    campaignId: campaignId ?? undefined,
  });

  return NextResponse.json({ logs });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.campaignId) {
    return NextResponse.json({ error: 'Campaign is required' }, { status: 400 });
  }

  // Create the log entry
  const log = await createPerformanceLog({
    artifactId: typeof body.artifactId === 'string' ? body.artifactId : undefined,
    campaignId: body.campaignId as string,
    logType: typeof body.logType === 'string' ? body.logType : 'artifact',
    metrics: isRecord(body.metrics) ? body.metrics : undefined,
    qualitativeNotes: typeof body.qualitativeNotes === 'string' ? body.qualitativeNotes : undefined,
    whatWorked: typeof body.whatWorked === 'string' ? body.whatWorked : undefined,
    whatDidnt: typeof body.whatDidnt === 'string' ? body.whatDidnt : undefined,
    recordedBy: user.id,
    periodStart: typeof body.periodStart === 'string' ? new Date(body.periodStart) : undefined,
    periodEnd: typeof body.periodEnd === 'string' ? new Date(body.periodEnd) : undefined,
  });

  // Trigger AI synthesis in background (non-blocking)
  synthesizePerformance(log.id, {
    whatWorked: typeof body.whatWorked === 'string' ? body.whatWorked : undefined,
    whatDidnt: typeof body.whatDidnt === 'string' ? body.whatDidnt : undefined,
    qualitativeNotes: typeof body.qualitativeNotes === 'string' ? body.qualitativeNotes : undefined,
    metrics: isRecord(body.metrics) ? body.metrics : undefined,
  }).catch(() => {
    // Synthesis is best-effort, don't fail the log entry
  });

  return NextResponse.json({ log });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
