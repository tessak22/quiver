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
}
