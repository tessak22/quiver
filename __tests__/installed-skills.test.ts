/**
 * Tests for lib/db/installed-skills.ts — Prisma CRUD wrappers.
 *
 * Prisma client is mocked per-test; no DB calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => {
  const installedSkill = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  return { prisma: { installedSkill } };
});

import {
  getInstalledSkills,
  getEnabledInstalledSkills,
  getInstalledSkillByRepo,
  getInstalledSkillByName,
  createInstalledSkill,
  updateInstalledSkill,
  deleteInstalledSkill,
} from '@/lib/db/installed-skills';
import { prisma } from '@/lib/db';

const mockSkill = prisma.installedSkill as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('installed-skills CRUD', () => {
  it('getInstalledSkills returns rows ordered by name', async () => {
    mockSkill.findMany.mockResolvedValue([{ id: '1', name: 'a' }]);
    const result = await getInstalledSkills();
    expect(mockSkill.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    expect(result).toEqual([{ id: '1', name: 'a' }]);
  });

  it('getEnabledInstalledSkills filters by isEnabled=true', async () => {
    mockSkill.findMany.mockResolvedValue([]);
    await getEnabledInstalledSkills();
    expect(mockSkill.findMany).toHaveBeenCalledWith({
      where: { isEnabled: true },
      orderBy: { name: 'asc' },
    });
  });

  it('getInstalledSkillByRepo looks up by githubRepo', async () => {
    mockSkill.findUnique.mockResolvedValue(null);
    const result = await getInstalledSkillByRepo('owner/repo');
    expect(mockSkill.findUnique).toHaveBeenCalledWith({
      where: { githubRepo: 'owner/repo' },
    });
    expect(result).toBeNull();
  });

  it('getInstalledSkillByName looks up by name (enabled-only)', async () => {
    mockSkill.findFirst.mockResolvedValue(null);
    await getInstalledSkillByName('copywriting');
    expect(mockSkill.findFirst).toHaveBeenCalledWith({
      where: { name: 'copywriting', isEnabled: true },
    });
  });

  it('createInstalledSkill forwards data to prisma', async () => {
    mockSkill.create.mockResolvedValue({ id: 'new-id' });
    const data = {
      source: 'github' as const,
      githubRepo: 'owner/repo',
      githubRef: 'main',
      name: 'foo',
      description: 'desc',
      skillContent: '# Body',
      references: [],
      installedBy: 'user-1',
    };
    const result = await createInstalledSkill(data);
    expect(mockSkill.create).toHaveBeenCalledWith({ data });
    expect(result).toEqual({ id: 'new-id' });
  });

  it('updateInstalledSkill forwards id + patch', async () => {
    mockSkill.update.mockResolvedValue({ id: 'x' });
    await updateInstalledSkill('x', { fetchError: 'oops' });
    expect(mockSkill.update).toHaveBeenCalledWith({
      where: { id: 'x' },
      data: { fetchError: 'oops' },
    });
  });

  it('deleteInstalledSkill hard-deletes by id', async () => {
    mockSkill.delete.mockResolvedValue({ id: 'x' });
    await deleteInstalledSkill('x');
    expect(mockSkill.delete).toHaveBeenCalledWith({ where: { id: 'x' } });
  });
});
