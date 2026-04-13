/**
 * Research AI Processing — lib/ai/research.ts
 *
 * What it does: Processes a raw research entry through a single non-streaming
 *   Anthropic call. Extracts summary, themes, sentiment, direct quotes,
 *   hypothesis signals, and context update proposals.
 *
 * What it reads from: The active context version (positioning, ICP, customer
 *   language, active hypotheses) plus the research entry's raw notes and
 *   metadata.
 *
 * What it produces: Updates the research entry with summary, themes, sentiment,
 *   and hypothesis signals. Creates extracted quotes. If context proposals are
 *   returned, logs them as a pending performance log entry.
 *
 * CRITICAL: This file has NO Next.js-specific imports. It must be importable
 *   from the MCP server (plain Node.js).
 *
 * Edge cases:
 *   - AI returns invalid JSON: logs to stderr, returns safe defaults (empty
 *     arrays, generic summary). Never throws.
 *   - AI API error: logs to stderr, returns safe defaults. Never throws.
 *   - No active context version: proceeds with empty context sections.
 *   - No active hypotheses: hypothesis signals section is omitted from prompt.
 */

import { sendMessage } from '@/lib/ai/client';
import { getActiveContext } from '@/lib/db/context';
import {
  updateResearchEntry,
  createResearchQuotes,
} from '@/lib/db/research';
import { createPerformanceLog } from '@/lib/db/performance';
import { getDefaultCampaign } from '@/lib/db/campaigns';

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

interface ResearchEntryInput {
  id: string;
  title: string;
  sourceType: string;
  contactName?: string | null;
  contactCompany?: string | null;
  contactSegment?: string | null;
  contactStage?: string | null;
  rawNotes: string;
  campaignId?: string | null;
  sentimentLocked?: boolean;
}

interface HypothesisSignalResult {
  hypothesis: string;
  signal: 'validates' | 'challenges' | 'neutral';
  evidence: string;
}

interface ExtractedQuote {
  quote: string;
  context: string;
  theme: string;
}

interface ContextProposal {
  field: string;
  current: string;
  proposed: string;
  rationale: string;
}

interface AIProcessingResult {
  summary: string;
  themes: string[];
  sentiment: string;
  quotes: ExtractedQuote[];
  hypothesisSignals: HypothesisSignalResult[];
  contextProposals: ContextProposal[];
}

// -------------------------------------------------------------------------
// Processing
// -------------------------------------------------------------------------

