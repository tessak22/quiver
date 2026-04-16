/**
 * Lightweight settings-flow regression tests:
 *   - GET /api/skills returns full list to viewers (powers the settings list)
 *   - GET /api/skills?enabled=true returns enabled-only (powers the new-session selector)
 *   - POST /api/skills/install rejects bad input formats users may type into the form
 *
 * Auth + DB are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));
vi.mock('@/lib/auth', () => ({ requireRole: vi.fn() }));
vi.mock('@/lib/db/installed-skills', () => ({
  getInstalledSkills: vi.fn(),
  getEnabledInstalledSkills: vi.fn(),
  getInstalledSkillByRepo: vi.fn().mockResolvedValue(null),
  createInstalledSkill: vi.fn(),
  updateInstalledSkill: vi.fn(),
  deleteInstalledSkill: vi.fn(),
}));
vi.mock('@/lib/skills/github-fetch', () => ({ fetchSkillFromGithub: vi.fn() }));

import { GET } from '@/app/api/skills/route';
import { POST as installPOST } from '@/app/api/skills/install/route';
import { requireRole } from '@/lib/auth';
import {
  getInstalledSkills,
  getEnabledInstalledSkills,
} from '@/lib/db/installed-skills';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ id: 'u', email: 'a@b', role: 'admin' });
});

describe('settings flow', () => {
  it('list endpoint powers built-in vs installed split', async () => {
    vi.mocked(getInstalledSkills).mockResolvedValue([
      { id: '1', name: 'foo', isEnabled: true } as never,
      { id: '2', name: 'bar', isEnabled: false } as never,
    ]);
    const res = await GET(new Request('http://localhost/api/skills'));
    const body = await res.json();
    expect(body.skills).toHaveLength(2);
  });

  it('enabled-only filter is wired (used by new-session selector)', async () => {
    vi.mocked(getEnabledInstalledSkills).mockResolvedValue([
      { id: '1', name: 'foo', isEnabled: true } as never,
    ]);
    await GET(new Request('http://localhost/api/skills?enabled=true'));
    expect(getEnabledInstalledSkills).toHaveBeenCalled();
  });

  it.each([
    ['', 'empty'],
    ['no-slash', 'no slash'],
    ['too/many/slashes', 'multi slash'],
    ['has space/repo', 'spaces'],
  ])('install rejects bad githubRepo "%s" (%s)', async (githubRepo) => {
    const res = await installPOST(
      new Request('http://localhost/api/skills/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubRepo }),
      })
    );
    expect(res.status).toBe(400);
  });
});
