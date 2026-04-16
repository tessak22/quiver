/**
 * Skills Content API — app/api/sessions/skills/route.ts
 *
 * What it does: Returns the content of a single skill file by name.
 *   Used by the session UI to lazy-load skill content when a user
 *   expands a skill in the sidebar.
 *
 * What it reads from: The skill markdown files via loadSkills().
 *
 * What it produces: JSON with { content: string } for the requested skill.
 *
 * Edge cases:
 *   - Missing skill name param: returns 400.
 *   - Skill file not found or empty: returns 404 with error message.
 *   - Unauthenticated request: returns 401.
 */

import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { loadSkills } from '@/lib/ai/skills';
import { safeErrorMessage } from '@/lib/utils';

export async function GET(request: Request) {
  const auth = await requireRole('viewer');
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  if (!name) {
    return NextResponse.json({ error: 'Skill name required' }, { status: 400 });
  }

  // Validate skill name to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return NextResponse.json({ error: 'Invalid skill name' }, { status: 400 });
  }

  try {
    const content = await loadSkills([name]);
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Skill not found') },
      { status: 404 }
    );
  }
}
