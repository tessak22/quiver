/**
 * Tests that `assembleSystemPrompt` correctly merges `extraInstalledSkillNames`
 * into the system prompt and the persisted `skillNames`.
 *
 * The Prisma client and skill loader are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => {
  const installedSkill = { findFirst: vi.fn() };
  return {
    prisma: {
      contextVersion: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'ctx-1',
          positioningStatement: 'Quiver is a marketing command center.',
          icpDefinition: null,
          messagingPillars: null,
          competitiveLandscape: null,
          customerLanguage: null,
          proofPoints: null,
          activeHypotheses: null,
          brandVoice: null,
          wordsToUse: [],
          wordsToAvoid: [],
        }),
        findUnique: vi.fn(),
      },
      researchQuote: { findMany: vi.fn().mockResolvedValue([]) },
      contentPiece: { findMany: vi.fn().mockResolvedValue([]) },
      artifact: { findMany: vi.fn().mockResolvedValue([]) },
      installedSkill,
    },
  };
});

vi.mock('@/lib/db/installed-skills', () => ({
  getInstalledSkillByName: vi.fn(),
}));

import { assembleSystemPrompt } from '@/lib/ai/session';
import { getInstalledSkillByName } from '@/lib/db/installed-skills';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getInstalledSkillByName).mockResolvedValue(null);
});

describe('assembleSystemPrompt extra skills', () => {
  it('does not change skill content when extras is empty', async () => {
    const result = await assembleSystemPrompt({ mode: 'feedback' });
    expect(result.systemPrompt).toContain('## Skill: customer-research');
    expect(result.skillNames).toEqual(['customer-research']);
  });

  it('appends installed skill content when extras is provided', async () => {
    vi.mocked(getInstalledSkillByName).mockImplementation(async (name) => {
      if (name === 'devrel-growth-advisor') {
        return {
          id: 'inst-1',
          name: 'devrel-growth-advisor',
          skillContent: '# DevRel content',
          isEnabled: true,
        } as never;
      }
      return null;
    });

    const result = await assembleSystemPrompt({
      mode: 'feedback',
      extraInstalledSkillNames: ['devrel-growth-advisor'],
    });

    expect(result.systemPrompt).toContain('## Skill: customer-research');
    expect(result.systemPrompt).toContain('# DevRel content');
    expect(result.skillNames).toEqual(['customer-research', 'devrel-growth-advisor']);
  });

  it('skips extras already loaded by mode default', async () => {
    const result = await assembleSystemPrompt({
      mode: 'feedback',
      extraInstalledSkillNames: ['customer-research'],
    });
    expect(result.skillNames).toEqual(['customer-research']);
    // Only one occurrence of the section header
    expect(result.systemPrompt.match(/## Skill: customer-research/g)).toHaveLength(1);
  });
});
