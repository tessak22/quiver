/**
 * PATCH /api/skills/[id]  — Re-fetch and update an installed skill from GitHub.
 * DELETE /api/skills/[id] — Hard-delete an installed skill.
 *
 * What it reads: InstalledSkill by id from Prisma; refreshed content from GitHub.
 * What it produces:
 *   PATCH: JSON { skill: InstalledSkill } on success, 422 with fetchError persisted on failure.
 *   DELETE: 204 No Content on success.
 * Edge cases:
 *   - Both methods require admin role; returns 401 otherwise.
 *   - Returns 404 when the skill id does not exist.
 *   - PATCH returns 422 if the skill has no githubRepo (non-GitHub skills cannot be refreshed).
 *   - PATCH on fetch failure persists the error message in fetchError before returning 422.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import {
  deleteInstalledSkill,
  updateInstalledSkill,
} from '@/lib/db/installed-skills';
import { fetchSkillFromGithub } from '@/lib/skills/github-fetch';

interface RouteContext {
  params: { id: string };
}

export async function PATCH(_request: Request, { params }: RouteContext) {
  const auth = await requireRole('admin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.installedSkill.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  if (!existing.githubRepo) {
    return NextResponse.json({ error: 'This skill cannot be refreshed.' }, { status: 422 });
  }

  try {
    const fetched = await fetchSkillFromGithub(existing.githubRepo, existing.githubRef ?? undefined);
    const updated = await updateInstalledSkill(existing.id, {
      name: fetched.name,
      description: fetched.description,
      skillContent: fetched.skillContent,
      references: fetched.references,
      lastFetchedAt: new Date(),
      fetchError: null,
    });
    return NextResponse.json({ skill: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to refresh skill from GitHub.';
    try {
      await updateInstalledSkill(existing.id, { fetchError: message });
    } catch {
      // Row may have been deleted concurrently — surface the original fetch error to the caller.
    }
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireRole('admin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.installedSkill.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  await deleteInstalledSkill(existing.id);
  // 204 with empty body is the conventional response for a successful DELETE.
  return new Response(null, { status: 204 });
}
