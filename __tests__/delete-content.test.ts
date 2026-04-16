/**
 * Tests for deleteContentPiece — hard delete; distributions + metricSnapshots
 * cascade via schema onDelete:Cascade; derived content (parentContentId children)
 * nulls out via Prisma default SetNull.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    contentPiece: { delete: vi.fn() },
  },
}));

import { deleteContentPiece } from '@/lib/db/content';
import { prisma } from '@/lib/db';

describe('deleteContentPiece', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hard-deletes the content piece', async () => {
    (prisma.contentPiece.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });
    const result = await deleteContentPiece('c1');
    expect(prisma.contentPiece.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(result.id).toBe('c1');
  });
});
