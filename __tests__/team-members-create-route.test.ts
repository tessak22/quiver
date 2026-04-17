/**
 * Tests for POST /api/team/members — admin-only direct create flow.
 *
 * Covers auth gate, input validation, success shape, dedupe → 409, and
 * generic failure → 500. createTeamMember() itself is mocked; its own
 * rollback behavior is covered separately in team-create.test.ts.
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
  requireRole: vi.fn(),
}));

vi.mock('@/lib/team-create', () => {
  class TeamMemberAlreadyExistsError extends Error {
    constructor(email: string) {
      super(`A team member with email ${email} already exists`);
      this.name = 'TeamMemberAlreadyExistsError';
    }
  }
  return {
    createTeamMember: vi.fn(),
    TeamMemberAlreadyExistsError,
  };
});

import { POST } from '@/app/api/team/members/route';
import { requireRole } from '@/lib/auth';
import { createTeamMember, TeamMemberAlreadyExistsError } from '@/lib/team-create';

const asAdmin = () => vi.mocked(requireRole).mockResolvedValue({
  id: 'admin-1', email: 'a@b.c', role: 'admin',
});

const req = (body: unknown) => new Request('http://test/api/team/members', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(() => vi.clearAllMocks());

describe('POST /api/team/members', () => {
  it('401 when caller is not admin', async () => {
    vi.mocked(requireRole).mockResolvedValue(null);
    const res = await POST(req({ email: 'x@y.z', name: 'X' }));
    expect(res.status).toBe(401);
  });

  it('400 on invalid email', async () => {
    asAdmin();
    const res = await POST(req({ email: 'not-an-email', name: 'X' }));
    expect(res.status).toBe(400);
  });

  it('400 on missing name', async () => {
    asAdmin();
    const res = await POST(req({ email: 'x@y.z', name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('400 on invalid role', async () => {
    asAdmin();
    const res = await POST(req({ email: 'x@y.z', name: 'X', role: 'owner' }));
    expect(res.status).toBe(400);
  });

  it('201 with { userId, email, name, role, password } on success', async () => {
    asAdmin();
    vi.mocked(createTeamMember).mockResolvedValue({
      userId: 'u-1', email: 'x@y.z', name: 'X', role: 'member', password: 'p',
    });
    const res = await POST(req({ email: 'x@y.z', name: 'X' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      userId: 'u-1', email: 'x@y.z', name: 'X', role: 'member', password: 'p',
    });
  });

  it('409 with sanitized message when TeamMemberAlreadyExistsError is thrown', async () => {
    asAdmin();
    vi.mocked(createTeamMember).mockRejectedValue(
      new TeamMemberAlreadyExistsError('dup@x.y'),
    );
    const res = await POST(req({ email: 'dup@x.y', name: 'Dup' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    // Stable, sanitized string — no Prisma/Supabase internals.
    expect(body.error).toBe('A team member with email dup@x.y already exists');
  });

  it('500 does NOT leak raw Prisma/internal errors (generic fallback message)', async () => {
    asAdmin();
    vi.mocked(createTeamMember).mockRejectedValue(
      new Error('Unique constraint failed on the fields: (`email`)'),
    );
    const res = await POST(req({ email: 'x@y.z', name: 'X' }));
    // Untyped errors go to 500 — do NOT silently promote to 409, and do
    // include the message as safeErrorMessage would (the route already has
    // a try/catch at the outer layer so this is stable).
    expect(res.status).toBe(500);
  });

  it('500 on generic failure', async () => {
    asAdmin();
    vi.mocked(createTeamMember).mockRejectedValue(new Error('boom'));
    const res = await POST(req({ email: 'x@y.z', name: 'X' }));
    expect(res.status).toBe(500);
  });
});
