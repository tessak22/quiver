/**
 * Tests for DELETE /api/content/[id] — hard delete.
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

vi.mock('@/lib/db/content', () => ({
  getContentPiece: vi.fn(),
  updateContentPiece: vi.fn(),
  deleteContentPiece: vi.fn(),
  getContentPerformanceSignal: vi.fn(),
}));

import { DELETE } from '@/app/api/content/[id]/route';
import { getContentPiece, deleteContentPiece } from '@/lib/db/content';

function req(id = 'c1') {
  return [
    new Request(`http://localhost/api/content/${id}`, { method: 'DELETE' }),
    { params: { id } },
  ] as const;
}

describe('DELETE /api/content/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 204 on successful delete', async () => {
    vi.mocked(getContentPiece).mockResolvedValue({ id: 'c1', title: 'Test' } as never);
    vi.mocked(deleteContentPiece).mockResolvedValue({ id: 'c1' } as never);
    const res = await DELETE(...req());
    expect(res.status).toBe(204);
    expect(deleteContentPiece).toHaveBeenCalledWith('c1');
  });

  it('returns 404 when content piece not found', async () => {
    vi.mocked(getContentPiece).mockResolvedValue(null);
    const res = await DELETE(...req());
    expect(res.status).toBe(404);
    expect(deleteContentPiece).not.toHaveBeenCalled();
  });
});
