/**
 * Pattern Report Generator — lib/ai/pattern-report.ts
 *
 * What it does: Generates a monthly pattern report by reading all PerformanceLog
 *   entries from the past 30 days, synthesizing them through a non-streaming
 *   Anthropic call, and saving the output as an Artifact (type: 'other').
 *
 * What it reads from: PerformanceLog entries (whatWorked, whatDidnt, notes,
 *   metrics) recorded in the past 30 days.
 *
 * What it produces: An Artifact with title "Pattern Report — [Month YYYY]",
 *   type 'other', status 'draft', createdBy 'cron'. If the AI output contains
 *   context proposals (parsed JSON), also creates a PerformanceLog entry with
 *   logType 'context_proposal'.
 *
 * CRITICAL: This file has NO Next.js-specific imports. It must be importable
 *   from the MCP server (plain Node.js).
 *
 * Edge cases:
 *   - Fewer than 5 PerformanceLog entries in past 30 days: returns
 *     { skipped: true, reason: 'insufficient_data' }. No artifact created.
 *   - AI returns invalid JSON in output: treated as plain text content, no
 *     context proposals extracted. Never throws.
 *   - AI API error: logs to stderr, rethrows as structured error object.
 *   - No default campaign found: proposal log is skipped, artifact still saved.
 */

import { prisma } from '@/lib/db';
import { sendMessage } from '@/lib/ai/client';
import { getDefaultCampaign } from '@/lib/db/campaigns';
import { createPerformanceLog } from '@/lib/db/performance';
import { createNotificationsForAllMembers } from '@/lib/db/notifications';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

export type PatternReportResult =
  | { skipped: true; reason: 'insufficient_data' }
  | {
      skipped: false;
      artifactId: string;
      title: string;
      proposalCount: number;
    }
  | { skipped: false; error: string };

interface ContextProposal {
  field: string;
  current: string;
  proposed: string;
  rationale: string;
}

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const MIN_LOG_ENTRIES = 5;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// -------------------------------------------------------------------------
// Main export
// -------------------------------------------------------------------------

/**
 * Generates a monthly pattern report from the past 30 days of PerformanceLogs.
 * Returns a skipped result if insufficient data, otherwise creates and returns
 * the saved Artifact.
 */
export async function generatePatternReport(): Promise<PatternReportResult> {
  try {
    // 1. Fetch PerformanceLog entries from the past 30 days
    const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
    const logs = await prisma.performanceLog.findMany({
      where: { recordedAt: { gte: thirtyDaysAgo } },
    });

    // 2. Guard: insufficient data
    if (logs.length < MIN_LOG_ENTRIES) {
      return { skipped: true, reason: 'insufficient_data' };
    }

    // 3. Build prompt
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(logs);

    // 4. Non-streaming AI call — matches pattern in lib/ai/research.ts
    const result = await sendMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 2048,
    });

    if (result.error) {
      console.error(
        '[pattern-report] AI call failed:',
        result.error.code,
        result.error.message
      );
      return { skipped: false, error: result.error.message };
    }

    const aiOutput = result.content;

    // 5. Build title using Intl.DateTimeFormat with explicit locale
    const title = `Pattern Report — ${new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date())}`;

    // 6. Resolve default campaign for artifact association
    const defaultCampaign = await getDefaultCampaign();
    const campaignId = defaultCampaign?.id;

    if (!campaignId) {
      console.error('[pattern-report] No default campaign found. Cannot save artifact.');
      return { skipped: false, error: 'No default campaign found' };
    }

    // 7. Save artifact
    const artifact = await prisma.artifact.create({
      data: {
        title,
        type: 'other',
        content: aiOutput,
        status: 'draft',
        createdBy: 'cron',
        campaignId,
      },
    });

    // 8. Parse context proposals from AI output (best-effort JSON parse)
    const proposals = extractContextProposals(aiOutput);
    let proposalCount = 0;

    if (proposals.length > 0) {
      await createPerformanceLog({
        logType: 'context_proposal',
        proposedContextUpdates: proposals,
        campaignId,
        qualitativeNotes: `Pattern report context proposals — ${title}`,
        recordedBy: 'cron',
      });
      proposalCount = proposals.length;

      void createNotificationsForAllMembers({
        type: 'context_proposal',
        title: `${proposals.length} context update${proposals.length > 1 ? 's' : ''} proposed`,
        body: `The monthly pattern report identified ${proposals.length} suggested update${proposals.length > 1 ? 's' : ''} to your positioning, ICP, or hypotheses.`,
        linkUrl: '/context',
      }).catch((err) => {
        console.error('[pattern-report] Failed to create context_proposal notifications:', err);
      });
    }

    return {
      skipped: false,
      artifactId: artifact.id,
      title: artifact.title,
      proposalCount,
    };
  } catch (err) {
    console.error('[pattern-report] Unexpected error during generation:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { skipped: false, error: message };
  }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return [
    'You are a marketing analytics expert synthesizing monthly performance patterns.',
    '',
    'Your job is to analyze performance log entries from the past 30 days and produce',
    'a concise, actionable monthly insights report.',
    '',
    '## Instructions',
    '',
    'Review all provided performance log entries and produce a report that includes:',
    '',
    '1. **Key Patterns** — What consistently worked or failed across campaigns.',
    '2. **Top Wins** — The highest-impact tactics or results.',
    '3. **Key Learnings** — What the team should carry forward.',
    '4. **Recommendations** — 2–4 concrete actions for the next month.',
    '',
    'If the patterns suggest updates to product positioning, ICP definition, customer',
    'language, or active hypotheses, include a JSON block at the END of your response',
    'with the following exact structure (and nothing else after it):',
    '',
    '```json',
    '{',
    '  "contextProposals": [',
    '    {',
    '      "field": "positioningStatement|icpDefinition|customerLanguage|activeHypotheses",',
    '      "current": "current value",',
    '      "proposed": "proposed new value",',
    '      "rationale": "evidence-based reason"',
    '    }',
    '  ]',
    '}',
    '```',
    '',
    'If no context updates are warranted, omit the JSON block entirely.',
    'Write in a clear, professional tone suitable for a marketing team retrospective.',
  ].join('\n');
}

