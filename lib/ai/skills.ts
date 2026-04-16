/**
 * Skill Loading — lib/ai/skills.ts
 *
 * What it does: Loads marketing skill framework files from /skills and
 *   returns their content for injection into AI session system prompts.
 *
 * What it reads from: Markdown files in /skills/[skill-name]/SKILL.md
 *
 * What it produces: Concatenated skill content strings with section headers,
 *   ready for system prompt injection.
 *
 * Edge cases:
 *   - Missing skill file: throws a descriptive error (not a silent empty string).
 *   - Unknown mode: throws with the list of valid modes.
 *   - Empty skill file: throws rather than injecting empty content.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { SessionMode, ArtifactType } from '@/types';
import { getInstalledSkillByName } from '@/lib/db/installed-skills';

const SKILLS_DIR = join(process.cwd(), 'skills');

// In-memory cache for skill file contents (TTL: 5 minutes)
const SKILL_CACHE_TTL = 300_000;
const skillCache = new Map<string, { content: string; loadedAt: number }>();

/** Skills loaded per session mode */
const MODE_SKILLS: Record<SessionMode, string[]> = {
  strategy: [
    'product-marketing-context',
    'marketing-psychology',
    'marketing-ideas',
    'launch-strategy',
    'competitor-alternatives',
  ],
  create: [], // Determined by artifact type
  feedback: ['customer-research'],
  analyze: ['analytics-tracking', 'ab-test-setup'],
  optimize: [
    'page-cro',
    'copy-editing',
    'ab-test-setup',
    'signup-flow-cro',
    'onboarding-cro',
  ],
};

/** Artifact type → skill mapping for create mode */
const ARTIFACT_TYPE_SKILLS: Partial<Record<ArtifactType, string[]>> = {
  copywriting: ['copywriting'],
  email_sequence: ['email-sequence'],
  cold_email: ['cold-email'],
  social_content: ['social-content'],
  ad_creative: ['ad-creative'],
  landing_page: ['copywriting', 'page-cro'],
  one_pager: ['sales-enablement'],
  positioning: ['product-marketing-context'],
  messaging: ['product-marketing-context'],
  content_strategy: ['content-strategy'],
  ab_test: ['ab-test-setup'],
};

const DEFAULT_CREATE_SKILLS = ['copywriting'];

/**
 * Load specific skill files by name and return their concatenated content.
 * Each skill is wrapped with a section header.
 *
 * @throws Error if a skill file is missing or empty.
 */
// Validate skill name to prevent path traversal attacks.
// Only allows alphanumeric characters, hyphens, and underscores.
function isValidSkillName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

export async function loadSkills(skillNames: string[]): Promise<string> {
  const sections: string[] = [];
  const now = Date.now();

  for (const name of skillNames) {
    if (!isValidSkillName(name)) {
      throw new Error(
        `Invalid skill name: "${name}". Skill names may only contain letters, numbers, hyphens, and underscores.`
      );
    }

    // 1. DB-installed skill wins on name collision (issue #78 contract).
    const installed = await getInstalledSkillByName(name);
    if (installed) {
      sections.push(`## Skill: ${name}\n\n${installed.skillContent}`);
      continue;
    }

    // 2. Filesystem cache hit
    const cached = skillCache.get(name);
    if (cached && now - cached.loadedAt < SKILL_CACHE_TTL) {
      sections.push(`## Skill: ${name}\n\n${cached.content}`);
      continue;
    }

    // 3. Filesystem read
    const filePath = join(SKILLS_DIR, name, 'SKILL.md');
    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(
        `Skill file not found: ${name}. Expected at: ${filePath}. ` +
          `Run the skills update action in settings to fetch the latest skills.`,
        { cause: error }
      );
    }

    if (!content.trim()) {
      throw new Error(
        `Skill file is empty: ${name} at ${filePath}. ` +
          `The skills directory may be corrupted. Try updating skills from settings.`
      );
    }

    skillCache.set(name, { content, loadedAt: now });
    sections.push(`## Skill: ${name}\n\n${content}`);
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Resolve and load the correct skills for a session mode.
 * For create mode, requires an artifact type to determine which skills to load.
 *
 * @throws Error if mode is invalid or artifact type is missing for create mode.
 */
export async function loadSkillsForMode(
  mode: SessionMode,
  artifactType?: ArtifactType
): Promise<{ content: string; skillNames: string[] }> {
  let skillNames: string[];

  if (mode === 'create') {
    if (!artifactType) {
      throw new Error(
        'Artifact type is required for create mode sessions. ' +
          'Specify the type of content to create.'
      );
    }
    skillNames = ARTIFACT_TYPE_SKILLS[artifactType] ?? DEFAULT_CREATE_SKILLS;
  } else {
    skillNames = MODE_SKILLS[mode];
  }

  return {
    content: await loadSkills(skillNames),
    skillNames,
  };
}

/**
 * Get the list of skill names that would be loaded for a mode,
 * without actually reading the files. Used for UI display.
 */
export function getSkillNamesForMode(
  mode: SessionMode,
  artifactType?: ArtifactType
): string[] {
  if (mode === 'create') {
    if (!artifactType) return DEFAULT_CREATE_SKILLS;
    return ARTIFACT_TYPE_SKILLS[artifactType] ?? DEFAULT_CREATE_SKILLS;
  }
  return MODE_SKILLS[mode];
}
