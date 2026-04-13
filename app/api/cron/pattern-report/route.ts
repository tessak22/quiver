/**
 * Cron Route — /api/cron/pattern-report
 *
 * What it does: Vercel cron handler that triggers monthly pattern report
 *   generation. Invoked at 00:00 on the first of each month (0 0 1 * *).
 *
 * Auth: Vercel sends the CRON_SECRET as a Bearer token in the Authorization
 *   header. If the token is missing or wrong, responds 401. In development
 *   with no CRON_SECRET set, auth is skipped with a warning.
 *
 * What it produces: Calls generatePatternReport(), which creates an Artifact
 *   (type: 'other') if sufficient PerformanceLog data exists.
 *
 * Edge cases:
 *   - Fewer than 5 logs: returns 200 with { skipped: true, reason }
 *   - AI error: returns 200 with { skipped: false, error } — not a 500,
 *     since Vercel cron retries on 5xx responses
 *   - Unexpected throw: returns 500 with { error: message }
 */

import { NextResponse } from 'next/server';
import { generatePatternReport } from '@/lib/ai/pattern-report';
import { createNotificationsForAllMembers } from '@/lib/db/notifications';

export async function GET(request: Request): Promise<NextResponse> {
  // -------------------------------------------------------------------------
  // Auth check — Vercel passes CRON_SECRET as Bearer token
  // -------------------------------------------------------------------------
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV !== 'development') {
      // In production, refuse to run without a secret configured
      return NextResponse.json(
        { error: 'CRON_SECRET is not configured' },
        { status: 500 }
      );
    }
    // In development, warn and continue
    console.warn(
      '[cron/pattern-report] CRON_SECRET is not set — skipping auth check in development'
    );
  } else {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // -------------------------------------------------------------------------
  // Run report generation
  // -------------------------------------------------------------------------
  try {
    const result = await generatePatternReport();

    // Fan-out in-app notification to all members with the type enabled
    if (!('skipped' in result) || !result.skipped) {
      const monthLabel = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
      }).format(new Date());
      await createNotificationsForAllMembers({
        type: 'pattern_report',
        title: `Pattern Report — ${monthLabel}`,
        body: 'Your monthly marketing pattern report is ready. Review insights and context proposals.',
        linkUrl: '/artifacts',
      }).catch((err) => {
        // Non-fatal — log but don't fail the cron run
        console.error('[cron/pattern-report] Failed to create notifications:', err);
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[cron/pattern-report] Unexpected error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
