/**
 * Remote MCP HTTP endpoint — app/api/mcp/route.ts
 *
 * Exposes all Quiver tools over the MCP Streamable HTTP transport, making
 * them accessible to Claude browser Custom Connectors and any MCP client
 * that supports HTTP (not just local stdio clients like Claude Desktop).
 *
 * Connector URL (once deployed): https://<your-domain>/api/mcp
 *
 * Reads:  All lib/db/* modules via the mcp/tools/* registration functions.
 * Produces: MCP Streamable HTTP responses for GET, POST, and DELETE.
 *
 * Edge cases:
 *   - Stateless mode: each request creates a fresh server + transport.
 *     No shared in-memory session state between requests — compatible with
 *     Vercel serverless where instances don't share memory across invocations.
 *   - Auth: set MCP_AUTH_SECRET in env for Bearer token protection. Omit the
 *     env var to allow unauthenticated access (useful on localhost or inside
 *     a private VPC). Claude browser connectors send the token automatically
 *     once configured.
 *   - Timeout: maxDuration 60 s covers all read tools comfortably. Upgrade to
 *     Vercel Pro and raise maxDuration to 300 if heavy write tools time out.
 */

import { NextResponse } from 'next/server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { safeErrorMessage } from '@/lib/utils';

// Tool registration functions live in mcp/tools/ (excluded from root tsconfig
// to keep the stdio build separate), but tsc resolves explicit imports even
// across the exclude boundary, and Next.js webpack follows the same path.
import { registerContextTools } from '@/mcp/tools/context';
import { registerCampaignTools } from '@/mcp/tools/campaigns';
import { registerArtifactTools } from '@/mcp/tools/artifacts';
import { registerSessionTools } from '@/mcp/tools/sessions';
import { registerPerformanceTools } from '@/mcp/tools/performance';
import { registerWorkspaceTools } from '@/mcp/tools/workspace';
import { registerResearchTools } from '@/mcp/tools/research';
import { registerContentTools } from '@/mcp/tools/content';

// Prisma requires the Node.js runtime (no Edge runtime support).
export const runtime = 'nodejs';

// Adjust to match your Vercel plan: 60 s (Hobby) or up to 300 s (Pro).
export const maxDuration = 60;

/** Build a fresh McpServer with all 34 Quiver tools registered. */
function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'quiver', version: '1.0.0' });

  registerContextTools(server);
  registerCampaignTools(server);
  registerArtifactTools(server);
  registerSessionTools(server);
  registerPerformanceTools(server);
  registerWorkspaceTools(server);
  registerResearchTools(server);
  registerContentTools(server);

  return server;
}

/**
 * Returns true when the request passes authentication.
 *
 * If MCP_AUTH_SECRET is not set, all requests are allowed (internal/localhost use).
 * If it is set, the request must carry `Authorization: Bearer <secret>`.
 */
function isAuthenticated(request: Request): boolean {
  const secret = process.env.MCP_AUTH_SECRET;
  if (!secret) return true;

  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;

  const spaceIdx = authHeader.indexOf(' ');
  if (spaceIdx === -1) return false;

  const scheme = authHeader.slice(0, spaceIdx);
  const token = authHeader.slice(spaceIdx + 1);
  return scheme === 'Bearer' && token === secret;
}

async function handleRequest(request: Request): Promise<Response> {
  if (!isAuthenticated(request)) {
    return NextResponse.json(
      {
        error: 'Unauthorized',
        hint: 'Set Authorization: Bearer <MCP_AUTH_SECRET> in your connector config.',
      },
      { status: 401 },
    );
  }

  try {
    const server = createMcpServer();

    // Stateless mode (sessionIdGenerator: undefined): no session ID is issued
    // and no session state is retained between requests. Required for Vercel
    // serverless where each invocation may run on a different instance.
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    return await transport.handleRequest(request);
  } catch (err) {
    return NextResponse.json(
      { error: safeErrorMessage(err, 'Failed to process MCP request') },
      { status: 500 },
    );
  }
}

// The MCP Streamable HTTP spec uses POST for JSON-RPC messages,
// GET for optional SSE streams, and DELETE to close sessions.
export { handleRequest as GET, handleRequest as POST, handleRequest as DELETE };
