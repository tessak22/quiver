/**
 * Regression test for the 60s dedupe guard on MCP create/save tools.
 *
 * Proves the pattern via save_artifact specifically. Other entities
 * (campaign, content, research) follow the identical pattern — no per-entity
 * dedupe test needed; the fidelity gain doesn't justify the unit cost, and
 * this is not a hot code path.
 *
 * What this verifies:
 *   1. When prisma.artifact.findFirst returns a recent matching row, the
 *      handler returns it with `_duplicate: true` and createArtifact is NOT
 *      called (no duplicate insert).
 *   2. When findFirst returns null, createArtifact IS called as before.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MCP server so we can capture the registered handler and invoke it.
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    handlers = new Map<string, (args: unknown) => unknown>();
    tool(name: string, _desc: string, _schema: unknown, handler: (args: unknown) => unknown) {
      this.handlers.set(name, handler);
    }
  }
  return { McpServer: MockMcpServer };
});

// Mock prisma singleton with just the methods our handler touches.
vi.mock('@/lib/db', () => ({
  prisma: {
    artifact: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock the artifact lib functions used by the tool module.
vi.mock('@/lib/db/artifacts', () => ({
  getArtifact: vi.fn(),
  getArtifacts: vi.fn(),
  createArtifact: vi.fn(),
  createArtifactVersion: vi.fn(),
  transitionArtifactStatus: vi.fn(),
}));

// Mock MCP response helpers — passthrough so we can assert payloads.
vi.mock('../mcp/lib/response.js', () => ({
  text: (content: string) => ({ content: [{ type: 'text', text: content }] }),
  error: (message: string) => ({
    content: [{ type: 'text', text: message }],
    isError: true,
  }),
}));

// Mock resolvers so resolveCampaignId returns a deterministic campaign id.
vi.mock('../mcp/lib/resolvers.js', () => ({
  resolveCampaignId: vi.fn(async () => 'campaign-123'),
}));

import { registerArtifactTools } from '@/mcp/tools/artifacts';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/db';
import { createArtifact } from '@/lib/db/artifacts';

type MockServer = InstanceType<typeof McpServer> & {
  handlers: Map<string, (args: unknown) => Promise<unknown>>;
};

const prismaMock = prisma as unknown as {
  artifact: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};
const createArtifactMock = createArtifact as unknown as ReturnType<typeof vi.fn>;

function getSaveArtifactHandler(): (args: unknown) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}> {
  const server = new McpServer({ name: 'test', version: '0.0.0' }) as MockServer;
  registerArtifactTools(server);
  const handler = server.handlers.get('save_artifact');
  if (!handler) throw new Error('save_artifact handler not registered');
  return handler as (args: unknown) => Promise<{
    content: { type: string; text: string }[];
    isError?: boolean;
  }>;
}

const baseArgs = {
  title: 'Retry Headline',
  type: 'copywriting',
  content: '# Copy body',
};

describe('save_artifact 60s dedupe guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns existing row with _duplicate:true when a recent match exists (no insert)', async () => {
    const existing = {
      id: 'art-existing',
      title: baseArgs.title,
      type: baseArgs.type,
      content: baseArgs.content,
      campaignId: 'campaign-123',
      createdBy: 'mcp',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.artifact.findFirst.mockResolvedValue(existing);

    const handler = getSaveArtifactHandler();
    const result = await handler(baseArgs);

    expect(prismaMock.artifact.findFirst).toHaveBeenCalledTimes(1);
    const whereArg = prismaMock.artifact.findFirst.mock.calls[0][0].where;
    expect(whereArg.campaignId).toBe('campaign-123');
    expect(whereArg.title).toBe(baseArgs.title);
    expect(whereArg.type).toBe(baseArgs.type);
    expect(whereArg.createdAt.gte).toBeInstanceOf(Date);
    // Window is ~60s back from now
    const windowMs = Date.now() - whereArg.createdAt.gte.getTime();
    expect(windowMs).toBeGreaterThanOrEqual(60_000 - 1000);
    expect(windowMs).toBeLessThanOrEqual(60_000 + 1000);

    // createArtifact must NOT be called
    expect(createArtifactMock).not.toHaveBeenCalled();

    // Response wraps the existing row with _duplicate: true
    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed._duplicate).toBe(true);
    expect(parsed.id).toBe('art-existing');
    expect(parsed.title).toBe(baseArgs.title);
  });

  it('calls createArtifact when no recent match exists', async () => {
    prismaMock.artifact.findFirst.mockResolvedValue(null);
    const created = {
      id: 'art-new',
      title: baseArgs.title,
      type: baseArgs.type,
      content: baseArgs.content,
      campaignId: 'campaign-123',
      createdBy: 'mcp',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    createArtifactMock.mockResolvedValue(created);

    const handler = getSaveArtifactHandler();
    const result = await handler(baseArgs);

    expect(prismaMock.artifact.findFirst).toHaveBeenCalledTimes(1);
    expect(createArtifactMock).toHaveBeenCalledTimes(1);
    expect(createArtifactMock.mock.calls[0][0]).toMatchObject({
      title: baseArgs.title,
      type: baseArgs.type,
      content: baseArgs.content,
      campaignId: 'campaign-123',
      createdBy: 'mcp',
    });

    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe('art-new');
    expect(parsed._duplicate).toBeUndefined();
  });
});
