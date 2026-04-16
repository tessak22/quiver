/**
 * Regression test for the explicit-slug branch of the save_content dedupe guard.
 *
 * The generic retry-dedupe behavior is covered by mcp-dedupe-artifact.test.ts.
 * This file specifically verifies the content-only identity-key branching:
 *
 *   - When args.slug is provided, dedupe matches on (slug, createdBy='mcp').
 *     A retry with the same explicit slug gracefully returns the existing row
 *     instead of falling through to a Prisma P2002 unique-slug collision.
 *   - When args.slug is absent, dedupe matches on (title, contentType, createdBy='mcp')
 *     as before; the explicit-slug branch is not taken.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the MCP server so we can capture and invoke the registered handler.
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    handlers = new Map<string, (args: unknown) => unknown>();
    tool(name: string, _desc: string, _schema: unknown, handler: (args: unknown) => unknown) {
      this.handlers.set(name, handler);
    }
  }
  return { McpServer: MockMcpServer };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    contentPiece: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db/content', () => ({
  createContentPiece: vi.fn(),
  updateContentPiece: vi.fn(),
  getContentPiece: vi.fn(),
  getContentPieceBySlug: vi.fn(),
  getContentPieces: vi.fn(),
  addDistribution: vi.fn(),
  addMetricSnapshot: vi.fn(),
  getMetricSnapshots: vi.fn(),
  generateSlug: vi.fn(async (title: string) => title.toLowerCase().replace(/\s+/g, '-')),
  getContentPerformanceSignal: vi.fn(),
  findContentPiecesByTitle: vi.fn(),
  getContentPiecesForCalendar: vi.fn(),
  deleteContentPiece: vi.fn(),
}));

vi.mock('@/lib/db/context', () => ({
  getActiveContext: vi.fn(async () => ({ id: 'ctx-1', version: 1 })),
}));

vi.mock('../mcp/lib/response.js', () => ({
  text: (content: string) => ({ content: [{ type: 'text', text: content }] }),
  error: (message: string) => ({
    content: [{ type: 'text', text: message }],
    isError: true,
  }),
}));

vi.mock('../mcp/lib/resolvers.js', () => ({
  resolveCampaignId: vi.fn(async () => 'campaign-123'),
}));

import { registerContentTools } from '@/mcp/tools/content';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@/lib/db';
import { createContentPiece } from '@/lib/db/content';

type MockServer = InstanceType<typeof McpServer> & {
  handlers: Map<string, (args: unknown) => Promise<unknown>>;
};

const prismaMock = prisma as unknown as {
  contentPiece: {
    findFirst: ReturnType<typeof vi.fn>;
  };
};
const createContentPieceMock = createContentPiece as unknown as ReturnType<typeof vi.fn>;

function getSaveContentHandler(): (args: unknown) => Promise<{
  content: { type: string; text: string }[];
  isError?: boolean;
}> {
  const server = new McpServer({ name: 'test', version: '0.0.0' }) as MockServer;
  registerContentTools(server);
  const handler = server.handlers.get('save_content');
  if (!handler) throw new Error('save_content handler not registered');
  return handler as (args: unknown) => Promise<{
    content: { type: string; text: string }[];
    isError?: boolean;
  }>;
}

describe('save_content 60s dedupe guard — explicit-slug branch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches on slug when caller provides explicit slug', async () => {
    const existing = {
      id: 'cp-existing',
      title: 'First Try Title',
      slug: 'retry-slug',
      contentType: 'blog_post',
      status: 'draft',
      body: '# body',
      createdBy: 'mcp',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.contentPiece.findFirst.mockResolvedValue(existing);

    const handler = getSaveContentHandler();
    const result = await handler({
      title: 'Different Title On Retry',
      body: '# retry body',
      content_type: 'blog_post',
      slug: 'retry-slug',
      status: 'draft',
    });

    // Predicate is slug-based (most specific key), scoped to MCP, windowed to 60s.
    expect(prismaMock.contentPiece.findFirst).toHaveBeenCalledTimes(1);
    const whereArg = prismaMock.contentPiece.findFirst.mock.calls[0][0].where;
    expect(whereArg.slug).toBe('retry-slug');
    expect(whereArg.createdBy).toBe('mcp');
    expect(whereArg.createdAt.gte).toBeInstanceOf(Date);
    expect(whereArg.title).toBeUndefined();
    expect(whereArg.contentType).toBeUndefined();

    // Insert must NOT be called — this is the retry-safety contract.
    expect(createContentPieceMock).not.toHaveBeenCalled();

    // Response is the existing row plus _duplicate:true and the public URL.
    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed._duplicate).toBe(true);
    expect(parsed.id).toBe('cp-existing');
    expect(parsed.slug).toBe('retry-slug');
    expect(parsed.public_api_url).toBe('/api/public/content/retry-slug');
  });

  it('falls back to (title, contentType) predicate when no slug is provided', async () => {
    prismaMock.contentPiece.findFirst.mockResolvedValue(null);
    createContentPieceMock.mockResolvedValue({
      id: 'cp-new',
      title: 'Fresh Post',
      slug: 'fresh-post',
      contentType: 'blog_post',
      status: 'draft',
      body: '# body',
      createdBy: 'mcp',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const handler = getSaveContentHandler();
    await handler({
      title: 'Fresh Post',
      body: '# body',
      content_type: 'blog_post',
      status: 'draft',
    });

    expect(prismaMock.contentPiece.findFirst).toHaveBeenCalledTimes(1);
    const whereArg = prismaMock.contentPiece.findFirst.mock.calls[0][0].where;
    expect(whereArg.slug).toBeUndefined();
    expect(whereArg.title).toBe('Fresh Post');
    expect(whereArg.contentType).toBe('blog_post');
    expect(whereArg.createdBy).toBe('mcp');
    expect(createContentPieceMock).toHaveBeenCalledTimes(1);
  });

  it('proceeds to insert when explicit slug has no recent match', async () => {
    prismaMock.contentPiece.findFirst.mockResolvedValue(null);
    createContentPieceMock.mockResolvedValue({
      id: 'cp-new-with-slug',
      title: 'Intentional Piece',
      slug: 'intentional-slug',
      contentType: 'blog_post',
      status: 'draft',
      body: '# body',
      createdBy: 'mcp',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const handler = getSaveContentHandler();
    const result = await handler({
      title: 'Intentional Piece',
      body: '# body',
      content_type: 'blog_post',
      slug: 'intentional-slug',
      status: 'draft',
    });

    expect(prismaMock.contentPiece.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMock.contentPiece.findFirst.mock.calls[0][0].where.slug).toBe('intentional-slug');
    expect(createContentPieceMock).toHaveBeenCalledTimes(1);
    expect(createContentPieceMock.mock.calls[0][0]).toMatchObject({
      slug: 'intentional-slug',
      title: 'Intentional Piece',
    });

    expect(result.isError).not.toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe('cp-new-with-slug');
    expect(parsed._duplicate).toBeUndefined();
  });
});
