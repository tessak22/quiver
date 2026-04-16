/**
 * Tests for GET /api/campaigns archive filter behavior.
 *
 * Verifies the default-exclude-archived semantics introduced in the MCP
 * delete + archive hygiene hotfix:
 *   - No params → excludeArchived: true is passed to getCampaigns
 *   - ?includeArchived=true → excludeArchived: false
 *   - ?status=archived → status is passed verbatim, excludeArchived: false
 *
 * @/lib/auth and @/lib/db/campaigns are mocked — no live DB or auth in tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn().mockResolvedValue({ id: 'user-1', role: 'viewer' }),
}));

vi.mock('@/lib/db/campaigns', () => ({
  getCampaigns: vi.fn().mockResolvedValue([]),
  createCampaign: vi.fn(),
}));

import { GET } from '@/app/api/campaigns/route';
import { getCampaigns } from '@/lib/db/campaigns';

const mockGetCampaigns = vi.mocked(getCampaigns);

function req(search = '') {
  const qs = search.length > 0 ? `?${search}` : '';
  return new Request(`http://localhost/api/campaigns${qs}`);
}

describe('GET /api/campaigns — archive filter defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCampaigns.mockResolvedValue([]);
  });

  it('defaults to excludeArchived: true when no params are provided', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockGetCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ excludeArchived: true, status: undefined })
    );
  });

  it('passes excludeArchived: false when ?includeArchived=true', async () => {
    const res = await GET(req('includeArchived=true'));
    expect(res.status).toBe(200);
    expect(mockGetCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ excludeArchived: false, status: undefined })
    );
  });

  it('passes status verbatim and excludeArchived: false when ?status=archived', async () => {
    const res = await GET(req('status=archived'));
    expect(res.status).toBe(200);
    expect(mockGetCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived', excludeArchived: false })
    );
  });
});
