import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  createContentPiece,
  updateContentPiece,
  getContentPiece,
  getContentPieceBySlug,
  getContentPieces,
  addDistribution,
  addMetricSnapshot,
  getMetricSnapshots,
  generateSlug,
  getContentPerformanceSignal,
  findContentPiecesByTitle,
  getContentPiecesForCalendar,
} from '@/lib/db/content';
import { getActiveContext } from '@/lib/db/context';
import { text, error } from '../lib/response.js';
import { resolveCampaignId } from '../lib/resolvers.js';

/**
 * Resolve a content piece by ID, slug, or title partial match.
 */
async function resolveContentPiece(
  contentId?: string,
  slug?: string,
  titlePartial?: string
) {
  if (contentId) {
    return getContentPiece(contentId);
  }

  if (slug) {
    return getContentPieceBySlug(slug);
  }

  if (titlePartial) {
    const matches = await findContentPiecesByTitle(titlePartial);

    if (matches.length === 0) {
      throw new Error(`No content found matching '${titlePartial}'.`);
    }
    if (matches.length > 1) {
      const list = matches.map((c) => `${c.title} (${c.id})`).join(', ');
      throw new Error(
        `Found ${matches.length} content pieces matching '${titlePartial}': ${list}. Provide the content_id.`
      );
    }

    return getContentPiece(matches[0].id);
  }

  return null;
}

