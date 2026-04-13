import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import {
  createResearchEntry,
  getResearchEntries,
  getResearchEntry,
  getResearchQuotes,
} from '@/lib/db/research';
import { processResearchEntry } from '@/lib/ai/research';
import { text, error } from '../lib/response.js';
import { resolveCampaignId } from '../lib/resolvers.js';
import type { ResearchSourceType } from '@/types';
import { RESEARCH_SOURCE_LABELS } from '@/types';

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date '${value}'. Use ISO 8601 format (e.g. 2026-04-11).`);
  }
  return d;
}

export function registerResearchTools(server: McpServer) {
  // -----------------------------------------------------------------------
  // list_research_entries
  // -----------------------------------------------------------------------
  server.tool(
    'list_research_entries',
    'List customer research entries with optional filters. Returns title, source type, contact info, themes, sentiment, and quote count.',
    {
      source_type: z
        .string()
        .optional()
        .describe('Filter by source type (call, interview, survey, review, forum, support_ticket, social, common_room, other)'),
      segment: z.string().optional().describe('Filter by contact segment'),
      stage: z
        .string()
        .optional()
        .describe('Filter by contact stage (prospect, customer, churned, never_converted)'),
      theme: z
        .string()
        .optional()
        .describe('Filter by theme (pricing, onboarding, competitor_mention, feature_gap, messaging, icp_fit, other)'),
      campaign_id: z.string().optional().describe('Filter by campaign ID'),
      campaign_name: z.string().optional().describe('Filter by campaign name (case-insensitive partial match)'),
      product_signal: z.boolean().optional().describe('Filter to only entries with product signals'),
      limit: z.number().optional().default(20).describe('Maximum entries to return'),
    },
    async (args) => {
      try {
        const resolvedCampaignId = await resolveCampaignId(args.campaign_id, args.campaign_name);

        const entries = await getResearchEntries({
          sourceType: args.source_type,
          contactSegment: args.segment,
          contactStage: args.stage,
          theme: args.theme,
          campaignId: resolvedCampaignId,
          productSignal: args.product_signal,
          limit: args.limit,
        });

        return text(JSON.stringify(entries, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] list_research_entries error:', err);
        return error(err instanceof Error ? err.message : 'Failed to list research entries');
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_research_entry
  // -----------------------------------------------------------------------
  server.tool(
    'get_research_entry',
    'Get full detail for a research entry including quotes, AI summary, themes, sentiment, and hypothesis signals. Look up by ID or title (case-insensitive partial match).',
    {
      id: z.string().optional().describe('Research entry ID'),
      title: z.string().optional().describe('Research entry title (case-insensitive partial match)'),
    },
    async (args) => {
      try {
        let entryId = args.id;

        if (!entryId && args.title) {
          const matches = await prisma.researchEntry.findMany({
            where: { title: { contains: args.title, mode: 'insensitive' } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, title: true },
            take: 5,
          });
          if (matches.length === 0) {
            return error(`No research entry found matching '${args.title}'.`);
          }
          if (matches.length > 1) {
            const list = matches.map((e) => `${e.title} (${e.id})`).join(', ');
            return error(
              `Found ${matches.length} entries matching '${args.title}': ${list}. Provide the id.`
            );
          }
          entryId = matches[0].id;
        }

        if (!entryId) {
          return error('Either id or title is required.');
        }

        const entry = await getResearchEntry(entryId);
        if (!entry) {
          return error(`Research entry '${entryId}' not found.`);
        }

        return text(JSON.stringify(entry, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_research_entry error:', err);
        return error(err instanceof Error ? err.message : 'Failed to get research entry');
      }
    }
  );

  // -----------------------------------------------------------------------
  // save_research_entry
  // -----------------------------------------------------------------------
  server.tool(
    'save_research_entry',
    'Save a new customer research entry. AI processing (summary, themes, sentiment, quote extraction) runs automatically in the background.',
    {
      title: z.string().describe('Entry title, e.g. "Call with Acme — Apr 2026"'),
      source_type: z
        .string()
        .describe('Source type: call, interview, survey, review, forum, support_ticket, social, common_room, or other'),
      raw_notes: z.string().describe('Raw research notes or transcript'),
      contact_name: z.string().optional().describe('Contact person name'),
      contact_company: z.string().optional().describe('Contact company'),
      contact_segment: z.string().optional().describe('ICP segment'),
      contact_stage: z
        .string()
        .optional()
        .describe('Contact stage: prospect, customer, churned, never_converted'),
      research_date: z.string().optional().describe('Date of research (ISO date)'),
      campaign_id: z.string().optional().describe('Campaign ID'),
      campaign_name: z.string().optional().describe('Campaign name (case-insensitive partial match)'),
      product_signal: z.boolean().optional().describe('Flag as product signal'),
      product_note: z.string().optional().describe('Note for product team'),
    },
    async (args) => {
      try {
        // Validate source_type
        const VALID_SOURCE_TYPES = [
          'call', 'interview', 'survey', 'review', 'forum',
          'support_ticket', 'social', 'common_room', 'other',
        ] as const;
        if (!VALID_SOURCE_TYPES.includes(args.source_type as typeof VALID_SOURCE_TYPES[number])) {
          return error(
            `Invalid source_type '${args.source_type}'. Valid values: ${VALID_SOURCE_TYPES.join(', ')}`
          );
        }

        // Validate contact_stage if provided
        const VALID_CONTACT_STAGES = [
          'prospect', 'customer', 'churned', 'never_converted',
        ] as const;
        if (
          args.contact_stage !== undefined &&
          !VALID_CONTACT_STAGES.includes(args.contact_stage as typeof VALID_CONTACT_STAGES[number])
        ) {
          return error(
            `Invalid contact_stage '${args.contact_stage}'. Valid values: ${VALID_CONTACT_STAGES.join(', ')}`
          );
        }

        const resolvedCampaignId = await resolveCampaignId(
          args.campaign_id,
          args.campaign_name
        );

        const entry = await createResearchEntry({
          title: args.title,
          sourceType: args.source_type,
          rawNotes: args.raw_notes,
          contactName: args.contact_name,
          contactCompany: args.contact_company,
          contactSegment: args.contact_segment,
          contactStage: args.contact_stage,
          researchDate: parseDate(args.research_date),
          campaignId: resolvedCampaignId,
          productSignal: args.product_signal,
          productNote: args.product_note,
          createdBy: 'mcp',
        });

        // Trigger async AI processing (best-effort)
        void processResearchEntry({
          id: entry.id,
          title: entry.title,
          sourceType: entry.sourceType,
          contactName: entry.contactName,
          contactCompany: entry.contactCompany,
          contactSegment: entry.contactSegment,
          contactStage: entry.contactStage,
          rawNotes: entry.rawNotes,
          campaignId: entry.campaignId,
          sentimentLocked: entry.sentimentLocked,
        });

        return text(
          JSON.stringify(
            {
              entry_id: entry.id,
              title: entry.title,
              processing: true,
              message: 'Entry saved. AI is processing summary, themes, quotes in the background.',
            },
            null,
            2
          )
        );
      } catch (err) {
        console.error('[quiver-mcp] save_research_entry error:', err);
        return error(err instanceof Error ? err.message : 'Failed to save research entry');
      }
    }
  );

  // -----------------------------------------------------------------------
  // list_quotes
  // -----------------------------------------------------------------------
  server.tool(
    'list_quotes',
    'List extracted research quotes (Voice-of-Customer library). Includes parent entry metadata. Featured quotes appear first.',
    {
      theme: z
        .string()
        .optional()
        .describe('Filter by theme (pricing, onboarding, competitor_mention, feature_gap, messaging, icp_fit, other)'),
      segment: z.string().optional().describe('Filter by segment'),
      featured_only: z.boolean().optional().describe('Only show featured quotes'),
      limit: z.number().optional().default(50).describe('Maximum quotes to return'),
    },
    async (args) => {
      try {
        const quotes = await getResearchQuotes({
          theme: args.theme,
          segment: args.segment,
          isFeatured: args.featured_only ? true : undefined,
          limit: args.limit,
        });

        return text(JSON.stringify(quotes, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] list_quotes error:', err);
        return error(err instanceof Error ? err.message : 'Failed to list quotes');
      }
    }
  );

  // -----------------------------------------------------------------------
  // get_linear_payload
  // -----------------------------------------------------------------------
  server.tool(
    'get_linear_payload',
    'Generate a formatted Linear issue payload from a research entry with a product signal. Returns title, description, and entry URL. Does NOT call the Linear API.',
    {
      entry_id: z.string().optional().describe('Research entry ID'),
      entry_title: z.string().optional().describe('Research entry title (case-insensitive partial match)'),
    },
    async (args) => {
      try {
        let entryId = args.entry_id;

        if (!entryId && args.entry_title) {
          const matches = await prisma.researchEntry.findMany({
            where: {
              title: { contains: args.entry_title, mode: 'insensitive' },
              productSignal: true,
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, title: true },
            take: 5,
          });
          if (matches.length === 0) {
            return error(
              `No research entry with product signal found matching '${args.entry_title}'.`
            );
          }
          if (matches.length > 1) {
            const list = matches.map((e) => `${e.title} (${e.id})`).join(', ');
            return error(
              `Found ${matches.length} entries matching '${args.entry_title}': ${list}. Provide entry_id.`
            );
          }
          entryId = matches[0].id;
        }

        if (!entryId) {
          return error('Either entry_id or entry_title is required.');
        }

        const entry = await getResearchEntry(entryId);
        if (!entry) {
          return error(`Research entry '${entryId}' not found.`);
        }
        if (!entry.productSignal) {
          return error(
            `Research entry '${entry.title}' does not have a product signal. Flag it first.`
          );
        }

        const sourceLabel = RESEARCH_SOURCE_LABELS[entry.sourceType as ResearchSourceType] ?? entry.sourceType;

        const descriptionLines = [
          `## Product Signal from Research`,
          '',
          `**Source:** ${sourceLabel}`,
          `**Entry:** ${entry.title}`,
        ];

        if (entry.contactName) descriptionLines.push(`**Contact:** ${entry.contactName}`);
        if (entry.contactCompany) descriptionLines.push(`**Company:** ${entry.contactCompany}`);
        if (entry.contactSegment) descriptionLines.push(`**Segment:** ${entry.contactSegment}`);
        if (entry.researchDate) {
          descriptionLines.push(
            `**Date:** ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(entry.researchDate))}`
          );
        }
        descriptionLines.push('');

        if (entry.productNote) {
          descriptionLines.push(`### Product Note`);
          descriptionLines.push(entry.productNote);
          descriptionLines.push('');
        }

        if (entry.summary) {
          descriptionLines.push(`### AI Summary`);
          descriptionLines.push(entry.summary);
          descriptionLines.push('');
        }

        const relevantQuotes = entry.quotes.filter(
          (q) => q.theme === 'feature_gap' || q.isFeatured
        );
        if (relevantQuotes.length > 0) {
          descriptionLines.push(`### Key Quotes`);
          for (const q of relevantQuotes) {
            descriptionLines.push(`> "${q.quote}"`);
            if (q.context) descriptionLines.push(`> _Context: ${q.context}_`);
            descriptionLines.push('');
          }
        }

        const payload = {
          title: `[Research Signal] ${entry.productNote?.slice(0, 60) ?? entry.title}`,
          description: descriptionLines.join('\n'),
          entry_url: `/research/${entry.id}`,
        };

        return text(JSON.stringify(payload, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] get_linear_payload error:', err);
        return error(err instanceof Error ? err.message : 'Failed to generate Linear payload');
      }
    }
  );

  // -----------------------------------------------------------------------
  // update_research_entry
  // -----------------------------------------------------------------------
  server.tool(
    'update_research_entry',
    'Update fields on an existing research entry. Only fields that are provided will be updated. WARNING: raw_notes REPLACES the existing notes entirely — it does not append. If sentiment is provided, it will be written and sentimentLocked will be set to true, preventing AI post-processing from overwriting it.',
    {
      id: z.string().describe('Research entry ID'),
      title: z.string().optional().describe('New title'),
      research_date: z.string().optional().describe('Research date (ISO 8601, e.g. 2026-04-11)'),
      contact_name: z.string().optional().describe('Contact person name'),
      contact_company: z.string().optional().describe('Contact company'),
      contact_segment: z.string().optional().describe('ICP segment'),
      contact_stage: z
        .string()
        .optional()
        .describe('Contact stage: prospect, customer, churned, never_converted'),
      sentiment: z
        .string()
        .optional()
        .describe('Sentiment override: positive, negative, neutral, mixed. Sets sentimentLocked = true.'),
      product_signal: z.boolean().optional().describe('Flag as product signal'),
      product_note: z.string().optional().describe('Note for product team'),
      source_type: z
        .string()
        .optional()
        .describe('Source type: call, interview, survey, review, forum, support_ticket, social, common_room, other'),
      raw_notes: z
        .string()
        .optional()
        .describe('Raw research notes. REPLACES existing notes — does not append.'),
    },
    async (args) => {
      try {
        const existing = await prisma.researchEntry.findUnique({
          where: { id: args.id },
          select: { id: true, title: true },
        });
        if (!existing) {
          return error(`Research entry '${args.id}' not found.`);
        }

        const VALID_SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'] as const;
        if (args.sentiment !== undefined && !VALID_SENTIMENTS.includes(args.sentiment as typeof VALID_SENTIMENTS[number])) {
          return error(`Invalid sentiment '${args.sentiment}'. Valid values: ${VALID_SENTIMENTS.join(', ')}`);
        }

        const VALID_CONTACT_STAGES = ['prospect', 'customer', 'churned', 'never_converted'] as const;
        if (args.contact_stage !== undefined && !VALID_CONTACT_STAGES.includes(args.contact_stage as typeof VALID_CONTACT_STAGES[number])) {
          return error(`Invalid contact_stage '${args.contact_stage}'. Valid values: ${VALID_CONTACT_STAGES.join(', ')}`);
        }

        const VALID_SOURCE_TYPES = ['call', 'interview', 'survey', 'review', 'forum', 'support_ticket', 'social', 'common_room', 'other'] as const;
        if (args.source_type !== undefined && !VALID_SOURCE_TYPES.includes(args.source_type as typeof VALID_SOURCE_TYPES[number])) {
          return error(`Invalid source_type '${args.source_type}'. Valid values: ${VALID_SOURCE_TYPES.join(', ')}`);
        }

        const updateData: Parameters<typeof prisma.researchEntry.update>[0]['data'] = {};

        if (args.title !== undefined) updateData.title = args.title;
        if (args.research_date !== undefined) updateData.researchDate = parseDate(args.research_date);
        if (args.contact_name !== undefined) updateData.contactName = args.contact_name;
        if (args.contact_company !== undefined) updateData.contactCompany = args.contact_company;
        if (args.contact_segment !== undefined) updateData.contactSegment = args.contact_segment;
        if (args.contact_stage !== undefined) updateData.contactStage = args.contact_stage;
        if (args.sentiment !== undefined) {
          updateData.sentiment = args.sentiment;
          updateData.sentimentLocked = true;
        }
        if (args.product_signal !== undefined) updateData.productSignal = args.product_signal;
        if (args.product_note !== undefined) updateData.productNote = args.product_note;
        if (args.source_type !== undefined) updateData.sourceType = args.source_type;
        if (args.raw_notes !== undefined) updateData.rawNotes = args.raw_notes;

        const updated = await prisma.researchEntry.update({
          where: { id: args.id },
          data: updateData,
          select: {
            id: true,
            title: true,
            sourceType: true,
            sentiment: true,
            sentimentLocked: true,
            productSignal: true,
            contactName: true,
            contactCompany: true,
            updatedAt: true,
          },
        });

        return text(JSON.stringify(updated, null, 2));
      } catch (err) {
        console.error('[quiver-mcp] update_research_entry error:', err);
        return error(err instanceof Error ? err.message : 'Failed to update research entry');
      }
    }
  );

  // -----------------------------------------------------------------------
  // delete_research_entry
  // -----------------------------------------------------------------------
  server.tool(
    'delete_research_entry',
    'Permanently delete a research entry and all its associated quotes. This action cannot be undone.',
    {
      id: z.string().describe('Research entry ID to delete'),
    },
    async (args) => {
      try {
        const existing = await prisma.researchEntry.findUnique({
          where: { id: args.id },
          select: { id: true, title: true },
        });
        if (!existing) {
          return error(`Research entry '${args.id}' not found.`);
        }

        const quoteCount = await prisma.researchQuote.count({
          where: { researchEntryId: args.id },
        });

        await prisma.researchEntry.delete({ where: { id: args.id } });

        return text(
          `Deleted research entry '${existing.title}' and ${quoteCount} associated quote${quoteCount === 1 ? '' : 's'}.`
        );
      } catch (err) {
        console.error('[quiver-mcp] delete_research_entry error:', err);
        return error(err instanceof Error ? err.message : 'Failed to delete research entry');
      }
    }
  );

  // -----------------------------------------------------------------------
  // update_quote
  // -----------------------------------------------------------------------
  server.tool(
    'update_quote',
    'Update a research quote. Only fields that are provided will be updated.',
    {
      quote_id: z.string().describe('Research quote ID'),
      featured: z.boolean().optional().describe('Mark or unmark as featured (injects into AI session context)'),
      theme: z
        .string()
        .optional()
        .describe('Theme: pricing, onboarding, competitor_mention, feature_gap, messaging, icp_fit, other'),
    },
    async (args) => {
      try {
        const existing = await prisma.researchQuote.findUnique({
          where: { id: args.quote_id },
          select: { id: true, quote: true },
        });
        if (!existing) {
          return error(`Research quote '${args.quote_id}' not found.`);
        }

        const VALID_THEMES = ['pricing', 'onboarding', 'competitor_mention', 'feature_gap', 'messaging', 'icp_fit', 'other'] as const;
        if (args.theme !== undefined && !VALID_THEMES.includes(args.theme as typeof VALID_THEMES[number])) {
          return error(`Invalid theme '${args.theme}'. Valid values: ${VALID_THEMES.join(', ')}`);
        }

        const updateData: Parameters<typeof prisma.researchQuote.update>[0]['data'] = {};

        if (args.featured !== undefined) updateData.isFeatured = args.featured;
        if (args.theme !== undefined) updateData.theme = args.theme;

        const updated = await prisma.researchQuote.update({
          where: { id: args.quote_id },
          data: updateData,
          select: { id: true, quote: true, theme: true, isFeatured: true },
        });

        const preview = updated.quote.slice(0, 100);
        return text(
          `Updated quote (${updated.id}): "${preview}${updated.quote.length > 100 ? '…' : ''}" — theme: ${updated.theme ?? 'none'}, featured: ${updated.isFeatured}`
        );
      } catch (err) {
        console.error('[quiver-mcp] update_quote error:', err);
        return error(err instanceof Error ? err.message : 'Failed to update quote');
      }
    }
  );

  // -----------------------------------------------------------------------
  // delete_quote
  // -----------------------------------------------------------------------
  server.tool(
    'delete_quote',
    'Permanently delete a research quote. This action cannot be undone.',
    {
      quote_id: z.string().describe('Research quote ID to delete'),
    },
    async (args) => {
      try {
        const existing = await prisma.researchQuote.findUnique({
          where: { id: args.quote_id },
          select: { id: true, quote: true },
        });
        if (!existing) {
          return error(`Research quote '${args.quote_id}' not found.`);
        }

        await prisma.researchQuote.delete({ where: { id: args.quote_id } });

        const preview = existing.quote.slice(0, 100);
        return text(
          `Deleted quote (${existing.id}): "${preview}${existing.quote.length > 100 ? '…' : ''}"`
        );
      } catch (err) {
        console.error('[quiver-mcp] delete_quote error:', err);
        return error(err instanceof Error ? err.message : 'Failed to delete quote');
      }
    }
  );
}
