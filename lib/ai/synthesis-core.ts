/**
 * AI Performance Synthesis — lib/ai/synthesis-core.ts
 *
 * What it does: Analyzes performance log results and proposes context updates
 *   using AI. Extracted from app/api/performance/route.ts for shared use by
 *   both the Next.js API and the MCP server.
 *
 * What it reads from: Active context version (via lib/db/context), performance
 *   log data passed as input.
 *
 * What it produces: An array of ContextUpdateProposal objects (may be empty
 *   if synthesis yields no suggestions or fails).
 *
 * Edge cases:
 *   - AI response parsing may fail: returns empty proposals array.
 *   - Missing ANTHROPIC_API_KEY: sendMessage returns an error, synthesis
 *     returns empty proposals silently.
 *   - Malformed JSON in AI response: caught and returns empty proposals.
 */

import { sendMessage } from '@/lib/ai/client';
import { getActiveContext } from '@/lib/db/context';
import { updatePerformanceLog } from '@/lib/db/performance';
import type { ContextUpdateProposal } from '@/types';

export interface SynthesisInput {
  whatWorked?: string;
  whatDidnt?: string;
  qualitativeNotes?: string;
  metrics?: Record<string, unknown>;
}

export interface SynthesisResult {
  proposals: ContextUpdateProposal[];
}

/**
 * Run AI synthesis on performance data and update the log entry with proposals.
 * Returns the proposals (empty array if synthesis yields none or fails).
 * This function is best-effort — failures are caught silently.
 */
export async function synthesizePerformance(
  logId: string,
  data: SynthesisInput
): Promise<SynthesisResult> {
  const activeContext = await getActiveContext();
  const contextSummary = activeContext?.positioningStatement || 'No active context';

  const whatWorked = data.whatWorked ?? 'Not specified';
  const whatDidnt = data.whatDidnt ?? 'Not specified';
  const notes = data.qualitativeNotes ?? 'None';
  const metricsStr = data.metrics ? JSON.stringify(data.metrics) : 'None logged';

  const prompt = `You are analyzing performance results for a marketing team. Their product positioning: ${JSON.stringify(contextSummary)}

Results logged:
- What worked: ${JSON.stringify(whatWorked)}
- What didn't: ${JSON.stringify(whatDidnt)}
- Notes: ${JSON.stringify(notes)}
- Metrics: ${metricsStr}

Based on these results, propose specific updates to the product marketing context. Return ONLY a JSON array:
[{"field": "fieldName", "current": "current value or unknown", "proposed": "proposed new value", "rationale": "why this change"}]

Fields you can propose changes to: positioningStatement, icpDefinition, messagingPillars, competitiveLandscape, customerLanguage, proofPoints, activeHypotheses, brandVoice, wordsToUse, wordsToAvoid

Only propose changes that are directly supported by the results. If no changes are warranted, return an empty array [].`;

  const result = await sendMessage({
    system: 'You are a marketing data analyst. Always return valid JSON arrays only.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 2048,
  });

  if (result.error) return { proposals: [] };

  try {
    const jsonMatch = result.content.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return { proposals: [] };

    const proposals: unknown = JSON.parse(jsonMatch[0]);
    if (Array.isArray(proposals) && proposals.length > 0) {
      await updatePerformanceLog(logId, {
        proposedContextUpdates: proposals,
        contextUpdateStatus: 'pending',
      });
      return { proposals: proposals as ContextUpdateProposal[] };
    }
  } catch {
    // Parse failure — synthesis is best-effort
  }

  return { proposals: [] };
}