function buildUserMessage(
  logs: Array<{
    id: string;
    logType: string;
    whatWorked: string | null;
    whatDidnt: string | null;
    qualitativeNotes: string | null;
    metrics: unknown;
    campaignId: string;
    recordedAt: Date;
  }>
): string {
  const parts: string[] = [
    `## Performance Logs — Past 30 Days (${logs.length} entries)`,
    '',
  ];

  for (const log of logs) {
    parts.push(`### Log Entry (${log.recordedAt.toISOString().slice(0, 10)})`);
    parts.push(`**Log Type:** ${log.logType}`);
    if (log.whatWorked) parts.push(`**What Worked:** ${log.whatWorked}`);
    if (log.whatDidnt) parts.push(`**What Didn't Work:** ${log.whatDidnt}`);
    if (log.qualitativeNotes) parts.push(`**Notes:** ${log.qualitativeNotes}`);
    if (log.metrics) {
      parts.push(`**Metrics:** ${JSON.stringify(log.metrics)}`);
    }
    parts.push('');
  }

  parts.push('Please synthesize the above into a monthly pattern report.');
  return parts.join('\n');
}

function extractContextProposals(aiOutput: string): ContextProposal[] {
  // Look for a JSON block at the end of the AI output
  const jsonMatch = aiOutput.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (!jsonMatch) {
    // Also try bare JSON object as fallback
    const bareMatch = aiOutput.match(/\{[\s\S]*"contextProposals"[\s\S]*\}/);
    if (!bareMatch) return [];
    try {
      const parsed = JSON.parse(bareMatch[0]) as Record<string, unknown>;
      return validateProposals(parsed);
    } catch {
      return [];
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]) as Record<string, unknown>;
    return validateProposals(parsed);
  } catch {
    return [];
  }
}

function validateProposals(parsed: Record<string, unknown>): ContextProposal[] {
  if (!Array.isArray(parsed.contextProposals)) return [];
  return (parsed.contextProposals as unknown[]).filter(
    (p): p is ContextProposal =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as Record<string, unknown>).field === 'string' &&
      typeof (p as Record<string, unknown>).proposed === 'string'
  ).map((p) => ({
    field: p.field,
    current: typeof p.current === 'string' ? p.current : '',
    proposed: p.proposed,
    rationale: typeof p.rationale === 'string' ? p.rationale : '',
  }));
}
