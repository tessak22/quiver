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

// Import AFTER the mock is registered.
import { isTeamMember, hasActiveContext } from '@/lib/middleware-db';

beforeEach(() => {
  sqlMock.mockReset();
  process.env.DATABASE_URL = 'postgres://test';
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
