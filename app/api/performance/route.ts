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
import { createPerformanceLog, getPerformanceLogs, updatePerformanceLog } from '@/lib/db/performance';
import { getActiveContext } from '@/lib/db/context';
import { sendMessage } from '@/lib/ai/client';

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
  synthesizePerformance(log.id, body).catch(() => {
    // Synthesis is best-effort, don't fail the log entry
  });

  return NextResponse.json({ log });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function synthesizePerformance(
  logId: string,
  data: Record<string, unknown>
) {
  // Get active context for synthesis
  const activeContext = await getActiveContext();

  const contextSummary = activeContext?.positioningStatement || 'No active context';

  const whatWorked = typeof data.whatWorked === 'string' ? data.whatWorked : 'Not specified';
  const whatDidnt = typeof data.whatDidnt === 'string' ? data.whatDidnt : 'Not specified';
  const notes = typeof data.qualitativeNotes === 'string' ? data.qualitativeNotes : 'None';
  const metricsStr = isRecord(data.metrics) ? JSON.stringify(data.metrics) : 'None logged';

  const prompt = `You are analyzing performance results for a marketing team. Their product positioning: "${contextSummary}"

Results logged:
- What worked: ${whatWorked}
- What didn't: ${whatDidnt}
- Notes: ${notes}
- Metrics: ${metricsStr}

Based on these results, propose specific updates to the product marketing context. Return ONLY a JSON array:
[{"field": "fieldName", "current": "current value or unknown", "proposed": "proposed new value", "rationale": "why this change"}]

Fields you can propose changes to: positioningStatement, icpDefinition, messagingPillars, competitiveLandscape, customerLanguage, proofPoints, activeHypotheses, brandVoice, wordsToUse, wordsToAvoid

Only propose changes that are directly supported by the results. If no changes are warranted, return an empty array [].`;

  const result = await sendMessage({
    system: 'You are a marketing data analyst. Always return valid JSON arrays only.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2048,
  });

  if (result.error) return;

  try {
    // Use non-greedy match to capture the first JSON array only
    const jsonMatch = result.content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return;

    const proposals: unknown = JSON.parse(jsonMatch[0]);
    if (Array.isArray(proposals) && proposals.length > 0) {
      await updatePerformanceLog(logId, {
        proposedContextUpdates: proposals,
        contextUpdateStatus: 'pending',
      });
    }
  } catch {
    // Parse failure — synthesis is best-effort
  }
}
