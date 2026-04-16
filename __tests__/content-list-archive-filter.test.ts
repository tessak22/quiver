/**
 * Tests for GET /api/content archive filter behavior.
 *
 * Verifies the default-exclude-archived semantics introduced in the MCP
 * delete + archive hygiene hotfix:
 *   - No params → excludeArchived: true is passed to getContentPieces
 *   - ?includeArchived=true → excludeArchived: false
 *   - ?status=archived → status is passed verbatim, excludeArchived: false
 *
 * @/lib/auth and @/lib/db/content are mocked — no live DB or auth in tests.
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

vi.mock('@/lib/db/content', () => ({
  getContentPieces: vi.fn().mockResolvedValue([]),
  createContentPiece: vi.fn(),
  generateSlug: vi.fn(),
  isSlugAvailable: vi.fn(),
  getContentPerformanceSignal: vi.fn().mockReturnValue('no_data'),
}));

vi.mock('@/lib/db/context', () => ({
  getActiveContext: vi.fn(),
}));

import { GET } from '@/app/api/content/route';
import { getContentPieces } from '@/lib/db/content';

const mockGetContentPieces = vi.mocked(getContentPieces);

function req(search = '') {
  const qs = search.length > 0 ? `?${search}` : '';
  return new Request(`http://localhost/api/content${qs}`);
}

describe('GET /api/content — archive filter defaults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetContentPieces.mockResolvedValue([]);
  });

  it('defaults to excludeArchived: true when no params are provided', async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(mockGetContentPieces).toHaveBeenCalledWith(
      expect.objectContaining({ excludeArchived: true, status: undefined })
    );
  });

  it('passes excludeArchived: false when ?includeArchived=true', async () => {
    const res = await GET(req('includeArchived=true'));
    expect(res.status).toBe(200);
    expect(mockGetContentPieces).toHaveBeenCalledWith(
      expect.objectContaining({ excludeArchived: false, status: undefined })
    );
  });

  it('passes status verbatim and excludeArchived: false when ?status=archived', async () => {
    const res = await GET(req('status=archived'));
    expect(res.status).toBe(200);
    expect(mockGetContentPieces).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'archived', excludeArchived: false })
    );
  });
});
