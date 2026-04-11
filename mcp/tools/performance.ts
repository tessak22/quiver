import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  createPerformanceLog,
  getPerformanceLogs,
  getPerformanceLog,
  getPendingProposals,
  updatePerformanceLog,
} from '@/lib/db/performance';
import { getReminders } from '@/lib/db/artifacts';
import { applyContextUpdates } from '@/lib/db/context';
import { synthesizePerformance } from '@/lib/ai/synthesis-core';
import { text, error } from '../lib/response.js';
import { resolveArtifactId, resolveCampaignId } from '../lib/resolvers.js';
import { CONTEXT_FIELDS } from '../lib/context-fields.js';
import type { ContextUpdateProposal } from '@/types';

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date '${value}'. Use ISO 8601 format (e.g. 2026-04-11).`);
  }
  return d;
}

export function registerPerformanceTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // log_performance
  // -----------------------------------------------------------------------
  server.tool(
    'log_performance',
    'Log performance results for an artifact or campaign. Accepts any metric names as key-value pairs. Triggers AI synthesis automatically and returns any proposed context updates in the response.',
    {
      artifact_id: z.string().optional().describe('Artifact ID'),
      artifact_title: z
        .string()
        .optional()
        .describe('Artifact title (case-insensitive partial match)'),
      campaign_id: z.string().optional().describe('Campaign ID'),
      campaign_name: z
        .string()
        .optional()
        .describe('Campaign name (case-insensitive partial match)'),
      metrics: z
        .record(z.union([z.string(), z.number()]))
        .optional()
        .describe('Metric name → value pairs (e.g. opens, replies, clicks)'),
      qualitative_notes: z.string().optional().describe('Qualitative notes'),
      what_worked: z.string().optional().describe('What worked'),
      what_didnt: z.string().optional().describe("What didn't work"),
      period_start: z.string().optional().describe('Period start (ISO date)'),
      period_end: z.string().optional().describe('Period end (ISO date)'),
    },
    async (args) => {
      try {
        const resolvedArtifactId = await resolveArtifactId(
          args.artifact_id,
          args.artifact_title
        );
        const resolvedCampaignId = await resolveCampaignId(
          args.campaign_id,
          args.campaign_name
        );

        if (!resolvedArtifactId && !resolvedCampaignId) {
          return error(
            'At least one of artifact_id, artifact_title, campaign_id, or campaign_name is required.'
          );
        }

        // If we have an artifact but no campaign, look up the artifact's campaign
        let campaignId = resolvedCampaignId;
        if (!campaignId && resolvedArtifactId) {
          const artifact = await prisma.artifact.findUnique({
            where: { id: resolvedArtifactId },
            select: { campaignId: true },
          });
          campaignId = artifact?.campaignId;
        }

        if (!campaignId) {
          return error(
            'Could not determine campaign. Provide campaign_id or campaign_name.'
          );
        }

        const log = await createPerformanceLog({
          artifactId: resolvedArtifactId,
          campaignId,
          logType: resolvedArtifactId ? 'artifact' : 'campaign',
          metrics: args.metrics as Record<string, unknown> | undefined,
          qualitativeNotes: args.qualitative_notes,
          whatWorked: args.what_worked,
          whatDidnt: args.what_didnt,
          recordedBy: 'mcp',
          periodStart: parseDate(args.period_start),
          periodEnd: parseDate(args.period_end),
        });

        // Trigger AI synthesis (best-effort)
        let synthesisResult = { proposals: [] as ContextUpdateProposal[] };
        try {
          synthesisResult = await synthesizePerformance(log.id, {
            whatWorked: args.what_worked,
            whatDidnt: args.what_didnt,
            qualitativeNotes: args.qualitative_notes,
            metrics: args.metrics as Record<string, unknown> | undefined,
          });
        } catch {
          // Synthesis is best-effort
        }

        return text(
          JSON.stringify(
            {
              log_id: log.id,
              synthesis_summary:
                synthesisResult.proposals.length > 0
                  ? `${synthesisResult.proposals.length} context update(s) proposed`
                  : 'No context updates proposed',
              proposed_context_updates: synthesisResult.proposals,
            },
            null,
            2
          )
        );
      } catch (err) {
        console.error('[quiver-mcp] log_performance error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to log performance'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_performance_log
  // -----------------------------------------------------------------------
  server.tool(
    'get_performance_log',
    'Get performance log entries for a campaign or artifact.',
    {
      campaign_id: z.string().optional().describe('Filter by campaign ID'),
      campaign_name: z
        .string()
        .optional()
        .describe('Filter by campaign name (case-insensitive partial match)'),
      artifact_id: z.string().optional().describe('Filter by artifact ID'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of entries to return'),
    },
    async ({ campaign_id, campaign_name, artifact_id, limit }) => {
      try {
        const resolvedCampaignId = await resolveCampaignId(
          campaign_id,
          campaign_name
        );

        const logs = await getPerformanceLogs({
          campaignId: resolvedCampaignId,
          artifactId: artifact_id,
        });

        return text(JSON.stringify(logs.slice(0, limit), null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_performance_log error:', err);
        return error(
          err instanceof Error
            ? err.message
            : 'Failed to fetch performance logs'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_close_the_loop_queue
  // -----------------------------------------------------------------------
  server.tool(
    'get_close_the_loop_queue',
    'List artifacts that are live but have not had results logged yet. due_date is when results are due (go-live + 14 days). days_overdue is positive when past due, negative when still upcoming.',
    {
      overdue_only: z
        .boolean()
        .optional()
        .default(false)
        .describe('Only show reminders whose due date has already passed'),
    },
    async ({ overdue_only }) => {
      try {
        const reminders = await getReminders();

        // Reminder rows are created with recordedAt = go-live + 14 days (the due date).
        // All date fields here use due-date semantics: due_date = recordedAt,
        // days_overdue = days since due date (positive = past due, negative = upcoming).
        const now = new Date();
        const items = reminders
          .filter((r) => {
            if (overdue_only) return r.recordedAt < now;
            return true;
          })
          .map((r) => ({
            artifact_id: r.artifact?.id,
            title: r.artifact?.title,
            type: r.artifact?.type,
            campaign_name: r.campaign?.name,
            due_date: r.recordedAt,
            days_overdue: Math.floor(
              (now.getTime() - r.recordedAt.getTime()) / (1000 * 60 * 60 * 24)
            ),
          }));

        return text(JSON.stringify(items, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_close_the_loop_queue error:', err);
        return error(
          err instanceof Error
            ? err.message
            : 'Failed to fetch close-the-loop queue'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // list_proposals
  // -----------------------------------------------------------------------
  server.tool(
    'list_proposals',
    'List pending context update proposals awaiting review.',
    {
      status: z
        .enum(['pending', 'approved', 'rejected', 'all'])
        .optional()
        .default('pending')
        .describe('Filter by proposal status'),
    },
    async ({ status }) => {
      try {
        if (status === 'pending') {
          const proposals = await getPendingProposals();
          return text(JSON.stringify(proposals, null, 2));
        }

        // For 'all', 'approved', 'rejected' — query directly
        const where =
          status === 'all'
            ? { proposedContextUpdates: { not: Prisma.AnyNull } }
            : {
                contextUpdateStatus: status,
                proposedContextUpdates: { not: Prisma.AnyNull },
              };

        const logs = await prisma.performanceLog.findMany({
          where,
          include: {
            artifact: { select: { id: true, title: true, type: true } },
            campaign: { select: { id: true, name: true } },
          },
          orderBy: { recordedAt: 'desc' },
        });

        return text(JSON.stringify(logs, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] list_proposals error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to list proposals'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // action_proposal
  // -----------------------------------------------------------------------
  server.tool(
    'action_proposal',
    'Approve or reject a pending context update proposal. Approving immediately applies the changes and creates a new context version.',
    {
      log_id: z.string().describe('Performance log ID containing the proposal'),
      action: z.enum(['approved', 'rejected']).describe('Action to take'),
      modified_updates: z
        .array(
          z.object({
            field: z.string(),
            current: z.string(),
            proposed: z.unknown(),
            rationale: z.string(),
          })
        )
        .optional()
        .describe('Optional: modify proposals before approving'),
    },
    async ({ log_id, action, modified_updates }) => {
      try {
        // Update the log entry status
        await updatePerformanceLog(log_id, {
          contextUpdateStatus: action,
          ...(modified_updates ? { proposedContextUpdates: modified_updates } : {}),
        });

        // If approved, apply the updates
        if (action === 'approved') {
          const log = await getPerformanceLog(log_id);

          if (log?.proposedContextUpdates) {
            const raw = modified_updates || log.proposedContextUpdates;

            if (!Array.isArray(raw)) {
              return error('Proposed context updates must be an array.');
            }

            const updates = (raw as unknown[]).filter(
              (item): item is ContextUpdateProposal =>
                typeof item === 'object' &&
                item !== null &&
                typeof (item as Record<string, unknown>).field === 'string' &&
                CONTEXT_FIELDS.has((item as Record<string, unknown>).field as string) &&
                'proposed' in (item as Record<string, unknown>)
            );

            const contextData: Record<string, unknown> = {};
            for (const update of updates) {
              contextData[update.field] = update.proposed;
            }

            const newVersion = await applyContextUpdates(
              contextData,
              'mcp',
              'AI-proposed update approved via MCP'
            );

            return text(
              JSON.stringify(
                { success: true, new_context_version_id: newVersion.id },
                null,
                2
              )
            );
          }
        }

        return text(JSON.stringify({ success: true }, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] action_proposal error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to action proposal'
        );
      }
    }
  );
}
