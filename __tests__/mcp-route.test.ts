/**
 * Tests for the remote MCP HTTP route (app/api/mcp/route.ts).
 *
 * Covers:
 *   - Authentication: Bearer token enforcement when MCP_AUTH_SECRET is set
 *   - Method routing: GET, POST, DELETE all delegate to the transport
 *   - Error handling: transport failures return 500 with a body (CLAUDE.md requirement)
 *   - No test hits the database — Prisma and MCP SDK are mocked
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

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
const mockHandleRequest = vi.fn<[Request], Promise<Response>>();

const mockConnect = vi.fn<[], Promise<void>>().mockResolvedValue(undefined);

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class MockMcpServer {
    tool(..._args: unknown[]) {}
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
});

// ── Authentication ────────────────────────────────────────────────────────────

describe('authentication', () => {
  it('allows all requests when MCP_AUTH_SECRET is not set', async () => {
    delete process.env.MCP_AUTH_SECRET;
    const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));
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
  it('routes GET requests to the transport', async () => {
    const req = new Request('http://localhost/api/mcp', { method: 'GET' });
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
      headers: { 'Content-Type': 'application/json' },
    });
    await POST(req);
    expect(mockHandleRequest).toHaveBeenCalledWith(req);
  });

  it('routes DELETE requests to the transport', async () => {
    const req = new Request('http://localhost/api/mcp', { method: 'DELETE' });
    await DELETE(req);
    expect(mockHandleRequest).toHaveBeenCalledWith(req);
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('error handling', () => {
  it('returns 500 with a JSON body when the transport throws', async () => {
    mockHandleRequest.mockRejectedValue(new Error('transport exploded'));
    const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
  });

  it('never returns a 500 with no body (CLAUDE.md requirement)', async () => {
    mockHandleRequest.mockRejectedValue(new Error('boom'));
    const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));
    // Body must be parseable JSON, not empty
    const text = await res.text();
    expect(text.length).toBeGreaterThan(0);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('returns 500 with a JSON body when server.connect() throws', async () => {
    mockConnect.mockRejectedValue(new Error('connect failed'));
    const res = await POST(new Request('http://localhost/api/mcp', { method: 'POST' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    // Transport should not have been called since connect() failed first
    expect(mockHandleRequest).not.toHaveBeenCalled();
  });
});
