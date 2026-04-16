/**
 * POST /api/skills/install
 *
 * What it does: Fetches a SKILL.md from a GitHub repo and installs it as an
 *   InstalledSkill record.
 * What it reads: Request body { githubRepo, ref? }; GitHub via fetchSkillFromGithub.
 * What it produces: JSON { skill: InstalledSkill } with status 201 on success.
 * Edge cases:
 *   - Requires admin role; returns 401 otherwise.
 *   - Returns 400 if githubRepo is not in owner/repo format.
 *   - Returns 409 if the repo is already installed.
 *   - Returns 422 if fetchSkillFromGithub throws (SKILL.md not found, etc.).
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import {
  createInstalledSkill,
  getInstalledSkillByRepo,
} from '@/lib/db/installed-skills';
import { fetchSkillFromGithub } from '@/lib/skills/github-fetch';

const REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export async function POST(request: Request) {
  const auth = await requireRole('admin');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { githubRepo?: unknown; ref?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const githubRepo = typeof body.githubRepo === 'string' ? body.githubRepo.trim() : '';
  const ref = typeof body.ref === 'string' && body.ref.trim() ? body.ref.trim() : undefined;

  if (!REPO_REGEX.test(githubRepo)) {
    return NextResponse.json(
      { error: 'Enter a valid GitHub repo in owner/repo format.' },
      { status: 400 }
    );
  }

  const existing = await getInstalledSkillByRepo(githubRepo);
  if (existing) {
    return NextResponse.json(
      { error: 'Skill already installed. Use update to refresh it.' },
      { status: 409 }
    );
  }

  let fetched;
  try {
    fetched = await fetchSkillFromGithub(githubRepo, ref);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch skill from GitHub.' },
      { status: 422 }
    );
  }

  let skill;
  try {
    skill = await createInstalledSkill({
      source: 'github',
      githubRepo,
      githubRef: fetched.githubRef,
      name: fetched.name,
      description: fetched.description,
      skillContent: fetched.skillContent,
      references: fetched.references,
      installedBy: auth.id,
    });
  } catch (err) {
    // P2002 = Prisma unique constraint violation. Two requests can race past
    // the getInstalledSkillByRepo check above; the unique index on githubRepo
    // catches it here, so we surface a 409 instead of a raw 500.
    if (isUniqueConstraintError(err)) {
      return NextResponse.json(
        { error: 'Skill already installed. Use update to refresh it.' },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ skill }, { status: 201 });
}

function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}
