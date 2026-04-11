import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTeamMemberRole } from '@/lib/db/team';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

interface GitHubContentEntry {
  name: string;
  type: string;
  path: string;
}

interface GitHubFileResponse {
  content: string;
  encoding: string;
}

interface GitHubCommit {
  sha: string;
}

const REPO_OWNER = 'coreyhaines31';
const REPO_NAME = 'marketingskills';
const GITHUB_API = 'https://api.github.com';

export async function POST() {
  // Authenticate
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Admin-only
  const member = await getTeamMemberRole(user.id);
  if (!member || member.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    // 1. Get latest commit hash
    const commitsRes = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/commits?per_page=1`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );

    if (!commitsRes.ok) {
      throw new Error(`Failed to fetch latest commit: ${commitsRes.status}`);
    }

    const commits: GitHubCommit[] = await commitsRes.json();
    if (commits.length === 0) {
      throw new Error('No commits found in repository');
    }

    const latestSha = commits[0].sha;

    // 2. List skill directories
    const contentsRes = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/skills`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );

    if (!contentsRes.ok) {
      throw new Error(`Failed to list skills: ${contentsRes.status}`);
    }

    const contents: GitHubContentEntry[] = await contentsRes.json();
    const skillDirs = contents.filter((entry) => entry.type === 'dir');

    // 3. Download each SKILL.md and write to local filesystem
    const skillsDir = join(process.cwd(), 'skills');
    let updatedCount = 0;

    for (const dir of skillDirs) {
      // Sanitize directory name to prevent path traversal
      const safeName = dir.name.replace(/[^a-zA-Z0-9_-]/g, '');
      if (!safeName || safeName !== dir.name) {
        continue; // Skip entries with suspicious characters
      }

      const fileRes = await fetch(
        `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/skills/${safeName}/SKILL.md`,
        { headers: { Accept: 'application/vnd.github.v3+json' } }
      );

      if (!fileRes.ok) {
        // Some skill dirs may not have a SKILL.md — skip
        continue;
      }

      const fileData: GitHubFileResponse = await fileRes.json();
      const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

      const localDir = join(skillsDir, safeName);
      if (!existsSync(localDir)) {
        mkdirSync(localDir, { recursive: true });
      }

      writeFileSync(join(localDir, 'SKILL.md'), content, 'utf-8');
      updatedCount++;
    }

    // 4. Update PINNED_VERSION
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }
    writeFileSync(join(skillsDir, 'PINNED_VERSION'), latestSha, 'utf-8');

    return NextResponse.json({
      commitHash: latestSha,
      skillsUpdated: updatedCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Skills update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
