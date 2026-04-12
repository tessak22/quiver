import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { findCampaignMatchesByName } from '@/lib/db/campaigns';
import {
  getCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
} from '@/lib/db/campaigns';
import { text, error } from '../lib/response.js';
import type { CampaignStatus, CampaignPriority } from '@/types';

export function registerCampaignTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // list_campaigns
  // -----------------------------------------------------------------------
  server.tool(
    'list_campaigns',
    'List campaigns. Defaults to active campaigns only.',
    {
      status: z
        .enum(['planning', 'active', 'paused', 'complete', 'archived', 'all'])
        .optional()
        .default('active')
        .describe('Filter by campaign status, or "all" for every campaign'),
    },
    async ({ status }) => {
      try {
        const filter = status === 'all' ? undefined : { status: status as CampaignStatus };
        const campaigns = await getCampaigns(filter);
        const summaries = campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          priority: c.priority,
          channels: c.channels,
          artifacts: c._count.artifacts,
          sessions: c._count.sessions,
          performanceLogs: c._count.performanceLogs,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }));
        return text(JSON.stringify(summaries, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] list_campaigns error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to list campaigns'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_campaign
  // -----------------------------------------------------------------------
  server.tool(
    'get_campaign',
    'Get full details for a specific campaign including linked sessions, artifacts, and performance log entries.',
    {
      campaign_id: z.string().optional().describe('Campaign ID (exact)'),
      name: z
        .string()
        .optional()
        .describe('Campaign name (case-insensitive partial match)'),
    },
    async ({ campaign_id, name }) => {
      try {
        if (!campaign_id && !name) {
          return error('Provide either campaign_id or name.');
        }

        if (campaign_id) {
          const campaign = await getCampaign(campaign_id);
          if (!campaign) {
            const all = await getCampaigns();
            const names = all.map((c) => c.name).join(', ');
            return error(
              `No campaign found with ID '${campaign_id}'. Active campaigns: ${names || 'none'}`
            );
          }
          return text(JSON.stringify(campaign, null, 2));
        }

        // Name-based search: case-insensitive partial match (Postgres)
        if (!name) {
          return error('Provide either campaign_id or name.');
        }
        const matches = await findCampaignMatchesByName(name);

        if (matches.length === 0) {
          const all = await getCampaigns();
          const names = all.map((c) => c.name).join(', ');
          return error(
            `No campaign found matching '${name}'. Active campaigns: ${names || 'none'}`
          );
        }

        if (matches.length === 1) {
          const campaign = await getCampaign(matches[0].id);
          if (!campaign) {
            const all = await getCampaigns();
            const names = all.map((c) => c.name).join(', ');
            return error(
              `No campaign found matching '${name}'. Active campaigns: ${names || 'none'}`
            );
          }
          return text(JSON.stringify(campaign, null, 2));
        }

        const list = matches.map((c) => `${c.name} (${c.id})`).join(', ');
        return text(
          `Found ${matches.length} campaigns matching '${name}': ${list}. Which did you mean? Provide the campaign_id.`
        );
      } catch (err) {
        console.error('[quiver-mcp] get_campaign error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to fetch campaign'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // create_campaign
  // -----------------------------------------------------------------------
  server.tool(
    'create_campaign',
    'Create a new campaign.',
    {
      name: z.string().describe('Campaign name'),
      description: z.string().optional().describe('Campaign description'),
      goal: z.string().optional().describe('Campaign goal'),
      channels: z.array(z.string()).optional().describe('Marketing channels'),
      priority: z
        .enum(['high', 'medium', 'low'])
        .optional()
        .default('medium')
        .describe('Campaign priority'),
      start_date: z.string().optional().describe('Start date (ISO format)'),
      end_date: z.string().optional().describe('End date (ISO format)'),
    },
    async ({ name, description, goal, channels, priority, start_date, end_date }) => {
      try {
        const campaign = await createCampaign({
          name,
          description,
          goal,
          channels,
          priority: priority as CampaignPriority,
          startDate: start_date,
          endDate: end_date,
        });
        return text(JSON.stringify(campaign, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] create_campaign error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to create campaign'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // update_campaign
  // -----------------------------------------------------------------------
  server.tool(
    'update_campaign',
    'Update any fields on a campaign — name, description, goal, channels, dates, priority.',
    {
      campaign_id: z.string().describe('Campaign ID'),
      name: z.string().optional().describe('New name'),
      description: z.string().optional().describe('New description'),
      goal: z.string().optional().describe('New goal'),
      channels: z.array(z.string()).optional().describe('New channels'),
      priority: z
        .enum(['high', 'medium', 'low'])
        .optional()
        .describe('New priority'),
      start_date: z.string().optional().describe('New start date (ISO format)'),
      end_date: z.string().optional().describe('New end date (ISO format)'),
    },
    async ({ campaign_id, name, description, goal, channels, priority, start_date, end_date }) => {
      try {
        const campaign = await updateCampaign(campaign_id, {
          name,
          description,
          goal,
          channels,
          priority: priority as CampaignPriority | undefined,
          startDate: start_date,
          endDate: end_date,
        });
        return text(JSON.stringify(campaign, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] update_campaign error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to update campaign'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // update_campaign_status
  // -----------------------------------------------------------------------
  server.tool(
    'update_campaign_status',
    'Change the status of a campaign.',
    {
      campaign_id: z.string().describe('Campaign ID'),
      status: z
        .enum(['planning', 'active', 'paused', 'complete', 'archived'])
        .describe('New campaign status'),
    },
    async ({ campaign_id, status }) => {
      try {
        const campaign = await updateCampaign(campaign_id, {
          status: status as CampaignStatus,
        });
        return text(JSON.stringify(campaign, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] update_campaign_status error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to update campaign status'
        );
      }
    }
  );
}
