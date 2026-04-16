/**
 * Installed Skills Data Layer — lib/db/installed-skills.ts
 *
 * What it does: CRUD helpers for the installed_skills table. Installed
 *   skills are GitHub-sourced skill packs that admins can layer on top of
 *   built-in filesystem skills.
 *
 * What it reads from: The installed_skills table (via Prisma).
 *
 * What it produces: InstalledSkill records.
 *
 * Edge cases:
 *   - getInstalledSkillByName filters to enabled records only because the
 *     name lookup runs at session-prompt-assembly time and disabled skills
 *     must never be injected into a system prompt.
 */

import { prisma } from '@/lib/db';
import type { Prisma, InstalledSkill } from '@prisma/client';

export type InstalledSkillReference = { path: string; content: string };

export async function getInstalledSkills(): Promise<InstalledSkill[]> {
  return prisma.installedSkill.findMany({ orderBy: { name: 'asc' } });
}

export async function getEnabledInstalledSkills(): Promise<InstalledSkill[]> {
  return prisma.installedSkill.findMany({
    where: { isEnabled: true },
    orderBy: { name: 'asc' },
  });
}

export async function getInstalledSkillByRepo(
  githubRepo: string
): Promise<InstalledSkill | null> {
  return prisma.installedSkill.findUnique({ where: { githubRepo } });
}

/** Lookup by name; restricted to enabled skills (used during prompt assembly). */
export async function getInstalledSkillByName(
  name: string
): Promise<InstalledSkill | null> {
  return prisma.installedSkill.findFirst({ where: { name, isEnabled: true } });
}

export interface CreateInstalledSkillInput {
  source: 'github';
  githubRepo: string;
  githubRef: string;
  name: string;
  description: string;
  skillContent: string;
  references: InstalledSkillReference[];
  installedBy: string;
}

export async function createInstalledSkill(
  data: CreateInstalledSkillInput
): Promise<InstalledSkill> {
  return prisma.installedSkill.create({
    data: data as unknown as Prisma.InstalledSkillCreateInput,
  });
}

export async function updateInstalledSkill(
  id: string,
  data: Prisma.InstalledSkillUpdateInput
): Promise<InstalledSkill> {
  return prisma.installedSkill.update({ where: { id }, data });
}

export async function deleteInstalledSkill(id: string): Promise<InstalledSkill> {
  return prisma.installedSkill.delete({ where: { id } });
}
