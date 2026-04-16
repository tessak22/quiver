/**
 * Tests for deleteCampaign — refuses when any child is non-empty.
 * Prisma client is mocked; no DB in test env.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => {
  const prismaMock = {
    campaign: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    artifact: { count: vi.fn() },
    session: { count: vi.fn() },
    performanceLog: { count: vi.fn() },
    contentPiece: { count: vi.fn() },
    researchEntry: { count: vi.fn() },
    // $transaction(fn) just runs fn with the same prisma mock as the tx client
    $transaction: vi.fn((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)),
  };
  return { prisma: prismaMock };
});

import { deleteCampaign, CampaignNotEmptyError } from '@/lib/db/campaigns';
import { prisma } from '@/lib/db';

const pc = prisma as unknown as {
  campaign: {
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  artifact: { count: ReturnType<typeof vi.fn> };
  session: { count: ReturnType<typeof vi.fn> };
  performanceLog: { count: ReturnType<typeof vi.fn> };
  contentPiece: { count: ReturnType<typeof vi.fn> };
  researchEntry: { count: ReturnType<typeof vi.fn> };
};

describe('deleteCampaign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pc.campaign.findUnique.mockResolvedValue({ id: 'c1', name: 'Test' });
    pc.artifact.count.mockResolvedValue(0);
    pc.session.count.mockResolvedValue(0);
    pc.performanceLog.count.mockResolvedValue(0);
    pc.contentPiece.count.mockResolvedValue(0);
    pc.researchEntry.count.mockResolvedValue(0);
    pc.campaign.delete.mockResolvedValue({ id: 'c1' });
  });

  it('deletes a campaign with no children', async () => {
    const result = await deleteCampaign('c1');
    expect(pc.campaign.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(result.id).toBe('c1');
  });

  it('throws when campaign is missing', async () => {
    pc.campaign.findUnique.mockResolvedValue(null);
    await expect(deleteCampaign('missing')).rejects.toThrow(/not found/i);
    expect(pc.campaign.delete).not.toHaveBeenCalled();
  });

  it('throws CampaignNotEmptyError with counts when artifacts exist', async () => {
    pc.artifact.count.mockResolvedValue(3);
    pc.session.count.mockResolvedValue(1);

    let thrown: unknown;
    try {
      await deleteCampaign('c1');
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(CampaignNotEmptyError);
    const err = thrown as CampaignNotEmptyError;
    expect(err.counts).toEqual({
      artifacts: 3,
      sessions: 1,
      performanceLogs: 0,
      contentPieces: 0,
      researchEntries: 0,
    });
    expect(pc.campaign.delete).not.toHaveBeenCalled();
  });

  it('counts contentPieces and researchEntries too', async () => {
    pc.contentPiece.count.mockResolvedValue(2);
    pc.researchEntry.count.mockResolvedValue(1);
    await expect(deleteCampaign('c1')).rejects.toBeInstanceOf(CampaignNotEmptyError);
  });
});
