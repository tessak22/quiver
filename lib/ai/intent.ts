/**
 * Intent Classification — lib/ai/intent.ts
 *
 * What it does: Classifies a natural-language prompt into one of the five
 *   Quiver session modes (strategy, create, feedback, analyze, optimize) using
 *   a single non-streaming Anthropic call. When the detected mode is 'create',
 *   also identifies the most likely ArtifactType.
 *
 * What it reads from: The raw user prompt string. No database reads; no context
 *   version is loaded (intent detection is intentionally lightweight).
 *
 * What it produces: An IntentResult with mode, optional artifactType (create
 *   mode only), confidence level ('high' | 'low'), and a short reasoning string
 *   suitable for display in the confirmation alert.
 *
 * Edge cases:
 *   - AI returns invalid JSON: returns best-effort default (strategy mode,
 *     confidence 'low') — never throws.
 *   - AI API error: returns best-effort default with confidence 'low' —
 *     never throws.
 *   - Detected mode is not a valid SessionMode: falls back to 'strategy' with
 *     confidence 'low'.
 *   - Detected artifactType is not valid: omitted from result (not required).
 */

import { sendMessage } from '@/lib/ai/client';
import { SESSION_MODES } from '@/types';
import type { SessionMode, ArtifactType } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IntentResult {
  mode: SessionMode;
  artifactType?: ArtifactType;
  confidence: 'high' | 'low';
  reasoning: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_ARTIFACT_TYPES: ArtifactType[] = [
  'copywriting',
  'email_sequence',
  'cold_email',
  'social_content',
  'launch_strategy',
  'content_strategy',
  'positioning',
  'messaging',
  'ad_creative',
  'competitor_analysis',
  'seo',
  'cro',
  'ab_test',
  'landing_page',
  'one_pager',
  'other',
];

const DEFAULT_RESULT: IntentResult = {
  mode: 'strategy',
  confidence: 'low',
  reasoning: "I couldn't determine the best mode from your description. Defaulting to Strategy.",
};

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a session mode classifier for Quiver, an AI-powered marketing command center.

Given a user's natural language description of what they want to work on, classify it into one of these five session modes:

- strategy: Strategic planning, go-to-market, positioning, brainstorming ideas, launch planning, competitive analysis
- create: Producing actual marketing content — copy, emails, ads, landing pages, social posts, one-pagers, sequences
- feedback: Synthesizing customer research, interviews, survey data, NPS feedback, or user feedback
- analyze: Interpreting analytics data, A/B test results, performance metrics, or tracking setup
- optimize: Improving existing copy, pages, or flows using CRO, conversion rate optimization, or copy editing

When mode is "create", also identify the artifact type from this list:
copywriting, email_sequence, cold_email, social_content, launch_strategy, content_strategy,
positioning, messaging, ad_creative, competitor_analysis, seo, cro, ab_test, landing_page, one_pager, other

Respond ONLY with valid JSON in this exact shape (no markdown fences, no extra text):
{
  "mode": "<one of: strategy | create | feedback | analyze | optimize>",
  "artifactType": "<artifact type string, only include when mode is create>",
  "confidence": "<high | low>",
  "reasoning": "<1-2 sentences explaining why you chose this mode>"
}

Use confidence "high" when the prompt clearly maps to a mode. Use "low" when ambiguous.
Only include artifactType when mode is "create".`;

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Classifies a user prompt into a session mode and optional artifact type.
 * Never throws — all errors produce a low-confidence default result.
 */
export async function classifyIntent(prompt: string): Promise<IntentResult> {
  const result = await sendMessage({
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 256,
  });

  if (result.error) {
    console.error('[intent] AI call failed:', result.error.message);
    return DEFAULT_RESULT;
  }

  return parseIntentResponse(result.content);
}

// ── Parser ────────────────────────────────────────────────────────────────────

function parseIntentResponse(raw: string): IntentResult {
  let parsed: unknown;

  try {
    // Strip markdown code fences if present
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
  } catch {
    console.error('[intent] Failed to parse AI response as JSON:', raw.slice(0, 200));
    return DEFAULT_RESULT;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return DEFAULT_RESULT;
  }

  const obj = parsed as Record<string, unknown>;

  // Validate mode
  const rawMode = obj['mode'];
  if (!SESSION_MODES.includes(rawMode as SessionMode)) {
    console.error('[intent] Invalid mode in AI response:', rawMode);
    return DEFAULT_RESULT;
  }
  const mode = rawMode as SessionMode;

  // Validate confidence
  const rawConfidence = obj['confidence'];
  const confidence: 'high' | 'low' =
    rawConfidence === 'high' || rawConfidence === 'low' ? rawConfidence : 'low';

  // Validate reasoning
  const rawReasoning = obj['reasoning'];
  const reasoning =
    typeof rawReasoning === 'string' && rawReasoning.trim().length > 0
      ? rawReasoning.trim()
      : `Detected mode: ${mode}.`;

  // Validate artifactType (only relevant for create mode)
  let artifactType: ArtifactType | undefined;
  if (mode === 'create') {
    const rawArtifactType = obj['artifactType'];
    if (VALID_ARTIFACT_TYPES.includes(rawArtifactType as ArtifactType)) {
      artifactType = rawArtifactType as ArtifactType;
    }
  }

  return { mode, ...(artifactType ? { artifactType } : {}), confidence, reasoning };
}
