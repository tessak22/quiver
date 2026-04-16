import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  getArtifact,
  getArtifacts,
  createArtifact,
  createArtifactVersion,
  transitionArtifactStatus,
} from '@/lib/db/artifacts';
import { text, error } from '../lib/response.js';
import { resolveCampaignId } from '../lib/resolvers.js';

export function registerArtifactTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // list_artifacts
  // -----------------------------------------------------------------------
  server.tool(
    'list_artifacts',
    'List artifacts with optional filtering.',
    {
      campaign_id: z.string().optional().describe('Filter by campaign ID'),
      campaign_name: z
        .string()
        .optional()
        .describe('Filter by campaign name (case-insensitive partial match)'),
      type: z.string().optional().describe('Filter by artifact type'),
      status: z
        .enum(['draft', 'review', 'approved', 'live', 'archived'])
        .optional()
        .describe('Filter by status'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('Maximum number of artifacts to return'),
    },
    async ({ campaign_id, campaign_name, type, status, limit }) => {
      try {
        const resolvedCampaignId = await resolveCampaignId(campaign_id, campaign_name);

        const artifacts = await getArtifacts({
          campaignId: resolvedCampaignId,
          type,
          status,
        });

        const sliced = artifacts.slice(0, limit);
        const summaries = sliced.map((a) => ({
          id: a.id,
          title: a.title,
          type: a.type,
          status: a.status,
          campaign: a.campaign?.name,
          skill_used: a.skillUsed,
          created_at: a.createdAt,
        }));
        return text(JSON.stringify(summaries, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] list_artifacts error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to list artifacts'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_artifact
  // -----------------------------------------------------------------------
  server.tool(
    'get_artifact',
    'Get the full content and metadata of a specific artifact including its performance log entries.',
    {
      artifact_id: z.string().optional().describe('Artifact ID (exact)'),
      title: z
        .string()
        .optional()
        .describe('Artifact title (case-insensitive partial match, returns most recent if multiple)'),
    },
    async ({ artifact_id, title }) => {
      try {
        if (!artifact_id && !title) {
          return error('Provide either artifact_id or title.');
        }

        if (artifact_id) {
          const artifact = await getArtifact(artifact_id);
          if (!artifact) {
            return error(`No artifact found with ID '${artifact_id}'.`);
          }
          return text(JSON.stringify(artifact, null, 2));
        }

        // Title-based search: case-insensitive partial match (Postgres)
        const matches = await prisma.artifact.findMany({
          where: { title: { contains: title, mode: 'insensitive' } },
          orderBy: { createdAt: 'desc' },
          include: {
            campaign: { select: { id: true, name: true } },
            session: { select: { id: true, title: true, mode: true } },
            contextVersion: { select: { id: true, version: true } },
            performanceLogs: { orderBy: { recordedAt: 'desc' }, take: 5 },
          },
        });

        if (matches.length === 0) {
          return error(`No artifact found matching '${title}'.`);
        }

        if (matches.length > 1) {
          const shown = matches.slice(0, 5);
          const list = shown.map((a) => `${a.title} (${a.id})`).join(', ');
          const suffix = matches.length > 5 ? ` … and ${matches.length - 5} more` : '';
          return text(
            `Found ${matches.length} artifacts matching '${title}': ${list}${suffix}. Provide the artifact_id.`
          );
        }

        return text(JSON.stringify(matches[0], null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_artifact error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to fetch artifact'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // save_artifact
  // -----------------------------------------------------------------------
  server.tool(
    'save_artifact',
    'Save a new artifact to the artifact library.',
    {
      title: z.string().describe('Artifact title'),
      type: z
        .enum([
          'copywriting', 'email_sequence', 'cold_email', 'social_content',
          'launch_strategy', 'content_strategy', 'positioning', 'messaging',
          'ad_creative', 'competitor_analysis', 'seo', 'cro', 'ab_test',
          'landing_page', 'one_pager', 'other',
        ])
        .describe('Artifact type'),
      content: z.string().describe('Artifact content (markdown)'),
      campaign_id: z.string().optional().describe('Campaign ID'),
      campaign_name: z
        .string()
        .optional()
        .describe('Campaign name (case-insensitive partial match)'),
      tags: z.array(z.string()).optional().describe('Tags'),
      skill_used: z.string().optional().describe('Skill used to generate this artifact'),
    },
    async ({ title, type, content, campaign_id, campaign_name, tags, skill_used }) => {
      try {
        const resolvedCampaignId = await resolveCampaignId(
          campaign_id,
          campaign_name,
          { fallbackToDefault: true }
        );

        if (content && content.length > 50000) {
          return error(JSON.stringify({
            error: 'content_too_large',
            message: `Content exceeds 50,000 character limit. Current length: ${content.length.toLocaleString()}. Split into multiple artifacts or shorten.`,
            current_length: content.length,
            limit: 50000,
          }));
        }

        const artifact = await createArtifact({
          title,
          type,
          content,
          campaignId: resolvedCampaignId!,
          tags,
          skillUsed: skill_used,
          createdBy: 'mcp',
        });
        return text(JSON.stringify(artifact, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] save_artifact error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to save artifact'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // update_artifact
  // -----------------------------------------------------------------------
  server.tool(
    'update_artifact',
    "Update an artifact's content, title, or tags. Creates a new version.",
    {
      artifact_id: z.string().describe('Artifact ID to update'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New content'),
      tags: z.array(z.string()).optional().describe('New tags'),
    },
    async ({ artifact_id, title, content, tags }) => {
      try {
        const existing = await getArtifact(artifact_id);
        if (!existing) {
          return error(`No artifact found with ID '${artifact_id}'.`);
        }

        const newVersion = await createArtifactVersion(artifact_id, {
          title: title ?? existing.title,
          content: content ?? existing.content,
          tags,
          createdBy: 'mcp',
        });

        const result = await getArtifact(newVersion.id);
        return text(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] update_artifact error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to update artifact'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // update_artifact_status
  // -----------------------------------------------------------------------
  server.tool(
    'update_artifact_status',
    'Update the status of an artifact. When set to live, automatically creates a close-the-loop reminder.',
    {
      artifact_id: z.string().describe('Artifact ID'),
      status: z
        .enum(['draft', 'review', 'approved', 'live', 'archived'])
        .describe('New status'),
    },
    async ({ artifact_id, status }) => {
      try {
        const updated = await transitionArtifactStatus(artifact_id, status, 'mcp');
        return text(JSON.stringify(updated, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] update_artifact_status error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to update artifact status'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // archive_artifact
  // -----------------------------------------------------------------------
  server.tool(
    'archive_artifact',
    "Archive an artifact by ID. Sets status to 'archived'. The artifact remains in the database and can be filtered out of list results.",
    {
      artifact_id: z.string().describe('Artifact ID'),
    },
    async ({ artifact_id }) => {
      try {
        const artifact = await prisma.artifact.findUnique({ where: { id: artifact_id } });
        if (!artifact) {
          return error(`Artifact ${artifact_id} not found.`);
        }
        await prisma.artifact.update({ where: { id: artifact_id }, data: { status: 'archived' } });
        return text(`Archived artifact '${artifact.title}' (${artifact_id}).`);
      } catch (err) {
        console.error('[quiver-mcp] archive_artifact error:', err);
        return error(
          err instanceof Error ? err.message : 'Failed to archive artifact'
        );
      }
    }
  );

  // -----------------------------------------------------------------------
  // delete_artifact
  // -----------------------------------------------------------------------
  server.tool(
    'delete_artifact',
    'Permanently delete an artifact. Child versions and linked performance logs/content pieces are detached (FK nulled). This cannot be undone.',
    {
      artifact_id: z.string().describe('Artifact ID to delete'),
    },
    async ({ artifact_id }) => {
      try {
        const existing = await prisma.artifact.findUnique({
          where: { id: artifact_id },
          select: { id: true, title: true },
        });
        if (!existing) {
          return error(`Artifact '${artifact_id}' not found.`);
        }

        await prisma.artifact.delete({ where: { id: artifact_id } });
        return text(`Deleted artifact '${existing.title}' (${artifact_id}).`);
      } catch (err) {
        console.error('[quiver-mcp] delete_artifact error:', err);
        return error(err instanceof Error ? err.message : 'Failed to delete artifact');
      }
    }
  );
}
