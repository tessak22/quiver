import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/db';
import { getActiveContext } from '@/lib/db/context';
import { getPendingProposals } from '@/lib/db/performance';
import { getReminders } from '@/lib/db/artifacts';
import { text, error } from '../lib/response.js';

export function registerWorkspaceTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // get_dashboard_summary
  // -----------------------------------------------------------------------
  server.tool(
    'get_dashboard_summary',
    'Get a summary of the current Quiver workspace — active campaigns, recent activity, close-the-loop queue count, current context version number, and pending proposal count. Call this first to orient yourself before doing other work.',
    async () => {
      try {
        const [
          contextResult,
          campaignsResult,
          proposalsResult,
          remindersResult,
          sessionsResult,
          artifactsResult,
        ] = await Promise.allSettled([
          getActiveContext(),
          prisma.campaign.count({ where: { status: 'active' } }),
          getPendingProposals(),
          getReminders(),
          prisma.session.findMany({
            where: { isArchived: false },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { title: true, mode: true, updatedAt: true },
          }),
          prisma.artifact.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { title: true, type: true, status: true },
          }),
        ]);

        const context = contextResult.status === 'fulfilled' ? contextResult.value : null;
        const campaigns = campaignsResult.status === 'fulfilled' ? campaignsResult.value : 0;
        const proposals = proposalsResult.status === 'fulfilled' ? proposalsResult.value : [];
        const reminders = remindersResult.status === 'fulfilled' ? remindersResult.value : [];
        const sessions = sessionsResult.status === 'fulfilled' ? sessionsResult.value : [];
        const artifacts = artifactsResult.status === 'fulfilled' ? artifactsResult.value : [];

        const summary = {
          context_version: context?.version ?? 0,
          context_last_updated: context?.createdAt ?? null,
          active_campaigns: campaigns,
          pending_proposals: proposals.length,
          close_the_loop_queue: reminders.length,
          recent_sessions: sessions.map((s) => ({
            title: s.title,
            mode: s.mode,
            updated_at: s.updatedAt,
          })),
          recent_artifacts: artifacts.map((a) => ({
            title: a.title,
            type: a.type,
            status: a.status,
          })),
        };

        return text(JSON.stringify(summary, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_dashboard_summary error:', err);
        return error(
          err instanceof Error
            ? err.message
            : 'Failed to fetch dashboard summary'
        );
      }
    }
  );
}
