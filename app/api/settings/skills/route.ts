import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

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
