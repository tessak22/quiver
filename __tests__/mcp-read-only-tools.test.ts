/**
 * Tests for the read-only MCP tool allowlist (mcp/lib/read-only-tools.ts).
 *
 * The allowlist is explicit rather than a prefix match, so these tests guard
 * the two ways it can drift: a name that is not a read tool sneaking in, and
 * a listed name that no longer matches a registered tool.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@prisma/client', () => {
  class MockPrismaClient {}
  return {
    PrismaClient: MockPrismaClient,
    Prisma: { AnyNull: null, DbNull: null, InputJsonValue: null },
  };
});

vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {}
  return { default: MockAnthropic };
});

const registeredTools: string[] = [];

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    tool(...args: unknown[]) {
      registeredTools.push(args[0] as string);
    }
  }
  return { McpServer: MockMcpServer };
});

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { READ_ONLY_TOOLS } from '@/mcp/lib/read-only-tools';
import { registerContextTools } from '@/mcp/tools/context';
import { registerCampaignTools } from '@/mcp/tools/campaigns';
import { registerArtifactTools } from '@/mcp/tools/artifacts';
import { registerSessionTools } from '@/mcp/tools/sessions';
import { registerPerformanceTools } from '@/mcp/tools/performance';
import { registerWorkspaceTools } from '@/mcp/tools/workspace';
import { registerResearchTools } from '@/mcp/tools/research';
import { registerContentTools } from '@/mcp/tools/content';

describe('READ_ONLY_TOOLS', () => {
  const server = new McpServer({ name: 'test', version: '0' });
  registerContextTools(server);
  registerCampaignTools(server);
  registerArtifactTools(server);
  registerSessionTools(server);
  registerPerformanceTools(server);
  registerWorkspaceTools(server);
  registerResearchTools(server);
  registerContentTools(server);

  it('contains only get_* and list_* names', () => {
    for (const name of READ_ONLY_TOOLS) {
      expect(name).toMatch(/^(get|list)_[a-z_]+$/);
    }
  });

  it('names only tools that are actually registered', () => {
    for (const name of READ_ONLY_TOOLS) {
      expect(registeredTools).toContain(name);
    }
  });

  it('covers every registered get_* and list_* tool', () => {
    const reads = registeredTools.filter((n) => /^(get|list)_/.test(n));
    expect([...READ_ONLY_TOOLS].sort()).toEqual([...new Set(reads)].sort());
  });
});
