/**
 * Tests for DELETE /api/campaigns/[id] — hard delete with 409 refuse on non-empty.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return Response.json(body, init);
    }
  },
}));

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({ id: 'user-1', role: 'member' }),
}));

vi.mock('@/lib/db/campaigns', () => ({
  getCampaign: vi.fn(),
  updateCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  CampaignNotEmptyError: class CampaignNotEmptyError extends Error {
    counts: Record<string, number>;
    constructor(counts: Record<string, number>) {
      super('Campaign has attached records');
      this.name = 'CampaignNotEmptyError';
      this.counts = counts;
    }
  },
  getCampaignSessions: vi.fn(),
  getCampaignArtifacts: vi.fn(),
  getCampaignPerformanceLogs: vi.fn(),
}));

import { DELETE } from '@/app/api/campaigns/[id]/route';
import {
  getCampaign,
  deleteCampaign,
  CampaignNotEmptyError,
} from '@/lib/db/campaigns';

function req(id = 'c1') {
  return [
    new Request(`http://localhost/api/campaigns/${id}`, { method: 'DELETE' }),
    { params: { id } },
  ] as const;
}

describe('DELETE /api/campaigns/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 204 on successful delete', async () => {
    vi.mocked(getCampaign).mockResolvedValue({ id: 'c1', name: 'Test' } as never);
    vi.mocked(deleteCampaign).mockResolvedValue({ id: 'c1' } as never);
    const res = await DELETE(...req());
    expect(res.status).toBe(204);
  });

  it('returns 404 when campaign not found', async () => {
    vi.mocked(getCampaign).mockResolvedValue(null);
    const res = await DELETE(...req());
    expect(res.status).toBe(404);
  });

  it('returns 409 with counts when campaign has children', async () => {
    vi.mocked(getCampaign).mockResolvedValue({ id: 'c1', name: 'Test' } as never);
    vi.mocked(deleteCampaign).mockRejectedValue(
      new (CampaignNotEmptyError as unknown as new (c: Record<string, number>) => Error)({
        artifacts: 3,
        sessions: 1,
        performanceLogs: 0,
        contentPieces: 0,
        researchEntries: 0,
      })
    );
    const res = await DELETE(...req());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.counts).toEqual({
      artifacts: 3,
      sessions: 1,
      performanceLogs: 0,
      contentPieces: 0,
      researchEntries: 0,
    });
  });
});
