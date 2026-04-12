/**
 * Pattern Report API — app/api/performance/pattern-report/route.ts
 *
 * POST: Analyzes recent performance data (last 30 days) using AI to identify
 *   patterns — what's working, what's not, emerging trends, and recommended
 *   context updates. Saves the generated report as an artifact under the
 *   default campaign.
 *
 * Requires at least one performance log entry in the last 30 days.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { safeErrorMessage } from '@/lib/utils';
import { aiRateLimiter } from '@/lib/rate-limit';
import { sendMessage } from '@/lib/ai/client';
import { createArtifact } from '@/lib/db/artifacts';
import { getDefaultCampaign } from '@/lib/db/campaigns';
import { getRecentPerformanceLogs } from '@/lib/db/performance';

export async function POST() {
  const auth = await requireRole('member');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!aiRateLimiter.check(auth.id)) {
    return NextResponse.json({ error: 'Too many AI requests. Please wait.' }, { status: 429 });
  }

  try {
    // Get performance logs from last 30 days
    const recentLogs = await getRecentPerformanceLogs(30);

    if (recentLogs.length === 0) {
      return NextResponse.json(
        { error: 'No performance data in the last 30 days' },
        { status: 400 }
      );
    }

    const logSummary = recentLogs.map((log) => ({
      artifact: log.artifact?.title || 'Campaign-level',
      type: log.artifact?.type || log.logType,
      campaign: log.campaign.name,
      whatWorked: log.whatWorked,
      whatDidnt: log.whatDidnt,
      metrics: log.metrics,
    }));

    const result = await sendMessage({
      system: 'You are a marketing performance analyst. Produce clear, actionable pattern reports.',
      messages: [{
        role: 'user',
        content: `Analyze these performance results from the last 30 days and produce a pattern report:

${JSON.stringify(logSummary, null, 2)}

Structure your report as:
## What's Working
## What's Not Working
## Emerging Patterns
## Recommended Context Updates
## Action Items for Next 30 Days`,
      }],
      maxTokens: 4096,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    // Find the default campaign for the pattern report artifact
    const unassigned = await getDefaultCampaign();

    if (!unassigned) {
      return NextResponse.json({ error: 'No campaign available' }, { status: 500 });
    }

    const now = new Date();
    const monthYear = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(now);

    // Save as artifact
    const artifact = await createArtifact({
      title: `Pattern Report — ${monthYear}`,
      type: 'other',
      content: result.content,
      campaignId: unassigned.id,
      createdBy: auth.id,
    });

    return NextResponse.json({ artifact, content: result.content });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to generate pattern report') },
      { status: 500 }
    );
  }
}
