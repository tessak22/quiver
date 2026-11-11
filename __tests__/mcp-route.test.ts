/**
 * Tests for the remote MCP HTTP route (app/api/mcp/route.ts).
 *
 * Covers:
 *   - Authentication: Bearer token enforcement, and that an unset
 *     MCP_AUTH_SECRET is REFUSED outside development rather than waved through
 *   - Method routing: GET, POST, DELETE all delegate to the transport
 *   - Error handling: transport failures return 500 with a body (CLAUDE.md requirement)
 *   - No test hits the database — Prisma and MCP SDK are mocked
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// ── Mocks (hoisted before any imports) ──────────────────────────────────────

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

// Provide NextResponse in the test environment (next/server is not available in vitest/node)
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

vi.mock('@/lib/utils', () => ({
  safeErrorMessage: (err: unknown, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

// Controllable transport mock so error-handling tests can make it throw
const mockHandleRequest = vi.fn<[Request], Promise<Response>>().mockResolvedValue(
  Response.json({ jsonrpc: '2.0', result: {}, id: 1 }),
);

const mockConnect = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);

// Tool names registered on the most recent server the route built. The SDK
// lists exactly the registered tools on tools/list, so this is what a client
// would see.
let lastRegisteredTools: string[] = [];

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    constructor() {
      lastRegisteredTools = [];
    }
    tool(...args: unknown[]) {
      lastRegisteredTools.push(args[0] as string);
    }
    connect() {
      return mockConnect();
    }
  }
  return { McpServer: MockMcpServer };
});

vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => {
  class MockWebStandardStreamableHTTPServerTransport {
    handleRequest(req: Request) {
      return mockHandleRequest(req);
    }
  }
  return {
    WebStandardStreamableHTTPServerTransport:
      MockWebStandardStreamableHTTPServerTransport,
  };
});

// ── Route handlers ────────────────────────────────────────────────────────────

let GET: (req: Request) => Promise<Response>;
let POST: (req: Request) => Promise<Response>;
let DELETE: (req: Request) => Promise<Response>;

beforeAll(async () => {
  const mod = await import('@/app/api/mcp/route');
  GET = mod.GET;
  POST = mod.POST;
  DELETE = mod.DELETE;
});

afterEach(() => {
  mockHandleRequest.mockReset();
  mockHandleRequest.mockResolvedValue(
    Response.json({ jsonrpc: '2.0', result: {}, id: 1 }),
  );
  mockConnect.mockReset();
  mockConnect.mockResolvedValue(undefined);
  delete process.env.MCP_AUTH_SECRET;
  delete process.env.MCP_READONLY_SECRET;
  lastRegisteredTools = [];
});

// ── Authentication ────────────────────────────────────────────────────────────

describe('authentication', () => {
  it('refuses every request when MCP_AUTH_SECRET is not set', async () => {
    // This endpoint carries the delete tools and sits in PUBLIC_ROUTES, so an
    // unset secret used to mean an anonymous read, write and delete API on
    // whatever URL the deploy button produced.
    delete process.env.MCP_AUTH_SECRET;
    const res = await POST(new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-123' },
      }));
    expect(res.status).toBe(401);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('says the deployment is unconfigured, not that the caller got it wrong', async () => {
    delete process.env.MCP_AUTH_SECRET;
    const res = await POST(new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-123' },
      }));
    const body = (await res.json()) as { hint?: string };
    expect(body.hint).toContain('not set on this deployment');
  });

  it('accepts a correct token', async () => {
    process.env.MCP_AUTH_SECRET = 'super-secret-123';
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-123' },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockHandleRequest).toHaveBeenCalledOnce();
  });

  it('rejects requests with no Authorization header when secret is configured', async () => {
    process.env.MCP_AUTH_SECRET = 'super-secret-123';
    const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('rejects requests with a wrong token', async () => {
    process.env.MCP_AUTH_SECRET = 'super-secret-123';
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong-token' },
      }),
    );
    expect(res.status).toBe(401);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('rejects non-Bearer auth schemes', async () => {
    process.env.MCP_AUTH_SECRET = 'super-secret-123';
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Basic dXNlcjpwYXNz' },
      }),
    );
    expect(res.status).toBe(401);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('allows requests with the correct Bearer token', async () => {
    process.env.MCP_AUTH_SECRET = 'super-secret-123';
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-123' },
      }),
    );
    expect(res.status).toBe(200);
    expect(mockHandleRequest).toHaveBeenCalledOnce();
  });

  it('includes a hint in the 401 body', async () => {
    process.env.MCP_AUTH_SECRET = 'super-secret-123';
    const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));
    const body = await res.json();
    expect(body).toHaveProperty('error', 'Unauthorized');
    expect(body).toHaveProperty('hint');
  });
});

// ── Method routing ────────────────────────────────────────────────────────────

describe('method routing', () => {
  beforeEach(() => {
    process.env.MCP_AUTH_SECRET = 'super-secret-123';
  });

  it('routes GET requests to the transport', async () => {
    const req = new Request('http://localhost/api/mcp', {
        method: 'GET',
        headers: { Authorization: 'Bearer super-secret-123' },
      });
    await GET(req);
    expect(mockHandleRequest).toHaveBeenCalledWith(req);
  });

  it('routes POST requests to the transport', async () => {
    const req = new Request('http://localhost/api/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0' },
        },
        id: 1,
      }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer super-secret-123',
      },
    });
    await POST(req);
    expect(mockHandleRequest).toHaveBeenCalledWith(req);
  });

  it('routes DELETE requests to the transport', async () => {
    const req = new Request('http://localhost/api/mcp', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer super-secret-123' },
      });
    await DELETE(req);
    expect(mockHandleRequest).toHaveBeenCalledWith(req);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  beforeEach(() => {
    process.env.MCP_AUTH_SECRET = 'super-secret-123';
  });

  it('returns 500 with a JSON body when the transport throws', async () => {
    mockHandleRequest.mockRejectedValue(new Error('transport exploded'));
    const res = await POST(new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-123' },
      }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });

  it('never returns a 500 with no body (CLAUDE.md requirement)', async () => {
    mockHandleRequest.mockRejectedValue(new Error('boom'));
    const res = await POST(new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-123' },
      }));
    // Body must be parseable JSON, not empty
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('returns 500 with a JSON body when server.connect() throws', async () => {
    mockConnect.mockRejectedValue(new Error('connect failed'));
    const res = await POST(new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer super-secret-123' },
      }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    // Transport should not have been called since connect() failed first
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });
});

// ── Read-only key ─────────────────────────────────────────────────────────────

function rpc(token: string, body: unknown): Request {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${token}`,
    },
  });
}

const LIST = { jsonrpc: '2.0', method: 'tools/list', params: {}, id: 1 };
const callTool = (name: string, id: number | string = 2) => ({
  jsonrpc: '2.0',
  method: 'tools/call',
  params: { name, arguments: {} },
  id,
});

describe('read-only key', () => {
  beforeEach(() => {
    process.env.MCP_AUTH_SECRET = 'full-secret-123';
    process.env.MCP_READONLY_SECRET = 'readonly-secret-456';
  });

  it('registers only get_* and list_* tools for the read-only token', async () => {
    const res = await POST(rpc('readonly-secret-456', LIST));
    expect(res.status).toBe(200);
    expect(lastRegisteredTools.length).toBeGreaterThan(0);
    for (const name of lastRegisteredTools) {
      expect(name).toMatch(/^(get|list)_/);
    }
    expect(lastRegisteredTools).toContain('get_context');
    expect(lastRegisteredTools).not.toContain('save_artifact');
    expect(lastRegisteredTools).not.toContain('delete_artifact');
    expect(lastRegisteredTools).not.toContain('apply_context_update');
  });

  it('rejects a tools/call of save_artifact with 403 and a JSON-RPC error', async () => {
    const res = await POST(rpc('readonly-secret-456', callTool('save_artifact', 7)));
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      jsonrpc: string;
      id: unknown;
      error: { code: number; message: string };
    };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(7);
    expect(body.error.message).toContain('save_artifact');
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('rejects a write call hidden inside a JSON-RPC batch', async () => {
    const res = await POST(
      rpc('readonly-secret-456', [callTool('get_context', 1), callTool('delete_campaign', 2)]),
    );
    expect(res.status).toBe(403);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('lets the read-only token call a read tool', async () => {
    const res = await POST(rpc('readonly-secret-456', callTool('get_context')));
    expect(res.status).toBe(200);
    expect(mockHandleRequest).toHaveBeenCalledOnce();
  });

  it('gives the full token every tool, including writes', async () => {
    const res = await POST(rpc('full-secret-123', LIST));
    expect(res.status).toBe(200);
    expect(lastRegisteredTools).toContain('save_artifact');
    expect(lastRegisteredTools).toContain('delete_artifact');
    expect(lastRegisteredTools).toContain('apply_context_update');
    expect(lastRegisteredTools).toContain('get_context');
  });

  it('lets the full token call a write tool', async () => {
    const res = await POST(rpc('full-secret-123', callTool('save_artifact')));
    expect(res.status).toBe(200);
    expect(mockHandleRequest).toHaveBeenCalledOnce();
  });

  it('returns 401 for a wrong token', async () => {
    const res = await POST(rpc('not-a-real-token', LIST));
    expect(res.status).toBe(401);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('rejects the read-only token when MCP_READONLY_SECRET is unset', async () => {
    delete process.env.MCP_READONLY_SECRET;
    const res = await POST(rpc('readonly-secret-456', LIST));
    expect(res.status).toBe(401);
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });

  it('rejects an empty bearer when MCP_READONLY_SECRET is set to an empty string', async () => {
    process.env.MCP_READONLY_SECRET = '';
    const res = await POST(
      new Request('http://localhost/api/mcp', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the read-only token even when MCP_AUTH_SECRET is unset', async () => {
    delete process.env.MCP_AUTH_SECRET;
    const res = await POST(rpc('readonly-secret-456', LIST));
    expect(res.status).toBe(200);
    expect(lastRegisteredTools).not.toContain('save_artifact');
  });
});
