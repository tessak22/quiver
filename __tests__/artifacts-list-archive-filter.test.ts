/**
 * Tests for GET /api/artifacts archive filter behavior.
 *
 * Verifies the default-exclude-archived semantics introduced in the MCP
 * delete + archive hygiene hotfix:
 *   - No params → excludeArchived: true is passed to getArtifacts
 *   - ?includeArchived=true → excludeArchived: false
 *   - ?status=archived → status is passed verbatim, excludeArchived: false
 *
 * @/lib/auth and @/lib/db/artifacts are mocked — no live DB or auth in tests.
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

vi.mock('@/lib/db/artifacts', () => ({
  getArtifacts: vi.fn().mockResolvedValue([]),
  createArtifact: vi.fn(),
}));

vi.mock('@/lib/db/campaigns', () => ({
  getDefaultCampaign: vi.fn(),
}));

vi.mock('@/lib/db/context', () => ({
  getActiveContext: vi.fn(),
}));

import { GET } from '@/app/api/artifacts/route';
import { getArtifacts } from '@/lib/db/artifacts';

const mockGetArtifacts = vi.mocked(getArtifacts);

function req(search = '') {
  const qs = search.length > 0 ? `?${search}` : '';
  return new Request(`http://localhost/api/artifacts${qs}`);
}

describe('GET /api/artifacts — archive filter defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetArtifacts.mockResolvedValue([]);
  });

  it('defaults to excludeArchived: true when no params are provided', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockGetArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({ excludeArchived: true, status: undefined })
    );
  });

  it('passes excludeArchived: false when ?includeArchived=true', async () => {
    const res = await GET(req('includeArchived=true'));
    expect(res.status).toBe(200);
    expect(mockGetArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({ excludeArchived: false, status: undefined })
    );
  });

  it('passes status verbatim and excludeArchived: false when ?status=archived', async () => {
    const res = await GET(req('status=archived'));
    expect(res.status).toBe(200);
    expect(mockGetArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived', excludeArchived: false })
    );
  });
});