export function registerContentTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // list_content
  // -----------------------------------------------------------------------
  server.tool(
    'list_content',
    'List content pieces with optional filters for status, content type, campaign, and limit.',
    {
      status: z.string().optional().describe('Filter by status (draft, review, approved, published, archived)'),
      content_type: z.string().optional().describe('Filter by content type (blog_post, case_study, etc.)'),
      campaign_name: z.string().optional().describe('Filter by campaign name (case-insensitive partial match)'),
      campaign_id: z.string().optional().describe('Filter by campaign ID'),
      limit: z.number().optional().default(20).describe('Maximum number of results (default 20)'),
    },
    async (args) => {
      try {
        const campaignId = await resolveCampaignId(args.campaign_id, args.campaign_name);

        const pieces = await getContentPieces({
          status: args.status,
          contentType: args.content_type,
          campaignId,
        });

        const results = pieces.slice(0, args.limit).map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          content_type: p.contentType,
          status: p.status,
          published_at: p.publishedAt,
          target_keyword: p.targetKeyword,
          campaign: p.campaign?.name ?? null,
          distribution_count: p.distributions.length,
          performance_signal: getContentPerformanceSignal(p.metricSnapshots),
        }));

        return text(JSON.stringify(results, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] list_content error:', err);
        return error(err instanceof Error ? err.message : 'Failed to list content');
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_content
  // -----------------------------------------------------------------------
  server.tool(
    'get_content',
    'Get full details for a content piece by ID, slug, or title partial match.',
    {
      content_id: z.string().optional().describe('Content piece ID'),
      slug: z.string().optional().describe('Content piece slug'),
      title: z.string().optional().describe('Content piece title (case-insensitive partial match)'),
    },
    async (args) => {
      try {
        const piece = await resolveContentPiece(args.content_id, args.slug, args.title);

        if (!piece) {
          return error('Content piece not found. Provide content_id, slug, or title.');
        }

        return text(JSON.stringify(piece, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_content error:', err);
        return error(err instanceof Error ? err.message : 'Failed to get content');
      }
    }
  );

  // -----------------------------------------------------------------------
  // save_content
  // -----------------------------------------------------------------------
  server.tool(
    'save_content',
    'Create a new content piece. Returns the created piece with its public API URL.',
    {
      title: z.string().describe('Content title'),
      body: z.string().describe('Content body (markdown)'),
      content_type: z.string().optional().default('blog_post').describe('Content type'),
      slug: z.string().optional().describe('URL slug (auto-generated if not provided)'),
      excerpt: z.string().optional().describe('Brief excerpt'),
      meta_title: z.string().optional().describe('SEO meta title'),
      meta_description: z.string().optional().describe('SEO meta description'),
      target_keyword: z.string().optional().describe('Primary target keyword'),
      secondary_keywords: z.array(z.string()).optional().describe('Secondary keywords'),
      canonical_url: z.string().optional().describe('Canonical URL'),
      og_title: z.string().optional().describe('OG title'),
      og_description: z.string().optional().describe('OG description'),
      og_image_url: z.string().optional().describe('OG image URL'),
      campaign_id: z.string().optional().describe('Campaign ID'),
      campaign_name: z.string().optional().describe('Campaign name'),
      status: z.string().optional().default('draft').describe('Initial status'),
    },
    async (args) => {
      try {
        // Validate content_type
        const VALID_CONTENT_TYPES = [
          'blog_post', 'case_study', 'landing_page', 'changelog',
          'newsletter', 'social_thread', 'video_script', 'doc', 'other',
        ] as const;
        if (!VALID_CONTENT_TYPES.includes(args.content_type as typeof VALID_CONTENT_TYPES[number])) {
          return error(
            `Invalid content_type '${args.content_type}'. Valid values: ${VALID_CONTENT_TYPES.join(', ')}`
          );
        }

        // Validate status
        const VALID_STATUSES = [
          'draft', 'review', 'approved', 'published', 'archived',
        ] as const;
        if (!VALID_STATUSES.includes(args.status as typeof VALID_STATUSES[number])) {
          return error(
            `Invalid status '${args.status}'. Valid values: ${VALID_STATUSES.join(', ')}`
          );
        }

        const campaignId = await resolveCampaignId(args.campaign_id, args.campaign_name);
        const activeContext = await getActiveContext();

        // 60s dedupe guard — if a matching content piece was just created,
        // return it instead of inserting a duplicate (handles Claude Desktop retries).
        const recentDuplicate = await prisma.contentPiece.findFirst({
          where: {
            title: args.title,
            contentType: args.content_type,
            createdBy: 'mcp',
            createdAt: { gte: new Date(Date.now() - 60_000) },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (recentDuplicate) {
          return text(
            JSON.stringify(
              {
                ...recentDuplicate,
                _duplicate: true,
                public_api_url: `/api/public/content/${recentDuplicate.slug}`,
              },
              null,
              2
            )
          );
        }

        const slug = args.slug || await generateSlug(args.title);

        const piece = await createContentPiece({
          title: args.title,
          slug,
          contentType: args.content_type,
          status: args.status,
          body: args.body,
          excerpt: args.excerpt,
          metaTitle: args.meta_title,
          metaDescription: args.meta_description,
          targetKeyword: args.target_keyword,
          secondaryKeywords: args.secondary_keywords,
          canonicalUrl: args.canonical_url,
          ogTitle: args.og_title,
          ogDescription: args.og_description,
          ogImageUrl: args.og_image_url,
          publishedAt: args.status === 'published' ? new Date() : undefined,
          campaignId,
          contextVersionId: activeContext?.id,
          createdBy: 'mcp',
        });

        return text(
          JSON.stringify(
            {
              ...piece,
              public_api_url: `/api/public/content/${piece.slug}`,
            },
            null,
            2
          )
        );
      } catch (err) {
        console.error('[quiver-mcp] save_content error:', err);
        return error(err instanceof Error ? err.message : 'Failed to save content');
      }
    }
  );

  // -----------------------------------------------------------------------
  // update_content
  // -----------------------------------------------------------------------
  server.tool(
    'update_content',
    'Update fields on an existing content piece.',
    {
      content_id: z.string().optional().describe('Content piece ID'),
      slug: z.string().optional().describe('Content piece slug (for lookup)'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New body'),
      content_type: z.string().optional().describe('New content type'),
      status: z.string().optional().describe('New status'),
      excerpt: z.string().optional().describe('New excerpt'),
      meta_title: z.string().optional().describe('New meta title'),
      meta_description: z.string().optional().describe('New meta description'),
      target_keyword: z.string().optional().describe('New target keyword'),
      secondary_keywords: z.array(z.string()).optional().describe('New secondary keywords'),
      canonical_url: z.string().optional().describe('New canonical URL'),
      og_title: z.string().optional().describe('New OG title'),
      og_description: z.string().optional().describe('New OG description'),
      og_image_url: z.string().optional().describe('New OG image URL'),
    },
    async (args) => {
      try {
        // Validate content_type if provided
        const VALID_CONTENT_TYPES = [
          'blog_post', 'case_study', 'landing_page', 'changelog',
          'newsletter', 'social_thread', 'video_script', 'doc', 'other',
        ] as const;
        if (
          args.content_type !== undefined &&
          !VALID_CONTENT_TYPES.includes(args.content_type as typeof VALID_CONTENT_TYPES[number])
        ) {
          return error(
            `Invalid content_type '${args.content_type}'. Valid values: ${VALID_CONTENT_TYPES.join(', ')}`
          );
        }

        // Validate status if provided
        const VALID_STATUSES = [
          'draft', 'review', 'approved', 'published', 'archived',
        ] as const;
        if (
          args.status !== undefined &&
          !VALID_STATUSES.includes(args.status as typeof VALID_STATUSES[number])
        ) {
          return error(
            `Invalid status '${args.status}'. Valid values: ${VALID_STATUSES.join(', ')}`
          );
        }

        const piece = await resolveContentPiece(args.content_id, args.slug);
        if (!piece) {
          return error('Content piece not found. Provide content_id or slug.');
        }

        const updateData: Record<string, unknown> = {};
        if (args.title !== undefined) updateData.title = args.title;
        if (args.body !== undefined) updateData.body = args.body;
        if (args.content_type !== undefined) updateData.contentType = args.content_type;
        if (args.status !== undefined) updateData.status = args.status;
        if (args.excerpt !== undefined) updateData.excerpt = args.excerpt;
        if (args.meta_title !== undefined) updateData.metaTitle = args.meta_title;
        if (args.meta_description !== undefined) updateData.metaDescription = args.meta_description;
        if (args.target_keyword !== undefined) updateData.targetKeyword = args.target_keyword;
        if (args.secondary_keywords !== undefined) updateData.secondaryKeywords = args.secondary_keywords;
        if (args.canonical_url !== undefined) updateData.canonicalUrl = args.canonical_url;
        if (args.og_title !== undefined) updateData.ogTitle = args.og_title;
        if (args.og_description !== undefined) updateData.ogDescription = args.og_description;
        if (args.og_image_url !== undefined) updateData.ogImageUrl = args.og_image_url;

        // If status changes to published and publishedAt is null, set it
        if (args.status === 'published' && !piece.publishedAt) {
          updateData.publishedAt = new Date();
        }

        const updated = await updateContentPiece(
          piece.id,
          updateData as Parameters<typeof updateContentPiece>[1]
        );

        return text(JSON.stringify(updated, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] update_content error:', err);
        return error(err instanceof Error ? err.message : 'Failed to update content');
      }
    }
  );

  // -----------------------------------------------------------------------
  // add_distribution
  // -----------------------------------------------------------------------
  server.tool(
    'add_distribution',
    'Record a distribution channel for a content piece.',
    {
      content_id: z.string().optional().describe('Content piece ID'),
      slug: z.string().optional().describe('Content piece slug'),
      channel: z.string().describe('Distribution channel (website, dev_to, hashnode, medium, newsletter, linkedin, twitter, youtube, other)'),
      url: z.string().optional().describe('Distribution URL'),
      status: z.string().optional().default('planned').describe('Distribution status'),
      notes: z.string().optional().describe('Notes'),
    },
    async (args) => {
      try {
        // Validate channel
        const VALID_CHANNELS = [
          'website', 'dev_to', 'hashnode', 'medium', 'newsletter',
          'linkedin', 'twitter', 'youtube', 'other',
        ] as const;
        if (!VALID_CHANNELS.includes(args.channel as typeof VALID_CHANNELS[number])) {
          return error(
            `Invalid channel '${args.channel}'. Valid values: ${VALID_CHANNELS.join(', ')}`
          );
        }

        const piece = await resolveContentPiece(args.content_id, args.slug);
        if (!piece) {
          return error('Content piece not found. Provide content_id or slug.');
        }

        const distribution = await addDistribution({
          contentPieceId: piece.id,
          channel: args.channel,
          url: args.url,
          status: args.status,
          notes: args.notes,
        });

        return text(JSON.stringify(distribution, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] add_distribution error:', err);
        return error(err instanceof Error ? err.message : 'Failed to add distribution');
      }
    }
  );

  // -----------------------------------------------------------------------
  // log_content_metrics
  // -----------------------------------------------------------------------
  server.tool(
    'log_content_metrics',
    'Log a metric snapshot for a content piece.',
    {
      content_id: z.string().optional().describe('Content piece ID'),
      slug: z.string().optional().describe('Content piece slug'),
      pageviews: z.number().optional().describe('Pageviews'),
      unique_visitors: z.number().optional().describe('Unique visitors'),
      avg_time_on_page: z.number().optional().describe('Avg time on page in seconds'),
      bounce_rate: z.number().optional().describe('Bounce rate (0-100)'),
      organic_clicks: z.number().optional().describe('Organic clicks'),
      impressions: z.number().optional().describe('Search impressions'),
      avg_position: z.number().optional().describe('Average search position'),
      ctr: z.number().optional().describe('Click-through rate (0-100)'),
      social_shares: z.number().optional().describe('Social shares'),
      backlinks: z.number().optional().describe('Backlinks count'),
      comments: z.number().optional().describe('Comments count'),
      signups: z.number().optional().describe('Signups attributed'),
      conversion_rate: z.number().optional().describe('Conversion rate (0-100)'),
      notes: z.string().optional().describe('Notes about this snapshot'),
    },
    async (args) => {
      try {
        const piece = await resolveContentPiece(args.content_id, args.slug);
        if (!piece) {
          return error('Content piece not found. Provide content_id or slug.');
        }

        const snapshot = await addMetricSnapshot({
          contentPieceId: piece.id,
          snapshotDate: new Date(),
          pageviews: args.pageviews,
          uniqueVisitors: args.unique_visitors,
          avgTimeOnPage: args.avg_time_on_page,
          bounceRate: args.bounce_rate,
          organicClicks: args.organic_clicks,
          impressions: args.impressions,
          avgPosition: args.avg_position,
          ctr: args.ctr,
          socialShares: args.social_shares,
          backlinks: args.backlinks,
          comments: args.comments,
          signups: args.signups,
          conversionRate: args.conversion_rate,
          source: 'mcp_pull',
          notes: args.notes,
          recordedBy: 'mcp',
        });

        return text(JSON.stringify(snapshot, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] log_content_metrics error:', err);
        return error(err instanceof Error ? err.message : 'Failed to log metrics');
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_content_metrics
  // -----------------------------------------------------------------------
  server.tool(
    'get_content_metrics',
    'Get metric history for a content piece with trend summary (growing, flat, or declining).',
    {
      content_id: z.string().optional().describe('Content piece ID'),
      slug: z.string().optional().describe('Content piece slug'),
      limit: z.number().optional().default(24).describe('Number of snapshots to return'),
    },
    async (args) => {
      try {
        const piece = await resolveContentPiece(args.content_id, args.slug);
        if (!piece) {
          return error('Content piece not found. Provide content_id or slug.');
        }

        const snapshots = await getMetricSnapshots(piece.id, args.limit);

        // Compute trend from pageviews
        let trend: 'growing' | 'flat' | 'declining' | 'insufficient_data' = 'insufficient_data';

        const pvSnapshots = snapshots
          .filter((s) => s.pageviews !== null)
          .map((s) => s.pageviews as number);

        if (pvSnapshots.length >= 3) {
          // Compare first half average to second half average
          // Snapshots are ordered desc, so first entries are newest
          const mid = Math.floor(pvSnapshots.length / 2);
          const recentAvg =
            pvSnapshots.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
          const olderAvg =
            pvSnapshots.slice(mid).reduce((a, b) => a + b, 0) / (pvSnapshots.length - mid);

          if (olderAvg === 0) {
            trend = recentAvg > 0 ? 'growing' : 'flat';
          } else {
            const change = (recentAvg - olderAvg) / olderAvg;
            if (change > 0.1) trend = 'growing';
            else if (change < -0.1) trend = 'declining';
            else trend = 'flat';
          }
        }

        return text(
          JSON.stringify(
            {
              content_id: piece.id,
              title: piece.title,
              slug: piece.slug,
              trend,
              performance_signal: getContentPerformanceSignal(snapshots),
              snapshot_count: snapshots.length,
              snapshots,
            },
            null,
            2
          )
        );
      } catch (err) {
        console.error('[quiver-mcp] get_content_metrics error:', err);
        return error(err instanceof Error ? err.message : 'Failed to get metrics');
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_content_calendar
  // -----------------------------------------------------------------------
  server.tool(
    'get_content_calendar',
    'Get content pieces for a date range. Defaults to the current month.',
    {
      from: z.string().optional().describe('Start date (ISO format, e.g. 2026-04-01)'),
      to: z.string().optional().describe('End date (ISO format, e.g. 2026-04-30)'),
    },
    async (args) => {
      try {
        const now = new Date();
        const fromDate = args.from
          ? new Date(args.from)
          : new Date(now.getFullYear(), now.getMonth(), 1);
        const toDate = args.to
          ? new Date(args.to)
          : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
          return error('Invalid date format. Use ISO 8601 (e.g. 2026-04-01).');
        }

        const pieces = await getContentPiecesForCalendar({
          fromDate,
          toDate,
        });

        const scheduled = pieces.filter((p) => p.publishedAt !== null);
        const unscheduled = pieces.filter((p) => p.publishedAt === null);

        return text(
          JSON.stringify(
            {
              from: fromDate.toISOString().split('T')[0],
              to: toDate.toISOString().split('T')[0],
              scheduled: scheduled.map((p) => ({
                id: p.id,
                title: p.title,
                slug: p.slug,
                content_type: p.contentType,
                status: p.status,
                published_at: p.publishedAt,
                campaign: p.campaign?.name ?? null,
              })),
              unscheduled: unscheduled.map((p) => ({
                id: p.id,
                title: p.title,
                slug: p.slug,
                content_type: p.contentType,
                status: p.status,
                created_at: p.createdAt,
                campaign: p.campaign?.name ?? null,
              })),
            },
            null,
            2
          )
        );
      } catch (err) {
        console.error('[quiver-mcp] get_content_calendar error:', err);
        return error(err instanceof Error ? err.message : 'Failed to get content calendar');
      }
    }
  );

  // -----------------------------------------------------------------------
  // archive_content
  // -----------------------------------------------------------------------
  server.tool(
    'archive_content',
    "Archive a content piece. Accepts content ID, slug, or title partial match. Sets status to 'archived'. The piece remains in the database.",
    {
      content_id: z.string().optional().describe('Content piece ID'),
      slug: z.string().optional().describe('Content piece slug'),
      title: z.string().optional().describe('Content piece title (case-insensitive partial match)'),
    },
    async (args) => {
      try {
        const piece = await resolveContentPiece(args.content_id, args.slug, args.title);
        if (!piece) {
          return error('Content piece not found.');
        }
        await prisma.contentPiece.update({ where: { id: piece.id }, data: { status: 'archived' } });
        return text(`Archived content piece '${piece.title}' (slug: ${piece.slug ?? 'none'}).`);
      } catch (err) {
        console.error('[quiver-mcp] archive_content error:', err);
        return error(err instanceof Error ? err.message : 'Failed to archive content');
      }
    }
  );

  // -----------------------------------------------------------------------
  // delete_content
  // -----------------------------------------------------------------------
  server.tool(
    'delete_content',
    'Hard delete a content piece. Accepts content ID, slug, or title partial match. Distributions and metric snapshots cascade; derived content (parentContentId children) nulls out.',
    {
      content_id: z.string().optional().describe('Content piece ID'),
      slug: z.string().optional().describe('Content piece slug'),
      title: z.string().optional().describe('Content piece title (case-insensitive partial match)'),
    },
    async (args) => {
      try {
        const piece = await resolveContentPiece(args.content_id, args.slug, args.title);
        if (!piece) {
          return error('Content piece not found.');
        }
        await prisma.contentPiece.delete({ where: { id: piece.id } });
        return text(`Deleted content piece '${piece.title}' (slug: ${piece.slug ?? 'none'}).`);
      } catch (err) {
        console.error('[quiver-mcp] delete_content error:', err);
        return error(err instanceof Error ? err.message : 'Failed to delete content');
      }
    }
  );
}
