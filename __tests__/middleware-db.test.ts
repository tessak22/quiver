/**
 * Tests for lib/middleware-db.ts — Edge-compatible Neon queries used
 * by middleware.ts for membership + active-context checks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the tag function the module creates per-call.
const sqlMock = vi.fn();

vi.mock('@neondatabase/serverless', () => ({
  neon: vi.fn(() => sqlMock),
}));

// Supabase PostgREST chain: from().select().eq().limit() resolves to { data, error }.
const limitMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ limit: limitMock }) }) }),
  })),
}));

// Import AFTER the mock is registered.
import { isTeamMember, hasActiveContext } from '@/lib/middleware-db';

beforeEach(() => {
  sqlMock.mockReset();
  limitMock.mockReset();
  process.env.DATABASE_URL = 'postgres://user:pw@ep-test.us-east-2.aws.neon.tech/db';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
});

describe('isTeamMember', () => {
  it('returns true when Neon returns a row', async () => {
    sqlMock.mockResolvedValueOnce([{ id: 'u1' }]);
    await expect(isTeamMember('u1')).resolves.toBe(true);
  });

  it('returns false when Neon returns no rows', async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(isTeamMember('u1')).resolves.toBe(false);
  });

  it('returns false on query error (fails closed, not open)', async () => {
    sqlMock.mockRejectedValueOnce(new Error('connection refused'));
    await expect(isTeamMember('u1')).resolves.toBe(false);
  });
});

describe('hasActiveContext', () => {
  it('reports exists=true when active context row returned', async () => {
    sqlMock.mockResolvedValueOnce([{ id: 'ctx1' }]);
    await expect(hasActiveContext()).resolves.toEqual({ exists: true, failed: false });
  });

  it('reports exists=false, failed=false on empty result (legit first-run)', async () => {
    sqlMock.mockResolvedValueOnce([]);
    await expect(hasActiveContext()).resolves.toEqual({ exists: false, failed: false });
  });

  it('reports failed=true on query error so middleware does not send user to /setup', async () => {
    sqlMock.mockRejectedValueOnce(new Error('timeout'));
    await expect(hasActiveContext()).resolves.toEqual({ exists: false, failed: true });
  });
});

describe('non-Neon DATABASE_URL (Supabase PostgREST)', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgresql://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
  });

  it('isTeamMember returns true when PostgREST returns a row', async () => {
    limitMock.mockResolvedValueOnce({ data: [{ id: 'u1' }], error: null });
    await expect(isTeamMember('u1')).resolves.toBe(true);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it('isTeamMember fails closed on a PostgREST error', async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST', message: 'boom' } });
    await expect(isTeamMember('u1')).resolves.toBe(false);
  });

  it('hasActiveContext reports exists=false, failed=false on empty result', async () => {
    limitMock.mockResolvedValueOnce({ data: [], error: null });
    await expect(hasActiveContext()).resolves.toEqual({ exists: false, failed: false });
  });

  it('hasActiveContext reports failed=true on a PostgREST error', async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST', message: 'boom' } });
    await expect(hasActiveContext()).resolves.toEqual({ exists: false, failed: true });
  });
});
