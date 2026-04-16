/**
 * Tests for DELETE /api/sessions/[id] — hard delete with ownership + 404/403/204.
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

vi.mock('@/lib/db/sessions', () => ({
  getSession: vi.fn(),
  updateSessionTitle: vi.fn(),
  archiveSession: vi.fn(),
  deleteSession: vi.fn(),
}));

import { DELETE } from '@/app/api/sessions/[id]/route';
import { getSession, deleteSession } from '@/lib/db/sessions';

function req(id = 's1') {
  return [
    new Request(`http://localhost/api/sessions/${id}`, { method: 'DELETE' }),
    { params: { id } },
  ] as const;
}

describe('DELETE /api/sessions/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 204 on successful delete when createdBy matches auth user', async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: 's1',
      title: 'Test',
      createdBy: 'user-1',
    } as never);
    vi.mocked(deleteSession).mockResolvedValue({ id: 's1' } as never);
    const res = await DELETE(...req());
    expect(res.status).toBe(204);
    expect(deleteSession).toHaveBeenCalledWith('s1');
  });

  it('returns 404 when session not found', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await DELETE(...req());
    expect(res.status).toBe(404);
    expect(deleteSession).not.toHaveBeenCalled();
  });

  it('returns 403 when createdBy does not match auth user', async () => {
    vi.mocked(getSession).mockResolvedValue({
      id: 's1',
      title: 'Test',
      createdBy: 'someone-else',
    } as never);
    const res = await DELETE(...req());
    expect(res.status).toBe(403);
    expect(deleteSession).not.toHaveBeenCalled();
  });
});
