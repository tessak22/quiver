/**
 * Tests for POST/GET /api/auth/bootstrap — first-account creation.
 *
 * This is the only unauthenticated route that creates a user, so the tests
 * that matter are the ones about when it refuses: once anyone exists, when the
 * check itself fails, and when the input is not usable.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const listUsers = vi.fn();
const createUser = vi.fn();
vi.mock('@/lib/env', () => ({
  getSupabaseAdminClient: () => ({ auth: { admin: { listUsers, createUser } } }),
}));

// The transaction runs the callback; the advisory lock is a no-op here.
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (fn: (tx: unknown) => unknown) => fn({ $executeRaw: vi.fn() }),
  },
}));

vi.mock('@/lib/utils', () => ({
  parseJsonBody: async (req: Request) => {
    try {
      return { data: await req.json() };
    } catch {
      return { error: Response.json({ error: 'Invalid JSON' }, { status: 400 }) };
    }
  },
  safeErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

import { GET, POST } from '@/app/api/auth/bootstrap/route';

function post(body: unknown) {
  return new Request('http://localhost/api/auth/bootstrap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const GOOD = { email: 'founder@example.com', password: 'a-long-enough-password' };

beforeEach(() => {
  vi.clearAllMocks();
  listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  createUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
});

describe('GET /api/auth/bootstrap', () => {
  it('says the door is open on a fresh install', async () => {
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ available: true });
  });

  it('says the door is shut once any user exists', async () => {
    listUsers.mockResolvedValue({ data: { users: [{ id: 'u1' }] }, error: null });
    const res = await GET();
    await expect(res.json()).resolves.toEqual({ available: false });
  });

  it('leaks nothing about who exists', async () => {
    listUsers.mockResolvedValue({
      data: { users: [{ id: 'u1', email: 'someone@example.com' }] },
      error: null,
    });
    const body = JSON.stringify(await (await GET()).json());
    expect(body).not.toContain('someone@example.com');
    expect(body).not.toContain('u1');
  });
});

describe('POST /api/auth/bootstrap', () => {
  it('creates the first account', async () => {
    const res = await POST(post(GOOD));
    expect(res.status).toBe(200);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: GOOD.email, email_confirm: true })
    );
  });

  it('refuses once any user exists, and creates nothing', async () => {
    // The door is decided by auth users, not by team_members: the row is
    // written later during onboarding, so counting rows left a window open.
    listUsers.mockResolvedValue({ data: { users: [{ id: 'u1' }] }, error: null });
    const res = await POST(post(GOOD));
    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('fails closed when it cannot tell whether anyone exists', async () => {
    listUsers.mockResolvedValue({ data: null, error: { message: 'unreachable' } });
    const res = await POST(post(GOOD));
    expect(res.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('checks availability inside the same call that creates', async () => {
    // Guards the ordering the advisory lock exists to protect: if the check
    // ever moved outside, this would still pass but the race would be back.
    await POST(post(GOOD));
    expect(listUsers).toHaveBeenCalled();
    expect(listUsers.mock.invocationCallOrder[0]).toBeLessThan(
      createUser.mock.invocationCallOrder[0]
    );
  });

  it('refuses a password under twelve characters', async () => {
    const res = await POST(post({ ...GOOD, password: 'short' }));
    expect(res.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('refuses something that is not an email', async () => {
    const res = await POST(post({ ...GOOD, email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect(createUser).not.toHaveBeenCalled();
  });

  it('lowercases and trims the email', async () => {
    await POST(post({ ...GOOD, email: '  Founder@Example.COM  ' }));
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'founder@example.com' })
    );
  });
});
