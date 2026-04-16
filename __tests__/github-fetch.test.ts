/**
 * Tests for lib/skills/github-fetch.ts — fetches a public-GitHub skill repo,
 * parses SKILL.md frontmatter, and gathers references/*.md content.
 *
 * `fetch` is mocked per-test. No live network calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSkillFromGithub } from '@/lib/skills/github-fetch';

const FRONTMATTER_OK = `---
name: devrel-growth-advisor
description: Helps with developer relations growth strategy.
---

# DevRel Growth Advisor

Body content here.
`;

interface FetchCall {
  url: string;
  init?: RequestInit;
}

function installFetchMock(handler: (call: FetchCall) => Response | Promise<Response>) {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const call = { url, init };
    calls.push(call);
    return handler(call);
  }));
  return calls;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSkillFromGithub', () => {
  it('returns parsed skill with empty references when references/ dir is missing', async () => {
    installFetchMock((call) => {
      if (call.url.includes('raw.githubusercontent.com')) {
        return new Response(FRONTMATTER_OK, { status: 200 });
      }
      if (call.url.includes('api.github.com/repos/')) {
        return new Response(JSON.stringify({ tree: [] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await fetchSkillFromGithub('tessak22/devrel-growth-advisor');

    expect(result.name).toBe('devrel-growth-advisor');
    expect(result.description).toBe('Helps with developer relations growth strategy.');
    expect(result.skillContent).toContain('# DevRel Growth Advisor');
    expect(result.references).toEqual([]);
    expect(result.githubRef).toBe('main');
  });

  it('uses main as default ref and embeds it in the URL', async () => {
    const calls = installFetchMock(() => new Response(FRONTMATTER_OK, { status: 200 }));
    await fetchSkillFromGithub('tessak22/devrel-growth-advisor').catch(() => {
      // tree call may fail; we only care about the SKILL.md URL here
    });
    expect(calls[0].url).toBe(
      'https://raw.githubusercontent.com/tessak22/devrel-growth-advisor/main/SKILL.md'
    );
  });

  it('honours an explicit ref', async () => {
    const calls = installFetchMock(() => new Response(FRONTMATTER_OK, { status: 200 }));
    await fetchSkillFromGithub('tessak22/devrel-growth-advisor', 'v1.0.0').catch(() => {});
    expect(calls[0].url).toContain('/v1.0.0/SKILL.md');
  });

  it('collects all references/*.md files', async () => {
    installFetchMock((call) => {
      if (call.url.endsWith('/SKILL.md')) {
        return new Response(FRONTMATTER_OK, { status: 200 });
      }
      if (call.url.includes('git/trees/')) {
        return new Response(
          JSON.stringify({
            tree: [
              { path: 'references/style.md', type: 'blob' },
              { path: 'references/data/raw.json', type: 'blob' },
              { path: 'references/notes.md', type: 'blob' },
              { path: 'README.md', type: 'blob' },
            ],
          }),
          { status: 200 }
        );
      }
      if (call.url.endsWith('/references/style.md')) {
        return new Response('# style', { status: 200 });
      }
      if (call.url.endsWith('/references/notes.md')) {
        return new Response('# notes', { status: 200 });
      }
      return new Response('nope', { status: 404 });
    });

    const result = await fetchSkillFromGithub('tessak22/devrel-growth-advisor');

    expect(result.references).toHaveLength(2);
    expect(result.references.map((r) => r.path).sort()).toEqual([
      'references/notes.md',
      'references/style.md',
    ]);
    expect(result.references.find((r) => r.path === 'references/style.md')?.content).toBe('# style');
  });

  it('throws on invalid repo format', async () => {
    await expect(fetchSkillFromGithub('not-a-valid-repo')).rejects.toThrow(
      /owner\/repo format/i
    );
  });

  it('throws when SKILL.md is 404', async () => {
    installFetchMock(() => new Response('Not Found', { status: 404 }));
    await expect(fetchSkillFromGithub('owner/missing')).rejects.toThrow(
      /SKILL\.md not found/i
    );
  });

  it('throws when frontmatter is missing required fields', async () => {
    installFetchMock(() => new Response('---\nname: only-name\n---\n\nbody', { status: 200 }));
    await expect(fetchSkillFromGithub('owner/repo')).rejects.toThrow(
      /missing required field: description/
    );
  });

  it('throws on rate limit (403 with X-RateLimit-Remaining: 0)', async () => {
    installFetchMock(() => new Response('rate limited', {
      status: 403,
      headers: { 'X-RateLimit-Remaining': '0' },
    }));
    await expect(fetchSkillFromGithub('owner/repo')).rejects.toThrow(
      /rate limit/i
    );
  });

  it('throws when SKILL.md is empty', async () => {
    installFetchMock(() => new Response('   \n  ', { status: 200 }));
    await expect(fetchSkillFromGithub('owner/repo')).rejects.toThrow(
      /SKILL\.md is empty/i
    );
  });

  it('throws when frontmatter name fails the skill-name regex', async () => {
    installFetchMock(() => new Response(
      '---\nname: invalid name with spaces\ndescription: ok\n---\n\nbody',
      { status: 200 }
    ));
    await expect(fetchSkillFromGithub('owner/repo')).rejects.toThrow(
      /frontmatter name "invalid name with spaces" is invalid/i
    );
  });

  it('throws when frontmatter name contains slashes or punctuation', async () => {
    installFetchMock(() => new Response(
      '---\nname: bad/name\ndescription: ok\n---\n\nbody',
      { status: 200 }
    ));
    await expect(fetchSkillFromGithub('owner/repo')).rejects.toThrow(
      /letters, numbers, hyphens, and underscores/i
    );
  });
});
