/**
 * Tests for lib/ai/skills.ts — Skill loading, mode mapping, error handling
 *
 * These tests exercise the pure functions in skills.ts using the real skill
 * files on disk (the /skills directory is checked into the repo). No mocks
 * needed for file I/O — we validate against the actual skill content.
 */

import { describe, it, expect, vi } from 'vitest';
import { loadSkills, loadSkillsForMode, getSkillNamesForMode } from '@/lib/ai/skills';
import type { SessionMode, ArtifactType } from '@/types';

// Mock the DB layer — skills.test.ts exercises filesystem loading via real
// SKILL.md files; DB-installed skills are tested separately in installed-skills.test.ts.
vi.mock('@/lib/db/installed-skills', () => ({
  getInstalledSkillByName: vi.fn().mockResolvedValue(null),
}));

// ---------------------------------------------------------------------------
// loadSkills — loads specific skills by name
// ---------------------------------------------------------------------------

describe('loadSkills', () => {
  it('loads a single skill and wraps it with a section header', async () => {
    const result = await loadSkills(['copywriting']);
    expect(result).toContain('## Skill: copywriting');
    // The real SKILL.md starts with YAML front-matter (---)
    expect(result.length).toBeGreaterThan(100);
  });

  it('loads multiple skills separated by dividers', async () => {
    const result = await loadSkills(['copywriting', 'page-cro']);
    expect(result).toContain('## Skill: copywriting');
    expect(result).toContain('## Skill: page-cro');
    expect(result).toContain('---');
  });

  it('returns empty string for an empty array', async () => {
    const result = await loadSkills([]);
    expect(result).toBe('');
  });

  it('throws a descriptive error for a missing skill', async () => {
    await expect(loadSkills(['nonexistent-skill'])).rejects.toThrow(
      /Skill file not found: nonexistent-skill/
    );
  });

  it('throws for a skill with a missing SKILL.md file', async () => {
    await expect(loadSkills(['__does_not_exist__'])).rejects.toThrow(
      /Skill file not found/
    );
  });
});

// ---------------------------------------------------------------------------
// isValidSkillName — path traversal guard (tested via loadSkills)
// ---------------------------------------------------------------------------

describe('isValidSkillName (path traversal guard via loadSkills)', () => {
  it('rejects skill names containing directory traversal (..)', async () => {
    await expect(loadSkills(['../etc/passwd'])).rejects.toThrow(
      /Invalid skill name/
    );
  });

  it('rejects skill names containing forward slashes', async () => {
    await expect(loadSkills(['some/path'])).rejects.toThrow(
      /Invalid skill name/
    );
  });

  it('rejects skill names containing backslashes', async () => {
    await expect(loadSkills(['some\\path'])).rejects.toThrow(
      /Invalid skill name/
    );
  });

  it('rejects skill names containing dots', async () => {
    await expect(loadSkills(['skill.name'])).rejects.toThrow(
      /Invalid skill name/
    );
  });

  it('rejects skill names with spaces', async () => {
    await expect(loadSkills(['skill name'])).rejects.toThrow(
      /Invalid skill name/
    );
  });

  it('rejects empty string skill names', async () => {
    await expect(loadSkills([''])).rejects.toThrow(
      /Invalid skill name/
    );
  });

  it('rejects skill names with special characters', async () => {
    const malicious = ['@evil', '$money', '!bang', 'semi;colon', 'back`tick'];
    for (const name of malicious) {
      await expect(loadSkills([name])).rejects.toThrow(/Invalid skill name/);
    }
  });

  it('accepts valid skill names with hyphens', async () => {
    // This will fail with "Skill file not found" not "Invalid skill name"
    // because the name is valid but the file doesn't exist
    await expect(loadSkills(['valid-skill-name'])).rejects.toThrow(
      /Skill file not found/
    );
  });

  it('accepts valid skill names with underscores', async () => {
    await expect(loadSkills(['valid_skill_name'])).rejects.toThrow(
      /Skill file not found/
    );
  });

  it('accepts valid skill names with numbers', async () => {
    await expect(loadSkills(['skill123'])).rejects.toThrow(
      /Skill file not found/
    );
  });

  it('provides a helpful error message for invalid names', async () => {
    await expect(loadSkills(['../traversal'])).rejects.toThrow(
      /Skill names may only contain letters, numbers, hyphens, and underscores/
    );
  });
});

// ---------------------------------------------------------------------------
// getSkillNamesForMode — resolves skill names without file I/O
// ---------------------------------------------------------------------------

