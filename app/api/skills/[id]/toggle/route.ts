/**
 * POST /api/skills/[id]/toggle
 *
 * What it does: Flips the isEnabled flag on an installed skill.
 * What it reads: InstalledSkill by id from Prisma.
 * What it produces: JSON { skill: InstalledSkill } with the updated isEnabled value.
 * Edge cases:
 *   - Requires admin role; returns 401 otherwise.
 *   - Returns 404 when the skill id does not exist.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { updateInstalledSkill } from '@/lib/db/installed-skills';

interface RouteContext {
  params: { id: string };
}

export async function POST(_request: Request, { params }: RouteContext) {
  const auth = await requireRole('admin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const existing = await prisma.installedSkill.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Skill not found' }, { status: 404 });

  const updated = await updateInstalledSkill(existing.id, { isEnabled: !existing.isEnabled });
  return NextResponse.json({ skill: updated });
}