export async function processResearchEntry(
  entry: ResearchEntryInput
): Promise<AIProcessingResult> {
  const safeDefaults: AIProcessingResult = {
    summary: 'AI processing could not extract a summary from this entry.',
    themes: [],
    sentiment: 'neutral',
    quotes: [],
    hypothesisSignals: [],
    contextProposals: [],
  };

  try {
    // 1. Read active context
    const context = await getActiveContext();
    const positioningStatement = context?.positioningStatement ?? '';
    const icpDefinition = context?.icpDefinition
      ? JSON.stringify(context.icpDefinition)
      : '';
    const customerLanguage = context?.customerLanguage
      ? JSON.stringify(context.customerLanguage)
      : '';
    const activeHypotheses = context?.activeHypotheses
      ? JSON.stringify(context.activeHypotheses)
      : '';

    // 2. Build system prompt
    const systemPrompt = buildSystemPrompt({
      positioningStatement,
      icpDefinition,
      customerLanguage,
      activeHypotheses,
    });

    // 3. Build user message
    const userMessage = buildUserMessage(entry);

    // 4. Non-streaming AI call
    const result = await sendMessage({
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    if (result.error) {
      console.error(
        '[research-ai] AI call failed:',
        result.error.code,
        result.error.message
      );
      await applyDefaults(entry.id, safeDefaults);
      return safeDefaults;
    }

    // 5. Parse JSON from AI response
    const parsed = parseAIResponse(result.content);
    if (!parsed) {
      console.error(
        '[research-ai] Failed to parse AI JSON response. Raw content:',
        result.content.slice(0, 500)
      );
      await applyDefaults(entry.id, safeDefaults);
      return safeDefaults;
    }

    // 6. Apply results to DB (skip sentiment if manually locked)
    await updateResearchEntry(entry.id, {
      summary: parsed.summary,
      themes: parsed.themes,
      sentiment: entry.sentimentLocked ? undefined : parsed.sentiment,
      hypothesisSignals: parsed.hypothesisSignals,
    });

    await createResearchQuotes(
      parsed.quotes.map((q) => ({
        researchEntryId: entry.id,
        quote: q.quote,
        context: q.context,
        theme: q.theme,
        segment: entry.contactSegment ?? undefined,
      }))
    );

    // 7. Create context proposal performance log if proposals exist
    if (parsed.contextProposals.length > 0) {
      let campaignId = entry.campaignId;
      if (!campaignId) {
        const defaultCampaign = await getDefaultCampaign();
        campaignId = defaultCampaign?.id;
      }

      if (campaignId) {
        await createPerformanceLog({
          logType: 'context_proposal',
          proposedContextUpdates: parsed.contextProposals,
          campaignId,
          qualitativeNotes: `Research-driven proposal from: ${entry.id}`,
          recordedBy: 'research_ai',
        });
      }
    }

    return parsed;
  } catch (err) {
    console.error('[research-ai] Unexpected error during processing:', err);
    try {
      await applyDefaults(entry.id, safeDefaults);
    } catch (dbErr) {
      console.error('[research-ai] Failed to write safe defaults:', dbErr);
    }
    return safeDefaults;
  }
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

async function applyDefaults(
  entryId: string,
  defaults: AIProcessingResult
): Promise<void> {
  await updateResearchEntry(entryId, {
    summary: defaults.summary,
    themes: defaults.themes,
    sentiment: defaults.sentiment,
    hypothesisSignals: defaults.hypothesisSignals,
  });
}

function buildSystemPrompt(context: {
  positioningStatement: string;
  icpDefinition: string;
  customerLanguage: string;
  activeHypotheses: string;
}): string {
  const sections: string[] = [
    'You are a customer research analyst for a product marketing team.',
    'Your job is to analyze raw research notes and extract structured insights.',
    '',
    '## Product Context',
  ];

  if (context.positioningStatement) {
    sections.push(`**Positioning:** ${context.positioningStatement}`);
  }
  if (context.icpDefinition) {
    sections.push(`**ICP Definition:** ${context.icpDefinition}`);
  }
  if (context.customerLanguage) {
    sections.push(`**Customer Language:** ${context.customerLanguage}`);
  }

  sections.push('');
  sections.push('## Instructions');
  sections.push(
    'Analyze the research entry below and return a single JSON object with these fields:'
  );
  sections.push('');
  sections.push('- **summary** (string): A 2-4 sentence summary of the key insights.');
  sections.push(
    '- **themes** (string[]): Array of themes from this list: pricing, onboarding, competitor_mention, feature_gap, messaging, icp_fit, other. Include all that apply.'
  );
  sections.push(
    '- **sentiment** (string): One of: positive, negative, neutral, mixed.'
  );
  sections.push(
    '- **quotes** (array of {quote, context, theme}): Direct quotes from the notes that are worth preserving. quote = the exact words, context = what the person was responding to, theme = the most relevant theme for this quote.'
  );

  if (context.activeHypotheses) {
    sections.push(
      `- **hypothesisSignals** (array of {hypothesis, signal, evidence}): For each of the team's active hypotheses below, indicate whether this research validates, challenges, or is neutral to it, with supporting evidence from the notes.`
    );
    sections.push(`\n**Active Hypotheses:** ${context.activeHypotheses}`);
  } else {
    sections.push('- **hypothesisSignals** (array): Return an empty array [].');
  }

  sections.push(
    '- **contextProposals** (array of {field, current, proposed, rationale}): If this research suggests updates to the product positioning, ICP definition, customer language, or active hypotheses, propose them here. Only include concrete, evidence-based proposals. Field must be one of: positioningStatement, icpDefinition, customerLanguage, activeHypotheses. If none, return an empty array [].'
  );

  sections.push('');
  sections.push('Return ONLY valid JSON. No markdown fences, no explanation outside the JSON object.');

  return sections.join('\n');
}

function buildUserMessage(entry: ResearchEntryInput): string {
  const parts: string[] = [
    `## Research Entry: ${entry.title}`,
    '',
    `**Source Type:** ${entry.sourceType}`,
  ];

  if (entry.contactName) parts.push(`**Contact:** ${entry.contactName}`);
  if (entry.contactCompany) parts.push(`**Company:** ${entry.contactCompany}`);
  if (entry.contactSegment) parts.push(`**Segment:** ${entry.contactSegment}`);
  if (entry.contactStage) parts.push(`**Stage:** ${entry.contactStage}`);

  parts.push('');
  parts.push('## Raw Notes');
  parts.push('');
  parts.push(entry.rawNotes);

  return parts.join('\n');
}

function parseAIResponse(content: string): AIProcessingResult | null {
  try {
    // Try direct JSON parse first
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return validateParsed(parsed);
  } catch {
    // Try extracting JSON from markdown code fences or surrounding text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        return validateParsed(parsed);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function validateParsed(parsed: Record<string, unknown>): AIProcessingResult | null {
  if (typeof parsed.summary !== 'string') return null;

  return {
    summary: parsed.summary,
    themes: Array.isArray(parsed.themes)
      ? (parsed.themes as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
    sentiment: typeof parsed.sentiment === 'string' ? parsed.sentiment : 'neutral',
    quotes: Array.isArray(parsed.quotes)
      ? (parsed.quotes as unknown[])
          .filter(
            (q): q is { quote: string; context: string; theme: string } =>
              typeof q === 'object' &&
              q !== null &&
              typeof (q as Record<string, unknown>).quote === 'string'
          )
          .map((q) => ({
            quote: q.quote,
            context: typeof q.context === 'string' ? q.context : '',
            theme: typeof q.theme === 'string' ? q.theme : 'other',
          }))
      : [],
    hypothesisSignals: Array.isArray(parsed.hypothesisSignals)
      ? (parsed.hypothesisSignals as unknown[])
          .filter(
            (h): h is HypothesisSignalResult =>
              typeof h === 'object' &&
              h !== null &&
              typeof (h as Record<string, unknown>).hypothesis === 'string' &&
              typeof (h as Record<string, unknown>).signal === 'string' &&
              typeof (h as Record<string, unknown>).evidence === 'string'
          )
      : [],
    contextProposals: Array.isArray(parsed.contextProposals)
      ? (parsed.contextProposals as unknown[])
          .filter(
            (p): p is ContextProposal =>
              typeof p === 'object' &&
              p !== null &&
              typeof (p as Record<string, unknown>).field === 'string' &&
              typeof (p as Record<string, unknown>).proposed === 'string'
          )
          .map((p) => ({
            field: p.field,
            current: typeof p.current === 'string' ? p.current : '',
            proposed: p.proposed,
            rationale: typeof p.rationale === 'string' ? p.rationale : '',
          }))
      : [],
  };
}
