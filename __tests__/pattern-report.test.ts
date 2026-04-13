/**
 * Tests for lib/ai/pattern-report.ts — Monthly pattern report generator
 *
 * What this tests: The generatePatternReport function's end-to-end behavior
 *   with mocked dependencies (no live AI calls, no DB writes). Focuses on:
 *   - Skipping when insufficient PerformanceLog data (< 5 entries in 30 days)
 *   - Calling AI and creating an Artifact when 5+ entries exist
 *   - Correct artifact title format: "Pattern Report — [Month YYYY]"
 *   - Not creating artifact when skipped
 *   - Context proposal logging when AI returns proposals
 *
 * Mocks: prisma (via @/lib/db), sendMessage (via @/lib/ai/client),
 *   getDefaultCampaign (via @/lib/db/campaigns), createPerformanceLog (via @/lib/db/performance)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generatePatternReport } from '@/lib/ai/pattern-report';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  prisma: {
    performanceLog: {
      findMany: vi.fn(),
    },
    artifact: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/ai/client', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('@/lib/db/campaigns', () => ({
  getDefaultCampaign: vi.fn(),
}));

vi.mock('@/lib/db/performance', () => ({
  createPerformanceLog: vi.fn(),
}));

import { prisma } from '@/lib/db';
import { sendMessage } from '@/lib/ai/client';
import { getDefaultCampaign } from '@/lib/db/campaigns';
import { createPerformanceLog } from '@/lib/db/performance';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLog(overrides: Record<string, unknown> = {}) {
  return {
    id: 'log-1',
    logType: 'result',
    whatWorked: 'Email subject lines with questions',
    whatDidnt: 'Long copy above the fold',
    qualitativeNotes: 'CTR improved by 12%',
    metrics: { ctr: 0.12 },
    campaignId: 'campaign-1',
    recordedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

const FIVE_LOGS = Array.from({ length: 5 }, (_, i) =>
  makeLog({ id: `log-${i + 1}` })
);

const AI_RESPONSE_TEXT = `
Here are the key patterns from this month:

1. Short subject lines outperformed long ones by 18%.
2. CTA button placement above the fold improved conversions.
3. Personalization tokens boosted open rates.

**Recommendations:** Focus on punchy subject lines and above-fold CTAs.
`;

const AI_RESPONSE_WITH_PROPOSALS = JSON.stringify({
  summary: 'Key patterns identified.',
  contextProposals: [
    {
      field: 'positioningStatement',
      current: 'We help teams ship faster.',
      proposed: 'We help marketing teams compound results.',
      rationale: 'Pattern data shows compounding language resonates.',
    },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generatePatternReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDefaultCampaign).mockResolvedValue({
      id: 'default-campaign',
      name: 'Unassigned',
    } as never);
    vi.mocked(prisma.artifact.create).mockResolvedValue({
      id: 'artifact-123',
      title: 'Pattern Report — April 2026',
      type: 'other',
      content: AI_RESPONSE_TEXT,
      status: 'draft',
      createdBy: 'cron',
      campaignId: 'default-campaign',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    vi.mocked(createPerformanceLog).mockResolvedValue(undefined as never);
    vi.mocked(sendMessage).mockResolvedValue({ content: AI_RESPONSE_TEXT });
  });

  // -------------------------------------------------------------------------
  // Insufficient data — skip
  // -------------------------------------------------------------------------

  it('returns skipped with reason insufficient_data when fewer than 5 PerformanceLog entries exist', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => makeLog({ id: `log-${i}` })) as never
    );

    const result = await generatePatternReport();

    expect(result).toEqual({ skipped: true, reason: 'insufficient_data' });
  });

  it('returns skipped when zero PerformanceLog entries exist', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue([] as never);

    const result = await generatePatternReport();

    expect(result).toEqual({ skipped: true, reason: 'insufficient_data' });
  });

  it('does NOT call AI when skipped due to insufficient data', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      [makeLog()] as never
    );

    await generatePatternReport();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does NOT create an artifact when skipped due to insufficient data', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => makeLog({ id: `log-${i}` })) as never
    );

    await generatePatternReport();

    expect(prisma.artifact.create).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Sufficient data — AI call + artifact creation
  // -------------------------------------------------------------------------

  it('calls AI and creates artifact when 5 or more entries exist', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      FIVE_LOGS as never
    );

    const result = await generatePatternReport();

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(prisma.artifact.create).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ skipped: false, artifactId: 'artifact-123' });
  });

  it('processes exactly 5 entries (boundary value — minimum threshold)', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      FIVE_LOGS as never
    );

    const result = await generatePatternReport();

    expect(result).toMatchObject({ skipped: false });
  });

  // -------------------------------------------------------------------------
  // Artifact title format
  // -------------------------------------------------------------------------

  it('creates artifact with title in format "Pattern Report — [Month YYYY]"', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      FIVE_LOGS as never
    );

    await generatePatternReport();

    const createCall = vi.mocked(prisma.artifact.create).mock.calls[0][0];
    const title = createCall.data.title as string;

    // Must match "Pattern Report — Month YYYY" format
    expect(title).toMatch(/^Pattern Report — [A-Z][a-z]+ \d{4}$/);
    // Verify the "—" em dash is used (not hyphen)
    expect(title).toContain('Pattern Report — ');
  });

  it('saves artifact with type "other", status "draft", and createdBy "cron"', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      FIVE_LOGS as never
    );

    await generatePatternReport();

    expect(prisma.artifact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'other',
          status: 'draft',
          createdBy: 'cron',
        }),
      })
    );
  });

  it('returns the created artifactId and title in result', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      FIVE_LOGS as never
    );

    const result = await generatePatternReport();

    expect(result).toMatchObject({
      skipped: false,
      artifactId: 'artifact-123',
      title: 'Pattern Report — April 2026',
    });
  });

  // -------------------------------------------------------------------------
  // Context proposals
  // -------------------------------------------------------------------------

  it('creates a context_proposal performance log when AI returns context proposals in JSON', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      FIVE_LOGS as never
    );
    vi.mocked(sendMessage).mockResolvedValue({
      content: AI_RESPONSE_WITH_PROPOSALS,
    });

    const result = await generatePatternReport();

    expect(result).toMatchObject({ skipped: false, proposalCount: 1 });
    expect(createPerformanceLog).toHaveBeenCalledWith(
      expect.objectContaining({
        logType: 'context_proposal',
      })
    );
  });

  it('returns proposalCount 0 when AI output contains no proposals', async () => {
    vi.mocked(prisma.performanceLog.findMany).mockResolvedValue(
      FIVE_LOGS as never
    );
    vi.mocked(sendMessage).mockResolvedValue({ content: AI_RESPONSE_TEXT });

    const result = await generatePatternReport();

    expect(result).toMatchObject({ skipped: false, proposalCount: 0 });
    expect(createPerformanceLog).not.toHaveBeenCalled();
  });
});
