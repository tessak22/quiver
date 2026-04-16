/**
 * GET /api/skills
 *
 * What it does: Returns the list of installed skills for the workspace.
 * What it reads: InstalledSkill rows via lib/db/installed-skills.
 * What it produces: JSON { skills: InstalledSkill[] }
 * Edge cases:
 *   - ?enabled=true filters to only enabled skills.
 *   - Requires viewer role; returns 401 for unauthenticated requests.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  getInstalledSkills,
  getEnabledInstalledSkills,
} from '@/lib/db/installed-skills';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const enabledOnly = url.searchParams.get('enabled') === 'true';

  const skills = enabledOnly
    ? await getEnabledInstalledSkills()
    : await getInstalledSkills();

  return NextResponse.json({ skills });
}
