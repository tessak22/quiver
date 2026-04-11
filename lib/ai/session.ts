/**
 * System Prompt Assembly — lib/ai/session.ts
 *
 * What it does: Assembles the complete system prompt for an AI session by
 *   combining role definition, product context, skill frameworks, performance
 *   history, mode-specific instructions, and output format instructions.
 *
 * What it reads from:
 *   - Active context_version row (via Prisma)
 *   - Skill markdown files (via lib/ai/skills.ts)
 *   - Recent artifacts for performance history (via Prisma)
 *
 * What it produces: A single string — the complete system prompt ready for
 *   injection into the Anthropic API call.
 *
 * Edge cases:
 *   - No active context: throws with guidance to complete onboarding.
 *   - Missing skills: propagates the error from skills.ts with descriptive message.
 *   - No performance history: section is omitted (not an error).
 *   - Very long context: no truncation — the full context is the product's value.
 */

import { prisma } from '@/lib/db';
import { loadSkillsForMode } from '@/lib/ai/skills';
import type { SessionMode, ArtifactType } from '@/types';

export interface AssemblePromptOptions {
  mode: SessionMode;
  artifactType?: ArtifactType;
  campaignId?: string;
  contextVersionId?: string;
}

export interface AssembledPrompt {
  systemPrompt: string;
  skillNames: string[];
  contextVersionId: string;
}

// --- Section 1: Role Definition ---
function buildRoleSection(productName: string): string {
  return `You are an expert B2B marketing strategist. You are working inside Quiver, a marketing command center for ${productName}. Your responses are grounded in the team's actual product context, history, and positioning — not generic marketing advice. Be direct, specific, and always connect recommendations back to the product context you've been given.`;
}

// --- Section 2: Product Context ---
function buildContextSection(context: {
  positioningStatement: string | null;
  icpDefinition: unknown;
  messagingPillars: unknown;
  competitiveLandscape: unknown;
  customerLanguage: unknown;
  proofPoints: unknown;
  activeHypotheses: unknown;
  brandVoice: string | null;
  wordsToUse: string[];
  wordsToAvoid: string[];
}): string {
  const sections: string[] = [];

  if (context.positioningStatement) {
    sections.push(`## Positioning\n${context.positioningStatement}`);
  }

  if (context.icpDefinition) {
    sections.push(
      `## Target Audience & ICP\n${formatJson(context.icpDefinition)}`
    );
  }

  if (context.messagingPillars) {
    sections.push(
      `## Messaging Pillars\n${formatJson(context.messagingPillars)}`
    );
  }

  if (context.competitiveLandscape) {
    sections.push(
      `## Competitive Landscape\n${formatJson(context.competitiveLandscape)}`
    );
  }

  if (context.customerLanguage) {
    sections.push(
      `## Customer Language\n${formatJson(context.customerLanguage)}`
    );
  }

  if (context.proofPoints) {
    sections.push(`## Proof Points\n${formatJson(context.proofPoints)}`);
  }

  if (context.activeHypotheses) {
    sections.push(
      `## Active Hypotheses\n${formatJson(context.activeHypotheses)}`
    );
  }

  if (context.brandVoice) {
    sections.push(`## Brand Voice\n${context.brandVoice}`);
  }

  if (context.wordsToUse.length > 0) {
    sections.push(`## Words to Use\n${context.wordsToUse.join(', ')}`);
  }

  if (context.wordsToAvoid.length > 0) {
    sections.push(`## Words to Avoid\n${context.wordsToAvoid.join(', ')}`);
  }

  return sections.length > 0
    ? `# Product Context\n\n${sections.join('\n\n')}`
    : '';
}

// --- Section 4: Performance History ---
async function buildPerformanceSection(
  artifactType: ArtifactType
): Promise<string> {
  const recentArtifacts = await prisma.artifact.findMany({
    where: { type: artifactType },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: {
      performanceLogs: {
        select: {
          whatWorked: true,
          whatDidnt: true,
          metrics: true,
        },
        take: 1,
        orderBy: { recordedAt: 'desc' },
      },
    },
  });

  if (recentArtifacts.length === 0) return '';

  const lines = recentArtifacts.map((artifact) => {
    const log = artifact.performanceLogs[0];
    const signal = log
      ? `${log.whatWorked ? 'Worked: ' + log.whatWorked : ''}${log.whatDidnt ? ' | Didn\'t work: ' + log.whatDidnt : ''}`
      : 'No performance data logged';
    return `- ${artifact.title} | ${artifact.status} | ${signal}`;
  });

  return `## Past Work — ${artifactType}\n${lines.join('\n')}`;
}

