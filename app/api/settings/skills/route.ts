import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export async function GET() {
  const auth = await requireRole('viewer');
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const skillsDir = join(process.cwd(), 'skills');

  let pinnedVersion = 'unknown';
  try {
    pinnedVersion = readFileSync(join(skillsDir, 'PINNED_VERSION'), 'utf-8').trim();
  } catch {
    // File may not exist
  }

  let skillNames: string[] = [];
  try {
    skillNames = readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    // Dir may not exist
  }

  return NextResponse.json({
    pinnedVersion,
    skillCount: skillNames.length,
    skillNames,
  });
}
