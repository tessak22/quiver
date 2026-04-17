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

// Provide a usable Prisma namespace for instanceof checks in team-create.ts.
vi.mock('@prisma/client', () => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    clientVersion: string;
    constructor(message: string, opts: { code: string; clientVersion?: string }) {
      super(message);
      this.name = 'PrismaClientKnownRequestError';
      this.code = opts.code;
      this.clientVersion = opts.clientVersion ?? 'test';
    }
  }
  return { Prisma: { PrismaClientKnownRequestError } };
});

import { createTeamMember, TeamMemberAlreadyExistsError } from '@/lib/team-create';
import { Prisma } from '@prisma/client';

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

  it('throws if Supabase createUser fails with a non-dupe error', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'taken', status: 500 } });
    await expect(
      createTeamMember({ email: 'x@y.z', name: 'X', role: 'member' }),
    ).rejects.toThrow(/taken/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('throws TeamMemberAlreadyExistsError on Supabase 422 dupe (pre-upsert)', async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { status: 422, message: 'A user with this email address has already been registered' },
    });
    await expect(
      createTeamMember({ email: 'dup@x.y', name: 'D', role: 'member' }),
    ).rejects.toBeInstanceOf(TeamMemberAlreadyExistsError);
    expect(upsert).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('rolls back the Supabase user when Neon upsert fails', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'u-2' } }, error: null });
    upsert.mockRejectedValue(new Error('db down'));

    await expect(
      createTeamMember({ email: 'x@y.z', name: 'X', role: 'member' }),
    ).rejects.toThrow(/db down/);
    expect(deleteUser).toHaveBeenCalledWith('u-2');
  });

  it('throws TeamMemberAlreadyExistsError + rolls back on Prisma P2002 unique-email', async () => {
    createUser.mockResolvedValue({ data: { user: { id: 'u-3' } }, error: null });
    upsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        { code: 'P2002' },
      ),
    );

    await expect(
      createTeamMember({ email: 'x@y.z', name: 'X', role: 'member' }),
    ).rejects.toBeInstanceOf(TeamMemberAlreadyExistsError);
    expect(deleteUser).toHaveBeenCalledWith('u-3');
  });
});