describe('getSkillNamesForMode', () => {
  it('returns the correct skills for strategy mode', () => {
    const names = getSkillNamesForMode('strategy');
    expect(names).toContain('product-marketing-context');
    expect(names).toContain('marketing-psychology');
    expect(names).toContain('marketing-ideas');
    expect(names).toContain('launch-strategy');
    expect(names).toContain('competitor-alternatives');
    expect(names).toHaveLength(5);
  });

  it('returns the correct skills for feedback mode', () => {
    const names = getSkillNamesForMode('feedback');
    expect(names).toEqual(['customer-research']);
  });

  it('returns the correct skills for analyze mode', () => {
    const names = getSkillNamesForMode('analyze');
    expect(names).toContain('analytics-tracking');
    expect(names).toContain('ab-test-setup');
    expect(names).toHaveLength(2);
  });

  it('returns the correct skills for optimize mode', () => {
    const names = getSkillNamesForMode('optimize');
    expect(names).toContain('page-cro');
    expect(names).toContain('copy-editing');
    expect(names).toContain('ab-test-setup');
    expect(names).toContain('signup-flow-cro');
    expect(names).toContain('onboarding-cro');
    expect(names).toHaveLength(5);
  });

  it('returns default create skills when no artifact type is given', () => {
    const names = getSkillNamesForMode('create');
    expect(names).toEqual(['copywriting']);
  });

  it('returns artifact-type-specific skills for create mode', () => {
    const names = getSkillNamesForMode('create', 'email_sequence');
    expect(names).toEqual(['email-sequence']);
  });

  it('returns multiple skills for landing_page artifact type', () => {
    const names = getSkillNamesForMode('create', 'landing_page');
    expect(names).toEqual(['copywriting', 'page-cro']);
  });

  it('falls back to default create skills for unmapped artifact type', () => {
    // 'other' is not in ARTIFACT_TYPE_SKILLS
    const names = getSkillNamesForMode('create', 'other');
    expect(names).toEqual(['copywriting']);
  });

  it('maps every defined artifact type to the expected skills', () => {
    const mappings: Array<[ArtifactType, string[]]> = [
      ['copywriting', ['copywriting']],
      ['email_sequence', ['email-sequence']],
      ['cold_email', ['cold-email']],
      ['social_content', ['social-content']],
      ['ad_creative', ['ad-creative']],
      ['landing_page', ['copywriting', 'page-cro']],
      ['one_pager', ['sales-enablement']],
      ['positioning', ['product-marketing-context']],
      ['messaging', ['product-marketing-context']],
      ['content_strategy', ['content-strategy']],
      ['ab_test', ['ab-test-setup']],
    ];

    for (const [artifactType, expectedSkills] of mappings) {
      expect(getSkillNamesForMode('create', artifactType)).toEqual(
        expectedSkills
      );
    }
  });
});

// ---------------------------------------------------------------------------
// loadSkillsForMode — resolves + loads (integration with real files)
// ---------------------------------------------------------------------------

describe('loadSkillsForMode', () => {
  it('loads skills for strategy mode from real files', async () => {
    const { content, skillNames } = await loadSkillsForMode('strategy');
    expect(skillNames).toHaveLength(5);
    expect(content).toContain('## Skill: product-marketing-context');
    expect(content).toContain('## Skill: marketing-psychology');
  });

  it('loads skills for create mode with artifact type', async () => {
    const { content, skillNames } = await loadSkillsForMode('create', 'email_sequence');
    expect(skillNames).toEqual(['email-sequence']);
    expect(content).toContain('## Skill: email-sequence');
  });

  it('throws when create mode is used without artifact type', async () => {
    await expect(loadSkillsForMode('create')).rejects.toThrow(
      /Artifact type is required for create mode/
    );
  });

  it('loads skills for feedback mode', async () => {
    const { content, skillNames } = await loadSkillsForMode('feedback');
    expect(skillNames).toEqual(['customer-research']);
    expect(content).toContain('## Skill: customer-research');
  });

  it('loads skills for analyze mode', async () => {
    const { content, skillNames } = await loadSkillsForMode('analyze');
    expect(skillNames).toHaveLength(2);
    expect(content).toContain('## Skill: analytics-tracking');
  });

  it('loads skills for optimize mode', async () => {
    const { content, skillNames } = await loadSkillsForMode('optimize');
    expect(skillNames).toHaveLength(5);
    expect(content).toContain('## Skill: page-cro');
  });

  // Verify every mode produces non-empty skill content
  it('all non-create modes produce non-empty content', async () => {
    const modes: SessionMode[] = ['strategy', 'feedback', 'analyze', 'optimize'];
    for (const mode of modes) {
      const { content } = await loadSkillsForMode(mode);
      expect(content.length).toBeGreaterThan(0);
    }
  });

  // Verify all referenced skill directories actually exist
  it('every skill referenced in MODE_SKILLS exists on disk', async () => {
    const modes: SessionMode[] = ['strategy', 'feedback', 'analyze', 'optimize'];
    for (const mode of modes) {
      // If a file is missing, loadSkillsForMode will throw
      await loadSkillsForMode(mode);
    }
  });

  it('every skill referenced in ARTIFACT_TYPE_SKILLS exists on disk', async () => {
    const artifactTypes: ArtifactType[] = [
      'copywriting',
      'email_sequence',
      'cold_email',
      'social_content',
      'ad_creative',
      'landing_page',
      'one_pager',
      'positioning',
      'messaging',
      'content_strategy',
      'ab_test',
    ];
    for (const at of artifactTypes) {
      await loadSkillsForMode('create', at);
    }
  });
});
