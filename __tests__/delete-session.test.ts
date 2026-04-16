/**
 * Tests for deleteSession — hard delete; attached artifacts survive via FK SetNull.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    session: { delete: vi.fn() },
  },
}));

import { deleteSession } from '@/lib/db/sessions';
import { prisma } from '@/lib/db';

describe('deleteSession', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hard-deletes the session', async () => {
    (prisma.session.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 's1' });
    const result = await deleteSession('s1');
    expect(prisma.session.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(result.id).toBe('s1');
  });
});
