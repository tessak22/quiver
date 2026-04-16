/**
 * GitHub Skill Fetcher — lib/skills/github-fetch.ts
 *
 * What it does: Fetches and parses a marketing skill pack from a public
 *   GitHub repository. Reads SKILL.md, parses YAML frontmatter, and gathers
 *   all .md files under references/.
 *
 * What it reads from: GitHub raw + REST APIs (unauthenticated, public repos only).
 *
 * What it produces: { name, description, skillContent, references, githubRef }
 *
 * Edge cases:
 *   - Repo path validated against owner/repo regex; bad input throws.
 *   - Missing SKILL.md → throws.
 *   - Empty SKILL.md → throws.
 *   - Missing frontmatter `name` or `description` → throws naming the field.
 *   - Frontmatter `name` that fails the skill-name regex → throws (would
 *     otherwise pass install but break loadSkills() during prompt assembly).
 *   - GitHub rate-limit (403 + X-RateLimit-Remaining: 0) → throws.
 *   - Missing references/ directory → returns empty references array.
 *
 * Has no Next.js imports so it is shareable with the MCP server.
 */

import matter from 'gray-matter';

const REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

// Mirrors lib/ai/skills.ts isValidSkillName. Installed skill names must satisfy
// this so they survive loadSkills() validation at session-prompt-assembly time.
const SKILL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export interface FetchedSkill {
  name: string;
  description: string;
  skillContent: string;
  references: Array<{ path: string; content: string }>;
  githubRef: string;
}

export async function fetchSkillFromGithub(
  githubRepo: string,
  ref?: string
): Promise<FetchedSkill> {
  if (!REPO_REGEX.test(githubRepo)) {
    throw new Error(
      `Invalid GitHub repo: "${githubRepo}". Use owner/repo format (e.g. tessak22/devrel-growth-advisor).`
    );
  }

  const githubRef = ref?.trim() || 'main';
  const skillUrl = `https://raw.githubusercontent.com/${githubRepo}/${githubRef}/SKILL.md`;

  const skillRes = await safeFetch(skillUrl);
  if (skillRes.status === 404) {
    throw new Error(`SKILL.md not found in ${githubRepo}@${githubRef}.`);
  }
  if (skillRes.status === 403 && skillRes.headers.get('X-RateLimit-Remaining') === '0') {
    throw new Error('GitHub API rate limit reached. Try again later.');
  }
  if (!skillRes.ok) {
    throw new Error(`SKILL.md fetch failed (${skillRes.status}) for ${githubRepo}@${githubRef}.`);
  }

  const raw = await skillRes.text();
  if (!raw.trim()) {
    throw new Error(`SKILL.md is empty in ${githubRepo}@${githubRef}.`);
  }

  const parsed = matter(raw);
  const fmName = typeof parsed.data?.name === 'string' ? parsed.data.name.trim() : '';
  const fmDescription = typeof parsed.data?.description === 'string' ? parsed.data.description.trim() : '';

  if (!fmName) {
    throw new Error(`SKILL.md is missing required field: name (in ${githubRepo}@${githubRef}).`);
  }
  if (!fmDescription) {
    throw new Error(`SKILL.md is missing required field: description (in ${githubRepo}@${githubRef}).`);
  }
  if (!SKILL_NAME_REGEX.test(fmName)) {
    throw new Error(
      `SKILL.md frontmatter name "${fmName}" is invalid. Skill names may only contain letters, numbers, hyphens, and underscores (in ${githubRepo}@${githubRef}).`
    );
  }

  const references = await fetchReferences(githubRepo, githubRef);

  return {
    name: fmName,
    description: fmDescription,
    skillContent: raw,
    references,
    githubRef,
  };
}

async function fetchReferences(
  githubRepo: string,
  ref: string
): Promise<Array<{ path: string; content: string }>> {
  const treeUrl = `https://api.github.com/repos/${githubRepo}/git/trees/${ref}?recursive=1`;

  let treeRes: Response;
  try {
    treeRes = await fetch(treeUrl, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
  } catch (err) {
    throw new Error(
      `GitHub fetch failed: ${err instanceof Error ? err.message : 'unknown network error'}`
    );
  }

  if (treeRes.status === 404) return [];
  if (treeRes.status === 403 && treeRes.headers.get('X-RateLimit-Remaining') === '0') {
    throw new Error('GitHub API rate limit reached. Try again later.');
  }
  if (!treeRes.ok) {
    throw new Error(`GitHub tree fetch failed (${treeRes.status}) for ${githubRepo}@${ref}.`);
  }

  const data = (await treeRes.json()) as { tree?: Array<{ path: string; type: string }> };
  const refEntries = (data.tree ?? []).filter(
    (entry) =>
      entry.type === 'blob' &&
      entry.path.startsWith('references/') &&
      entry.path.toLowerCase().endsWith('.md')
  );

  const results = await Promise.all(
    refEntries.map(async (entry) => {
      const url = `https://raw.githubusercontent.com/${githubRepo}/${ref}/${entry.path}`;
      const res = await safeFetch(url);
      if (!res.ok) {
        throw new Error(`Reference fetch failed (${res.status}) for ${entry.path}.`);
      }
      return { path: entry.path, content: await res.text() };
    })
  );

  return results;
}

async function safeFetch(url: string): Promise<Response> {
  try {
    return await fetch(url);
  } catch (err) {
    throw new Error(
      `GitHub fetch failed: ${err instanceof Error ? err.message : 'unknown network error'}`
    );
  }
}
