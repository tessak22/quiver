/**
 * Tests for lib/team-create.ts — Supabase + Neon two-step creation with
 * rollback on partial failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createUser, deleteUser, upsert } = vi.hoisted(() => ({
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('@/lib/env', () => ({
  getSupabaseAdminClient: () => ({
    auth: { admin: { createUser, deleteUser } },
  }),
}));

vi.mock('@/lib/db', () => ({
  prisma: { teamMember: { upsert } },
}));

import { createTeamMember } from '@/lib/team-create';

beforeEach(() => vi.clearAllMocks());

describe('createTeamMember', () => {
  it('creates Supabase user then Neon row and returns generated password', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null });
    upsert.mockResolvedValue({});

    const result = await createTeamMember({ email: 'A@B.c', name: ' Alice ', role: 'member' });

    expect(result.userId).toBe('u-1');
    expect(result.email).toBe('a@b.c');
    expect(result.name).toBe('Alice');
    expect(result.role).toBe('member');
    expect(result.password).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'a@b.c',
      email_confirm: true,
      user_metadata: { name: 'Alice', role: 'member' },
    }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u-1' },
    }));
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('throws if Supabase createUser fails', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'taken' } });
    await expect(
      createTeamMember({ email: 'x@y.z', name: 'X', role: 'member' }),
    ).rejects.toThrow(/taken/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rolls back the Supabase user when Neon upsert fails', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null });
    upsert.mockRejectedValue(new Error('db down'));

    await expect(
      createTeamMember({ email: 'x@y.z', name: 'X', role: 'member' }),
    ).rejects.toThrow(/db down/);
    expect(deleteUser).toHaveBeenCalledWith('u-2');
  });
});