// --- Section 5: Mode Instructions ---
const MODE_INSTRUCTIONS: Record<SessionMode, string> = {
  strategy:
    'Produce structured strategic recommendations. When you arrive at a recommendation, state which framework from your loaded skills informed it. Connect every recommendation to the product context above.',
  create:
    'Produce complete, production-ready marketing copy. Ground every piece in the product context, ICP, and messaging pillars above. End every response with a prompt: "Save this as an artifact?" so the user can one-click save.',
  feedback:
    'Synthesize the input provided. Always end with: (1) a bulleted summary of what worked, (2) what didn\'t, (3) numbered proposed updates to the product marketing context with current value and proposed value shown.',
  analyze:
    'Interpret data against the product context. Connect findings to specific ICP segments and channels. End with actionable next steps.',
  optimize:
    'Critique against the product\'s actual positioning and ICP. Produce an annotated critique followed by a revised version. Ground every suggestion in the context above.',
};

// --- Section 6: Output Format ---
const OUTPUT_INSTRUCTIONS = `When you produce a complete piece of work (copy, strategy, analysis), end your response with:
---
[ARTIFACT READY — type: {type} | suggested title: {title}]
This signals to the UI to show the one-click artifact save button. Replace {type} with the artifact type and {title} with a suggested title for this work.`;

// --- Main Assembly ---
export async function assembleSystemPrompt(
  options: AssemblePromptOptions
): Promise<AssembledPrompt> {
  // Load context
  const context = options.contextVersionId
    ? await prisma.contextVersion.findUnique({
        where: { id: options.contextVersionId },
      })
    : await prisma.contextVersion.findFirst({
        where: { isActive: true },
      });

  if (!context) {
    throw new Error(
      'No active product context found. Complete the onboarding setup first.'
    );
  }

  // Extract product name from positioning or ICP
  const productName = extractProductName(context);

  // Load skills
  const { content: skillContent, skillNames } = loadSkillsForMode(
    options.mode,
    options.artifactType
  );

  // Build sections in order
  const sections: string[] = [];

  // 1. Role
  sections.push(buildRoleSection(productName));

  // 2. Product context
  const contextSection = buildContextSection(context);
  if (contextSection) sections.push(contextSection);

  // 3. Skill frameworks
  sections.push(`# Skill Frameworks\n\n${skillContent}`);

  // 4. Performance history (create mode only)
  if (options.mode === 'create' && options.artifactType) {
    const perfSection = await buildPerformanceSection(options.artifactType);
    if (perfSection) sections.push(perfSection);
  }

  // 4b. Featured customer quotes (create and strategy modes)
  if (options.mode === 'create' || options.mode === 'strategy') {
    const featuredQuotes = await prisma.researchQuote.findMany({
      where: { isFeatured: true },
      take: 10,
      include: { entry: { select: { contactSegment: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (featuredQuotes.length > 0) {
      const lines = featuredQuotes.map(
        (q) =>
          `- "${q.quote}" — ${q.entry.contactSegment ?? 'customer'} (${q.theme ?? 'general'})`
      );
      sections.push(`## Featured Customer Quotes\n${lines.join('\n')}`);
    }
  }

  // 4c. Published content awareness (strategy and create modes)
  if (options.mode === 'strategy' || options.mode === 'create') {
    const recentContent = await prisma.contentPiece.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
      take: 5,
      select: {
        title: true,
        contentType: true,
        targetKeyword: true,
        publishedAt: true,
        excerpt: true,
      },
    });

    if (recentContent.length > 0) {
      const lines = recentContent.map(
        (c) =>
          `- ${c.title} (${c.contentType}${
            c.targetKeyword ? ` | keyword: ${c.targetKeyword}` : ''
          }) — published ${c.publishedAt?.toISOString().slice(0, 10) ?? 'unknown'}`
      );
      sections.push(`## Published Content\n${lines.join('\n')}`);
    }
  }

  // 5. Mode instructions
  sections.push(
    `# Session Mode: ${options.mode}\n\n${MODE_INSTRUCTIONS[options.mode]}`
  );

  // 6. Output format
  sections.push(`# Output Instructions\n\n${OUTPUT_INSTRUCTIONS}`);

  return {
    systemPrompt: sections.join('\n\n---\n\n'),
    skillNames,
    contextVersionId: context.id,
  };
}

// --- Helpers ---

function formatJson(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item: unknown) => {
        if (typeof item === 'string') return `- ${item}`;
        if (typeof item === 'object' && item !== null) {
          return Object.entries(item as Record<string, unknown>)
            .map(([k, v]) => `- **${k}**: ${v}`)
            .join('\n');
        }
        return `- ${String(item)}`;
      })
      .join('\n');
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([k, v]) =>
          `**${k}**: ${typeof v === 'string' ? v : JSON.stringify(v)}`
      )
      .join('\n');
  }
  return String(value);
}

function extractProductName(context: {
  positioningStatement: string | null;
  icpDefinition: unknown;
}): string {
  // Try to extract from positioning statement
  if (context.positioningStatement) {
    // Common pattern: "ProductName is..." or "ProductName: ..."
    const match = context.positioningStatement.match(/^([^:.—\-]+)/);
    if (match) return match[1].trim();
  }
  return 'your product';
}
