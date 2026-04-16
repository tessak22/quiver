/**
 * Tests for app/api/skills route handlers (list, install, patch, delete, toggle).
 *
 * Auth, DB layer, and github-fetch are mocked. Tests assert HTTP status, body
 * shape, and that the right helpers were called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock('@/lib/auth', () => ({
  requireRole: vi.fn(),
}));

vi.mock('@/lib/db/installed-skills', () => ({
  getInstalledSkills: vi.fn(),
  getEnabledInstalledSkills: vi.fn(),
  getInstalledSkillByRepo: vi.fn(),
  getInstalledSkillByName: vi.fn(),
  createInstalledSkill: vi.fn(),
  updateInstalledSkill: vi.fn(),
  deleteInstalledSkill: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    installedSkill: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/skills/github-fetch', () => ({
  fetchSkillFromGithub: vi.fn(),
}));

import { GET as listGET } from '@/app/api/skills/route';
import { POST as installPOST } from '@/app/api/skills/install/route';
import { PATCH as updatePATCH, DELETE as deleteDELETE } from '@/app/api/skills/[id]/route';
import { POST as togglePOST } from '@/app/api/skills/[id]/toggle/route';
import { requireRole } from '@/lib/auth';
import {
  getInstalledSkills,
  getEnabledInstalledSkills,
  getInstalledSkillByRepo,
  createInstalledSkill,
  updateInstalledSkill,
  deleteInstalledSkill,
} from '@/lib/db/installed-skills';
import { fetchSkillFromGithub } from '@/lib/skills/github-fetch';
import { prisma } from '@/lib/db';

const mockedRequireRole = vi.mocked(requireRole);
const mockedFetch = vi.mocked(fetchSkillFromGithub);
const mockedPrismaSkill = prisma.installedSkill as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockedUpdate = vi.mocked(updateInstalledSkill);
const mockedDelete = vi.mocked(deleteInstalledSkill);

beforeEach(() => {
  vi.clearAllMocks();
});

function makeJsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/skills', () => {
  it('returns 401 when unauthenticated', async () => {
    mockedRequireRole.mockResolvedValue(null);
    const res = await listGET(new Request('http://localhost/api/skills'));
    expect(res.status).toBe(401);
  });

  it('returns all installed skills for an authorized viewer', async () => {
    mockedRequireRole.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'viewer' });
    vi.mocked(getInstalledSkills).mockResolvedValue([
      { id: 's1', name: 'foo' } as never,
    ]);
    const res = await listGET(new Request('http://localhost/api/skills'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skills).toHaveLength(1);
    expect(getInstalledSkills).toHaveBeenCalled();
  });

  it('filters to enabled when ?enabled=true', async () => {
    mockedRequireRole.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'viewer' });
    vi.mocked(getEnabledInstalledSkills).mockResolvedValue([]);
    const res = await listGET(new Request('http://localhost/api/skills?enabled=true'));
    expect(res.status).toBe(200);
    expect(getEnabledInstalledSkills).toHaveBeenCalled();
    expect(getInstalledSkills).not.toHaveBeenCalled();
  });
});

describe('POST /api/skills/install', () => {
  beforeEach(() => {
    mockedRequireRole.mockResolvedValue({ id: 'admin-1', email: 'a@b.c', role: 'admin' });
    vi.mocked(getInstalledSkillByRepo).mockResolvedValue(null);
  });

  it('returns 401 when not admin', async () => {
    mockedRequireRole.mockResolvedValue(null);
    const res = await installPOST(
      makeJsonRequest('http://localhost/api/skills/install', { githubRepo: 'a/b' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid repo format', async () => {
    const res = await installPOST(
      makeJsonRequest('http://localhost/api/skills/install', { githubRepo: 'not-valid' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when already installed', async () => {
    vi.mocked(getInstalledSkillByRepo).mockResolvedValue({ id: 'existing' } as never);
    const res = await installPOST(
      makeJsonRequest('http://localhost/api/skills/install', { githubRepo: 'a/b' })
    );
    expect(res.status).toBe(409);
  });

  it('returns 422 when fetch fails', async () => {
    mockedFetch.mockRejectedValue(new Error('SKILL.md not found in a/b@main.'));
    const res = await installPOST(
      makeJsonRequest('http://localhost/api/skills/install', { githubRepo: 'a/b' })
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/SKILL\.md not found/);
  });

  it('creates the skill and returns 201 on success', async () => {
    mockedFetch.mockResolvedValue({
      name: 'foo',
      description: 'd',
      skillContent: '# body',
      references: [],
      githubRef: 'main',
    });
    vi.mocked(createInstalledSkill).mockResolvedValue({ id: 'new', name: 'foo' } as never);
    const res = await installPOST(
      makeJsonRequest('http://localhost/api/skills/install', { githubRepo: 'a/b' })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.skill.id).toBe('new');
    expect(createInstalledSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        githubRepo: 'a/b',
        githubRef: 'main',
        name: 'foo',
        installedBy: 'admin-1',
      })
    );
  });

  it('returns 409 when concurrent install hits the unique constraint', async () => {
    mockedFetch.mockResolvedValue({
      name: 'foo',
      description: 'd',
      skillContent: '# body',
      references: [],
      githubRef: 'main',
    });
    const p2002 = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    vi.mocked(createInstalledSkill).mockRejectedValue(p2002);
    const res = await installPOST(
      makeJsonRequest('http://localhost/api/skills/install', { githubRepo: 'a/b' })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already installed/i);
  });
});

describe('PATCH /api/skills/[id]', () => {
  beforeEach(() => {
    mockedRequireRole.mockResolvedValue({ id: 'admin-1', email: 'a@b.c', role: 'admin' });
  });

  it('returns 401 when not admin', async () => {
    mockedRequireRole.mockResolvedValue(null);
    const res = await updatePATCH(
      new Request('http://localhost/api/skills/abc', { method: 'PATCH' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when skill not found', async () => {
    mockedPrismaSkill.findUnique.mockResolvedValue(null);
    const res = await updatePATCH(
      new Request('http://localhost/api/skills/abc', { method: 'PATCH' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(404);
  });

  it('re-fetches and updates on success', async () => {
    mockedPrismaSkill.findUnique.mockResolvedValue({
      id: 'abc',
      githubRepo: 'a/b',
      githubRef: 'main',
    });
    mockedFetch.mockResolvedValue({
      name: 'foo',
      description: 'desc',
      skillContent: '# new body',
      references: [],
      githubRef: 'main',
    });
    mockedUpdate.mockResolvedValue({ id: 'abc' } as never);

    const res = await updatePATCH(
      new Request('http://localhost/api/skills/abc', { method: 'PATCH' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(200);
    expect(mockedUpdate).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({
        name: 'foo',
        description: 'desc',
        skillContent: '# new body',
        fetchError: null,
      })
    );
  });

  it('records fetchError and returns 422 when refresh fails', async () => {
    mockedPrismaSkill.findUnique.mockResolvedValue({
      id: 'abc',
      githubRepo: 'a/b',
      githubRef: 'main',
    });
    mockedFetch.mockRejectedValue(new Error('Repository not found.'));
    mockedUpdate.mockResolvedValue({ id: 'abc' } as never);

    const res = await updatePATCH(
      new Request('http://localhost/api/skills/abc', { method: 'PATCH' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(422);
    expect(mockedUpdate).toHaveBeenCalledWith(
      'abc',
      expect.objectContaining({ fetchError: 'Repository not found.' })
    );
  });

  it('returns 422 when skill has no githubRepo', async () => {
    mockedPrismaSkill.findUnique.mockResolvedValue({
      id: 'abc',
      githubRepo: null,
      githubRef: null,
    });
    const res = await updatePATCH(
      new Request('http://localhost/api/skills/abc', { method: 'PATCH' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/cannot be refreshed/i);
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/skills/[id]', () => {
  beforeEach(() => {
    mockedRequireRole.mockResolvedValue({ id: 'admin-1', email: 'a@b.c', role: 'admin' });
  });

  it('returns 401 when not admin', async () => {
    mockedRequireRole.mockResolvedValue(null);
    const res = await deleteDELETE(
      new Request('http://localhost/api/skills/abc', { method: 'DELETE' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(401);
  });

  it('hard-deletes and returns 204', async () => {
    mockedPrismaSkill.findUnique.mockResolvedValue({ id: 'abc' });
    mockedDelete.mockResolvedValue({ id: 'abc' } as never);
    const res = await deleteDELETE(
      new Request('http://localhost/api/skills/abc', { method: 'DELETE' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(204);
    expect(mockedDelete).toHaveBeenCalledWith('abc');
  });

  it('returns 404 when skill not found', async () => {
    mockedPrismaSkill.findUnique.mockResolvedValue(null);
    const res = await deleteDELETE(
      new Request('http://localhost/api/skills/abc', { method: 'DELETE' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(404);
  });
});

describe('POST /api/skills/[id]/toggle', () => {
  beforeEach(() => {
    mockedRequireRole.mockResolvedValue({ id: 'admin-1', email: 'a@b.c', role: 'admin' });
  });

  it('returns 401 when not admin', async () => {
    mockedRequireRole.mockResolvedValue(null);
    const res = await togglePOST(
      new Request('http://localhost/api/skills/abc/toggle', { method: 'POST' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(401);
  });

  it('flips isEnabled', async () => {
    mockedPrismaSkill.findUnique.mockResolvedValue({ id: 'abc', isEnabled: true });
    mockedUpdate.mockResolvedValue({ id: 'abc', isEnabled: false } as never);

    const res = await togglePOST(
      new Request('http://localhost/api/skills/abc/toggle', { method: 'POST' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(200);
    expect(mockedUpdate).toHaveBeenCalledWith('abc', { isEnabled: false });
  });

  it('returns 404 when skill not found', async () => {
    mockedPrismaSkill.findUnique.mockResolvedValue(null);
    const res = await togglePOST(
      new Request('http://localhost/api/skills/abc/toggle', { method: 'POST' }),
      { params: { id: 'abc' } }
    );
    expect(res.status).toBe(404);
  });
});
